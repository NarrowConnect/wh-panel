package queues

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync/atomic"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/websocket"
	"wh-panel/pkg/redis"
)

type Service struct {
	db            *sqlx.DB
	redisClient   *redis.Client
	wsHub         *websocket.Hub
	memoryCounter uint64
}

func NewService(db *sqlx.DB, redisClient *redis.Client, wsHub *websocket.Hub) *Service {
	return &Service{
		db:          db,
		redisClient: redisClient,
		wsHub:       wsHub,
	}
}

// EvaluateAndRouteConversation applies queue rules to a conversation and assigns an operator based on queue allocation strategy
func (s *Service) EvaluateAndRouteConversation(ctx context.Context, companyID, conversationID uuid.UUID) (*uuid.UUID, *uuid.UUID, error) {
	var conv models.Conversation
	err := s.db.GetContext(ctx, &conv, `SELECT id, company_id, contact_id, channel_id, assigned_user_id, queue_id, status FROM conversations WHERE id = $1 AND company_id = $2`, conversationID, companyID)
	if err != nil {
		return nil, nil, fmt.Errorf("conversation not found: %w", err)
	}

	var rules []models.QueueRule
	ruleQuery := `SELECT id, queue_id, company_id, priority, condition_type, condition_key, condition_operator, condition_value 
		FROM queue_rules WHERE company_id = $1 ORDER BY priority ASC`
	_ = s.db.SelectContext(ctx, &rules, ruleQuery, companyID)

	var matchedQueueID *uuid.UUID

	for _, rule := range rules {
		if s.matchRule(ctx, conv, rule) {
			qID := rule.QueueID
			matchedQueueID = &qID
			log.Printf("[QueueRouting] Conversation %s matched queue rule %s -> Queue %s", conversationID, rule.ID, rule.QueueID)
			break
		}
	}

	if matchedQueueID == nil {
		var defaultQueueID uuid.UUID
		err := s.db.GetContext(ctx, &defaultQueueID, `SELECT id FROM queues WHERE company_id = $1 AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`, companyID)
		if err == nil {
			matchedQueueID = &defaultQueueID
		} else {
			return nil, nil, nil
		}
	}

	var assignedUserID *uuid.UUID
	var queue models.Queue
	err = s.db.GetContext(ctx, &queue, `SELECT id, company_id, name, allocation_strategy FROM queues WHERE id = $1`, matchedQueueID)
	if err == nil {
		assignedUserID, err = s.AssignOperatorByStrategy(ctx, companyID, *matchedQueueID, queue.AllocationStrategy)
		if err != nil {
			log.Printf("[QueueRouting] Warning executing strategy %s: %v", queue.AllocationStrategy, err)
		}
	}

	// If no operator available in queue, send alert to supervisors via WebSocket
	if assignedUserID == nil && s.wsHub != nil {
		s.wsHub.BroadcastToCompany(companyID.String(), "unassigned_queue_alert", map[string]interface{}{
			"conversation_id": conversationID,
			"queue_id":        matchedQueueID,
			"queue_name":      queue.Name,
			"message":         "Conversa aguardando atendimento em fila sem operadores ativos disponíveis.",
		})
	}

	updateQuery := `UPDATE conversations SET queue_id = $1, assigned_user_id = COALESCE($2, assigned_user_id), updated_at = CURRENT_TIMESTAMP WHERE id = $3`
	_, _ = s.db.ExecContext(ctx, updateQuery, matchedQueueID, assignedUserID, conversationID)

	return matchedQueueID, assignedUserID, nil
}

func (s *Service) matchRule(ctx context.Context, conv models.Conversation, rule models.QueueRule) bool {
	op := strings.ToLower(rule.ConditionOperator)

	switch rule.ConditionType {
	case "channel":
		if conv.ChannelID != nil {
			return evaluateCondition(conv.ChannelID.String(), op, rule.ConditionValue)
		}

	case "tag":
		var tags []string
		_ = s.db.SelectContext(ctx, &tags, `SELECT t.name FROM tags t JOIN conversation_tags ct ON ct.tag_id = t.id WHERE ct.conversation_id = $1`, conv.ID)
		for _, t := range tags {
			if evaluateCondition(t, op, rule.ConditionValue) {
				return true
			}
		}

	case "custom_field":
		if rule.ConditionKey != nil {
			var val string
			err := s.db.GetContext(ctx, &val, `SELECT cv.value FROM contact_custom_values cv JOIN custom_fields cf ON cf.id = cv.custom_field_id WHERE cv.contact_id = $1 AND cf.key = $2`, conv.ContactID, *rule.ConditionKey)
			if err == nil {
				return evaluateCondition(val, op, rule.ConditionValue)
			}
		}
	}

	return false
}

func evaluateCondition(targetValue, operator, ruleValue string) bool {
	targetLower := strings.ToLower(strings.TrimSpace(targetValue))
	ruleLower := strings.ToLower(strings.TrimSpace(ruleValue))

	switch operator {
	case "contains":
		return strings.Contains(targetLower, ruleLower)
	case "in":
		parts := strings.Split(ruleLower, ",")
		for _, p := range parts {
			if strings.TrimSpace(p) == targetLower {
				return true
			}
		}
		return false
	case "equals":
		fallthrough
	default:
		return targetLower == ruleLower
	}
}

// AssignOperatorByStrategy selects an operator based on round_robin, least_busy, or manual strategy
func (s *Service) AssignOperatorByStrategy(ctx context.Context, companyID, queueID uuid.UUID, strategy string) (*uuid.UUID, error) {
	var operators []models.User
	query := `SELECT u.id, u.name, u.email, u.role FROM users u JOIN queue_users qu ON qu.user_id = u.id WHERE qu.queue_id = $1 AND u.status = 'active'`
	err := s.db.SelectContext(ctx, &operators, query, queueID)
	if err != nil || len(operators) == 0 {
		return nil, nil
	}

	switch strategy {
	case "round_robin":
		var nextIdx int64 = 0
		if s.redisClient != nil {
			redisKey := fmt.Sprintf("tenant:%s:queue:%s:rr_counter", companyID, queueID)
			val, err := s.redisClient.Raw().Incr(ctx, redisKey).Result()
			if err == nil {
				nextIdx = (val - 1) % int64(len(operators))
			} else {
				// Memory fallback if Redis is down
				count := atomic.AddUint64(&s.memoryCounter, 1)
				nextIdx = int64((count - 1) % uint64(len(operators)))
			}
		} else {
			count := atomic.AddUint64(&s.memoryCounter, 1)
			nextIdx = int64((count - 1) % uint64(len(operators)))
		}
		opID := operators[nextIdx].ID
		return &opID, nil

	case "least_busy":
		var selectedID uuid.UUID
		minCount := 999999

		for _, op := range operators {
			var openCount int
			_ = s.db.GetContext(ctx, &openCount, `SELECT COUNT(*) FROM conversations WHERE company_id = $1 AND assigned_user_id = $2 AND status = 'open'`, companyID, op.ID)
			if openCount < minCount {
				minCount = openCount
				selectedID = op.ID
			}
		}
		if selectedID != uuid.Nil {
			return &selectedID, nil
		}

	case "manual":
		return nil, nil
	}

	opID := operators[0].ID
	return &opID, nil
}
