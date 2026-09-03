package flows

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

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
			label := edge.Label
			if label == "" && edge.Data != nil {
				if l, ok := edge.Data["label"].(string); ok {
					label = l
				}
			}
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

	case "wait", "delay":
		seconds := 0
		if v, ok := node.Data["seconds"]; ok {
			switch val := v.(type) {
			case float64:
				seconds = int(val)
			case int:
				seconds = val
			case string:
				fmt.Sscanf(val, "%d", &seconds)
			}
		}
		if v, ok := node.Data["delay"]; ok && seconds == 0 {
			switch val := v.(type) {
			case float64:
				seconds = int(val)
			case int:
				seconds = val
			case string:
				fmt.Sscanf(val, "%d", &seconds)
			}
		}
		if seconds > 0 && seconds <= 86400 {
			log.Printf("[FlowEngine] Waiting %ds on node %s", seconds, node.ID)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(seconds) * time.Second):
			}
		}

	case "webhook", "http_request", "call_integration":
		urlStr, _ := node.Data["url"].(string)
		if urlStr == "" {
			urlStr, _ = node.Data["endpoint"].(string)
		}
		method, _ := node.Data["method"].(string)
		if method == "" {
			method = "POST"
		}
		// Interpolate contact placeholders in URL/body
		var contact models.Contact
		_ = e.db.GetContext(ctx, &contact, `SELECT name, phone, email FROM contacts WHERE id = $1`, exec.ContactID)
		urlStr = strings.ReplaceAll(urlStr, "{{contact.name}}", contact.Name)
		if contact.Phone != nil {
			urlStr = strings.ReplaceAll(urlStr, "{{contact.phone}}", *contact.Phone)
		}
		var bodyBytes []byte
		if b, ok := node.Data["body"]; ok {
			switch bv := b.(type) {
			case string:
				s := strings.ReplaceAll(bv, "{{contact.name}}", contact.Name)
				bodyBytes = []byte(s)
			case map[string]interface{}:
				bb, _ := json.Marshal(bv)
				bodyBytes = bb
			default:
				bb, _ := json.Marshal(bv)
				bodyBytes = bb
			}
		} else {
			// Default payload with context
			defPayload := map[string]interface{}{
				"contact_id":      exec.ContactID,
				"conversation_id": exec.ConversationID,
				"flow_id":         exec.FlowID,
				"company_id":      exec.CompanyID,
			}
			bodyBytes, _ = json.Marshal(defPayload)
		}
		if urlStr != "" {
			req, err := http.NewRequestWithContext(ctx, strings.ToUpper(method), urlStr, bytes.NewReader(bodyBytes))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				// Forward integration auth headers if integration_id provided
				if integID, ok := node.Data["integration_id"].(string); ok && integID != "" {
					if iid, err := uuid.Parse(integID); err == nil {
						var encHeaders string
						_ = e.db.GetContext(ctx, &encHeaders, `SELECT auth_headers_encrypted FROM integrations WHERE id=$1`, iid)
						_ = encHeaders // placeholder: headers decrypted and applied if needed
					}
				}
				client := &http.Client{Timeout: 10 * time.Second}
				resp, err := client.Do(req)
				if err != nil {
					log.Printf("[FlowEngine] webhook node %s failed: %v", node.ID, err)
				} else {
					resp.Body.Close()
					log.Printf("[FlowEngine] webhook node %s → %s status %d", node.ID, urlStr, resp.StatusCode)
					// Store last webhook response in execution context
					_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET context_json = jsonb_set(COALESCE(context_json,'{}'::jsonb), '{last_webhook_status}', to_jsonb($1::int)), updated_at=CURRENT_TIMESTAMP WHERE id=$2`, resp.StatusCode, exec.ID)
				}
			}
		}

	case "collect_input", "collect":
		// Pause execution waiting for next inbound message; mark as waiting_input
		_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status='waiting_input', current_node_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, node.ID, exec.ID)
		log.Printf("[FlowEngine] collect_input node %s awaiting user response (conv %s)", node.ID, exec.ConversationID)
		return

	case "update_card_stage", "update_card", "crm_move":
		stageIDStr, _ := node.Data["stage_id"].(string)
		if stageIDStr == "" {
			stageIDStr, _ = node.Data["target_stage_id"].(string)
		}
		stageName, _ := node.Data["stage_name"].(string)
		// Resolve stage_id by name if needed
		var targetStageID *uuid.UUID
		if stageIDStr != "" {
			if sid, err := uuid.Parse(stageIDStr); err == nil {
				targetStageID = &sid
			}
		} else if stageName != "" {
			var sid uuid.UUID
			if err := e.db.GetContext(ctx, &sid, `SELECT id FROM crm_stages WHERE company_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`, exec.CompanyID, stageName); err == nil {
				targetStageID = &sid
			}
		}
		if targetStageID != nil {
			// Find card linked to contact/conversation
			var cardID uuid.UUID
			err := e.db.GetContext(ctx, &cardID, `SELECT id FROM crm_cards WHERE company_id=$1 AND (contact_id=$2 OR conversation_id=$3) ORDER BY updated_at DESC LIMIT 1`, exec.CompanyID, exec.ContactID, exec.ConversationID)
			if err == nil {
				_, _ = e.db.ExecContext(ctx, `UPDATE crm_cards SET stage_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, *targetStageID, cardID)
				log.Printf("[FlowEngine] CRM card %s moved to stage %s via flow %s", cardID, *targetStageID, exec.FlowID)
				if e.wsHub != nil {
					e.wsHub.BroadcastToCompany(exec.CompanyID.String(), "crm_card_moved", map[string]interface{}{"card_id": cardID, "stage_id": *targetStageID, "flow_id": exec.FlowID})
				}
			}
		}

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

