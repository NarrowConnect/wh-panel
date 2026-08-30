package flows

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/websocket"
)

const maxFlowDepth = 50 // Safety limit to prevent infinite loops in cyclic graphs

type Engine struct {
	db    *sqlx.DB
	wsHub *websocket.Hub
}

func NewEngine(db *sqlx.DB, wsHub *websocket.Hub) *Engine {
	return &Engine{
		db:    db,
		wsHub: wsHub,
	}
}

// ExecuteFlow starts interpreting the flow graph for a conversation
func (e *Engine) ExecuteFlow(ctx context.Context, companyID, flowID, conversationID uuid.UUID) (*models.FlowExecution, error) {
	// 1. Fetch Flow definition
	var flow models.Flow
	err := e.db.GetContext(ctx, &flow, `SELECT id, company_id, name, definition_json, status FROM flows WHERE id = $1 AND company_id = $2`, flowID, companyID)
	if err != nil {
		return nil, fmt.Errorf("flow not found: %w", err)
	}

	if flow.Status != "active" {
		return nil, fmt.Errorf("flow is not active (current status: %s)", flow.Status)
	}

	var def models.FlowDefinition
	if err := json.Unmarshal([]byte(flow.DefinitionJSON), &def); err != nil {
		return nil, fmt.Errorf("invalid flow JSON definition: %w", err)
	}

	if len(def.Nodes) == 0 {
		return nil, fmt.Errorf("flow has no nodes defined")
	}

	// 2. Fetch Conversation
	var conv models.Conversation
	err = e.db.GetContext(ctx, &conv, `SELECT id, company_id, contact_id FROM conversations WHERE id = $1 AND company_id = $2`, conversationID, companyID)
	if err != nil {
		return nil, fmt.Errorf("conversation not found: %w", err)
	}

	// Find starting node (node with type 'send_message' or first node)
	startNode := def.Nodes[0]

	execID := uuid.New()
	query := `INSERT INTO flow_executions (id, flow_id, company_id, conversation_id, contact_id, current_node_id, status, context_json)
		VALUES ($1, $2, $3, $4, $5, $6, 'running', '{}'::jsonb)
		RETURNING id, flow_id, company_id, conversation_id, contact_id, current_node_id, status, context_json, created_at, updated_at`

	var exec models.FlowExecution
	err = e.db.GetContext(ctx, &exec, query, execID, flowID, companyID, conversationID, conv.ContactID, startNode.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to create flow execution: %w", err)
	}

	// Run step asynchronously for initial nodes
	go func() {
		e.processNode(context.Background(), exec, def, startNode, 0)
	}()

	return &exec, nil
}