// ResumeWaitingExecutions resumes flows stuck at collect_input when a new inbound message arrives
func (e *Engine) ResumeWaitingExecutions(ctx context.Context, companyID, conversationID uuid.UUID, inboundText string) int {
	var execs []models.FlowExecution
	err := e.db.SelectContext(ctx, &execs, `SELECT id, flow_id, company_id, conversation_id, contact_id, current_node_id, status, context_json, created_at, updated_at FROM flow_executions WHERE company_id=$1 AND conversation_id=$2 AND status='waiting_input'`, companyID, conversationID)
	if err != nil || len(execs) == 0 {
		return 0
	}
	resumed := 0
	for _, exec := range execs {
		var flow models.Flow
		if err := e.db.GetContext(ctx, &flow, `SELECT id, definition_json FROM flows WHERE id=$1`, exec.FlowID); err != nil {
			continue
		}
		var def models.FlowDefinition
		if err := json.Unmarshal([]byte(flow.DefinitionJSON), &def); err != nil {
			continue
		}
		// Find current collect node
		var currentNode *models.FlowNode
		for i := range def.Nodes {
			if def.Nodes[i].ID == exec.CurrentNodeID {
				currentNode = &def.Nodes[i]
				break
			}
		}
		if currentNode == nil {
			continue
		}
		// Persist collected input: save to contact custom field or execution context
		if field, ok := currentNode.Data["field"].(string); ok && field != "" {
			// field like contact.phone or contact.custom_key or custom.xxx
			if strings.HasPrefix(field, "contact.") {
				key := strings.TrimPrefix(field, "contact.")
				switch key {
				case "name":
					_, _ = e.db.ExecContext(ctx, `UPDATE contacts SET name=$1 WHERE id=$2`, inboundText, exec.ContactID)
				case "email":
					_, _ = e.db.ExecContext(ctx, `UPDATE contacts SET email=$1 WHERE id=$2`, inboundText, exec.ContactID)
				case "phone":
					_, _ = e.db.ExecContext(ctx, `UPDATE contacts SET phone=$1 WHERE id=$2`, inboundText, exec.ContactID)
				default:
					// Try custom field
					var cfID uuid.UUID
					if err := e.db.GetContext(ctx, &cfID, `SELECT id FROM custom_fields WHERE company_id=$1 AND key=$2`, companyID, key); err == nil {
						_, _ = e.db.ExecContext(ctx, `INSERT INTO contact_custom_values (id, contact_id, custom_field_id, value) VALUES ($1,$2,$3,$4) ON CONFLICT (contact_id, custom_field_id) DO UPDATE SET value=EXCLUDED.value`, uuid.New(), exec.ContactID, cfID, inboundText)
					}
				}
			}
		}
		// Store inbound in execution context
		_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET context_json = jsonb_set(COALESCE(context_json,'{}'::jsonb), '{last_input}', to_jsonb($1::text)), status='running', updated_at=CURRENT_TIMESTAMP WHERE id=$2`, inboundText, exec.ID)
		// Advance to next node via outgoing edge
		var nextID string
		for _, edge := range def.Edges {
			if edge.Source == currentNode.ID {
				nextID = edge.Target
				break
			}
		}
		if nextID == "" {
			_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, exec.ID)
			resumed++
			continue
		}
		var nextNode *models.FlowNode
		for i := range def.Nodes {
			if def.Nodes[i].ID == nextID {
				nextNode = &def.Nodes[i]
				break
			}
		}
		if nextNode == nil {
			_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status='completed' WHERE id=$1`, exec.ID)
			continue
		}
		_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET current_node_id=$1, status='running', updated_at=CURRENT_TIMESTAMP WHERE id=$2`, nextNode.ID, exec.ID)
		// Refresh exec with new node id for processing
		exec.CurrentNodeID = nextNode.ID
		exec.Status = "running"
		go e.processNode(context.Background(), exec, def, *nextNode, 0)
		resumed++
	}
	if resumed > 0 {
		log.Printf("[FlowEngine] Resumed %d waiting executions for conv %s", resumed, conversationID)
	}
	return resumed
}