func (e *Engine) processNode(ctx context.Context, exec models.FlowExecution, def models.FlowDefinition, node models.FlowNode, depth int) {
	// Safety check: prevent infinite loops
	if depth >= maxFlowDepth {
		log.Printf("[FlowEngine] WARNING: Flow %s hit maximum depth (%d). Terminating to prevent infinite loop.", exec.FlowID, maxFlowDepth)
		_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, exec.ID)
		return
	}

	log.Printf("[FlowEngine] Processing node %s (type: %s) for flow %s [depth=%d]", node.ID, node.Type, exec.FlowID, depth)

	switch node.Type {
	case "send_message":
		msgBody, _ := node.Data["message"].(string)
		if msgBody != "" {
			// Replace contact placeholders {{contact.name}}, {{contact.phone}}, {{contact.email}}
			var contact models.Contact
			_ = e.db.GetContext(ctx, &contact, `SELECT name, phone, email FROM contacts WHERE id = $1`, exec.ContactID)
			msgBody = strings.ReplaceAll(msgBody, "{{contact.name}}", contact.Name)
			if contact.Phone != nil {
				msgBody = strings.ReplaceAll(msgBody, "{{contact.phone}}", *contact.Phone)
			}
			if contact.Email != nil {
				msgBody = strings.ReplaceAll(msgBody, "{{contact.email}}", *contact.Email)
			}

			// Insert Bot Message
			msgID := uuid.New()
			insQuery := `INSERT INTO messages (id, conversation_id, company_id, sender_type, body, is_internal, status) VALUES ($1, $2, $3, 'bot', $4, FALSE, 'sent')`
			_, _ = e.db.ExecContext(ctx, insQuery, msgID, exec.ConversationID, exec.CompanyID, msgBody)

			// Update conversation last_message_at
			_, _ = e.db.ExecContext(ctx, `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`, exec.ConversationID)

			// Broadcast via WebSocket
			if e.wsHub != nil {
				e.wsHub.BroadcastToCompany(exec.CompanyID.String(), "new_message", map[string]interface{}{
					"id":              msgID,
					"conversation_id": exec.ConversationID,
					"sender_type":     "bot",
					"body":            msgBody,
				})
			}
		}

	case "transfer_queue":
		queueIDStr, _ := node.Data["queue_id"].(string)
		if queueIDStr != "" {
			qID, err := uuid.Parse(queueIDStr)
			if err == nil {
				_, _ = e.db.ExecContext(ctx, `UPDATE conversations SET queue_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, qID, exec.ConversationID)
				log.Printf("[FlowEngine] Transferred conversation %s to queue %s", exec.ConversationID, qID)
			}
		}

	case "condition":
		// Evaluate condition and branch
		condField, _ := node.Data["field"].(string)
		condOp, _ := node.Data["operator"].(string)
		condValue, _ := node.Data["value"].(string)

		var actualValue string
		if strings.HasPrefix(condField, "contact.") {
			fieldKey := strings.TrimPrefix(condField, "contact.")
			switch fieldKey {
			case "name":
				var name string
				_ = e.db.GetContext(ctx, &name, `SELECT name FROM contacts WHERE id = $1`, exec.ContactID)
				actualValue = name
			case "phone":
				_ = e.db.GetContext(ctx, &actualValue, `SELECT COALESCE(phone, '') FROM contacts WHERE id = $1`, exec.ContactID)
			default:
				_ = e.db.GetContext(ctx, &actualValue, `SELECT cv.value FROM contact_custom_values cv JOIN custom_fields cf ON cf.id = cv.custom_field_id WHERE cv.contact_id = $1 AND cf.key = $2`, exec.ContactID, fieldKey)
			}
		}

		match := false
		switch condOp {
		case "equals":
			match = strings.EqualFold(actualValue, condValue)
		case "contains":
			match = strings.Contains(strings.ToLower(actualValue), strings.ToLower(condValue))
		case "not_empty":
			match = actualValue != ""
		}

		// Find edge labeled "true" or "false"
		targetLabel := "false"
		if match {
			targetLabel = "true"
		}

		for _, edge := range def.Edges {
			label, _ := edge.Data["label"].(string)
			if edge.Source == node.ID && strings.EqualFold(label, targetLabel) {
				for _, n := range def.Nodes {
					if n.ID == edge.Target {
						_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET current_node_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, n.ID, exec.ID)
						e.processNode(ctx, exec, def, n, depth+1)
						return
					}
				}
			}
		}
		// Fallback: treat as end
		_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, exec.ID)
		return

	case "end":
		_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, exec.ID)
		log.Printf("[FlowEngine] Flow execution %s completed", exec.ID)
		return
	}

	// Find next node target via edges
	var nextNodeID string
	for _, edge := range def.Edges {
		if edge.Source == node.ID {
			nextNodeID = edge.Target
			break
		}
	}

	if nextNodeID != "" {
		for _, n := range def.Nodes {
			if n.ID == nextNodeID {
				_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET current_node_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, n.ID, exec.ID)
				e.processNode(ctx, exec, def, n, depth+1)
				return
			}
		}
	}

	// Mark as completed if no next node
	_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, exec.ID)
}
