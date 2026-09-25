package flows

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/websocket"
	"wh-panel/pkg/ai"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/postgres"
)

// Execution statuses.
const (
	StatusRunning      = "running"
	StatusWaitingInput = "waiting_input"
	StatusWaitingDelay = "waiting_delay"
	StatusCompleted    = "completed"
	StatusFailed       = "failed"
	StatusCancelled    = "cancelled"
)

const (
	// A run executes consecutive steps until it has to wait; this caps a
	// cycle without a pause (e.g. a condition looping onto itself).
	maxStepsPerRun = 60
	// Steps kept in an execution's trace for the executions panel.
	traceLimit = 40
	// How often due waits are resumed.
	schedulerInterval = 10 * time.Second
	// Messages sent to the AI as context.
	aiHistoryLimit = 20
	handoffMarker  = "[TRANSFERIR]"
)

// ErrConversationBusy means another automation is already active on the conversation.
var ErrConversationBusy = errors.New("outra automação já está ativa nesta conversa")

// MessageSender delivers a bot message to the contact through the
// conversation's channel (implemented by the conversations handler).
type MessageSender interface {
	SendAutomatedMessage(ctx context.Context, companyID, conversationID uuid.UUID, body string) error
}

// QueueAssigner picks an operator in a queue (implemented by queues.Service).
type QueueAssigner interface {
	AssignOperatorByStrategy(ctx context.Context, companyID, queueID uuid.UUID, strategy string) (*uuid.UUID, error)
}

type Engine struct {
	db       *postgres.DB
	wsHub    *websocket.Hub
	sender   MessageSender
	queues   QueueAssigner
	secret   string
	generate func(context.Context, ai.Request) (string, error)
	http     *http.Client
	now      func() time.Time
}

func NewEngine(db *sqlx.DB, wsHub *websocket.Hub) *Engine {
	return &Engine{
		db:       postgres.Wrap(db),
		wsHub:    wsHub,
		generate: ai.Generate,
		http:     webhookClient(),
		now:      time.Now,
	}
}

// Configure wires the collaborators that live in other packages.
func (e *Engine) Configure(sender MessageSender, queues QueueAssigner, secret string) {
	e.sender = sender
	e.queues = queues
	e.secret = secret
}

// Start resumes due waits (delays and question timeouts) until ctx ends.
// Several API replicas can run it: executions are claimed with SKIP LOCKED.
func (e *Engine) Start(ctx context.Context) {
	if e.db == nil {
		return
	}
	go func() {
		t := time.NewTicker(schedulerInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				e.resumeDue(context.Background())
			}
		}
	}()
}

// ---------------------------------------------------------------- state

type execState struct {
	exec models.FlowExecution
	def  models.FlowDefinition
	data map[string]interface{}
}

const execColumns = `id, flow_id, company_id, conversation_id, contact_id, current_node_id, status, context_json, resume_at, last_error, trigger_event, created_at, updated_at`

func (e *Engine) loadState(ctx context.Context, exec models.FlowExecution) (*execState, error) {
	var raw string
	if err := e.db.GetContext(ctx, &raw, `SELECT definition_json FROM flows WHERE id = $1 AND company_id = $2`, exec.FlowID, exec.CompanyID); err != nil {
		return nil, fmt.Errorf("fluxo não encontrado: %w", err)
	}
	var def models.FlowDefinition
	if err := json.Unmarshal([]byte(raw), &def); err != nil {
		return nil, fmt.Errorf("definição do fluxo inválida: %w", err)
	}
	st := &execState{exec: exec, def: NormalizeDefinition(def), data: map[string]interface{}{}}
	_ = json.Unmarshal([]byte(exec.ContextJSON), &st.data)
	return st, nil
}

func (e *Engine) save(ctx context.Context, st *execState, status string, resumeAt *time.Time, lastErr string) {
	raw, _ := json.Marshal(st.data)
	var errPtr *string
	if lastErr != "" {
		errPtr = &lastErr
	}
	// Never resurrect an execution that was cancelled while it ran.
	_, err := e.db.ExecContext(ctx, `UPDATE flow_executions
		SET current_node_id = $1, status = $2, context_json = $3::jsonb, resume_at = $4, last_error = COALESCE($5, last_error), updated_at = CURRENT_TIMESTAMP
		WHERE id = $6 AND status <> 'cancelled'`,
		st.exec.CurrentNodeID, status, string(raw), resumeAt, errPtr, st.exec.ID)
	if err != nil {
		log.Printf("[FlowEngine] could not save execution %s: %v", st.exec.ID, err)
	}
	st.exec.Status = status
}

func (e *Engine) isCancelled(ctx context.Context, id uuid.UUID) bool {
	var status string
	if err := e.db.GetContext(ctx, &status, `SELECT status FROM flow_executions WHERE id = $1`, id); err != nil {
		return true
	}
	return status == StatusCancelled
}

func (st *execState) trace(node *models.FlowNode, result string) {
	entries, _ := st.data["trace"].([]interface{})
	entries = append(entries, map[string]interface{}{
		"node": node.ID, "type": node.Type, "title": node.Title,
		"at": time.Now().UTC().Format(time.RFC3339), "result": result,
	})
	if len(entries) > traceLimit {
		entries = entries[len(entries)-traceLimit:]
	}
	st.data["trace"] = entries
}

func (st *execState) mapOf(key string) map[string]interface{} {
	m, ok := st.data[key].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
		st.data[key] = m
	}
	return m
}

// ---------------------------------------------------------------- entry points

// HandleInbound is called for every inbound contact message. It answers a
// pending question or AI conversation first; otherwise it starts the best
// matching active flow, unless a human attendant already owns the conversation.
func (e *Engine) HandleInbound(ctx context.Context, companyID, conversationID uuid.UUID, channelID *uuid.UUID, text string, newConversation bool) {
	if e.db == nil {
		return
	}
	var waiting []models.FlowExecution
	err := e.db.SelectContext(ctx, &waiting, `UPDATE flow_executions SET status = 'running', resume_at = NULL, updated_at = CURRENT_TIMESTAMP
		WHERE company_id = $1 AND conversation_id = $2 AND status = 'waiting_input'
		RETURNING `+execColumns, companyID, conversationID)
	if err != nil {
		log.Printf("[FlowEngine] claim waiting executions: %v", err)
	}
	if len(waiting) > 0 {
		for _, exec := range waiting {
			e.resumeWithReply(ctx, exec, text)
		}
		return
	}

	var busy int
	_ = e.db.GetContext(ctx, &busy, `SELECT COUNT(*) FROM flow_executions WHERE conversation_id = $1 AND status IN ('running', 'waiting_delay')`, conversationID)
	if busy > 0 {
		return
	}
	var assigned *uuid.UUID
	_ = e.db.GetContext(ctx, &assigned, `SELECT assigned_user_id FROM conversations WHERE id = $1 AND company_id = $2`, conversationID, companyID)
	if assigned != nil && !newConversation {
		return // a person is attending; the bot stays out
	}

	var flows []models.Flow
	if err := e.db.SelectContext(ctx, &flows, `SELECT id, company_id, name, description, status, definition_json, created_at, updated_at FROM flows WHERE company_id = $1 AND status = 'active' ORDER BY created_at`, companyID); err != nil {
		return
	}
	ev := InboundEvent{Text: text, NewConversation: newConversation}
	if channelID != nil {
		ev.ChannelID = channelID.String()
	}
	var best *models.Flow
	var bestDef models.FlowDefinition
	bestPriority := 0
	for i := range flows {
		var def models.FlowDefinition
		if json.Unmarshal([]byte(flows[i].DefinitionJSON), &def) != nil {
			continue
		}
		def = NormalizeDefinition(def)
		if ok, prio := MatchTrigger(StartNode(def), ev); ok && prio > bestPriority {
			best, bestDef, bestPriority = &flows[i], def, prio
		}
	}
	if best == nil {
		return
	}
	trigger := str(StartNode(bestDef).Data, "event")
	if trigger == "" {
		trigger = TriggerNewConversation
	}
	if _, err := e.start(ctx, companyID, best.ID, conversationID, bestDef, trigger, text); err != nil && !errors.Is(err, ErrConversationBusy) {
		log.Printf("[FlowEngine] start flow %s on conv %s: %v", best.ID, conversationID, err)
	}
}

// ExecuteFlow runs a flow on a conversation by hand (the "Testar" action),
// replacing any automation already active there. Drafts can be tested too.
func (e *Engine) ExecuteFlow(ctx context.Context, companyID, flowID, conversationID uuid.UUID) (*models.FlowExecution, error) {
	var raw string
	if err := e.db.GetContext(ctx, &raw, `SELECT definition_json FROM flows WHERE id = $1 AND company_id = $2`, flowID, companyID); err != nil {
		return nil, fmt.Errorf("fluxo não encontrado")
	}
	var def models.FlowDefinition
	if err := json.Unmarshal([]byte(raw), &def); err != nil {
		return nil, fmt.Errorf("definição do fluxo inválida")
	}
	def = NormalizeDefinition(def)
	if len(def.Nodes) == 0 {
		return nil, fmt.Errorf("o fluxo não tem etapas")
	}
	e.CancelForConversation(ctx, companyID, conversationID, "Substituída por um teste manual")
	return e.start(ctx, companyID, flowID, conversationID, def, TriggerManual, "")
}

// CancelForConversation stops active automations, e.g. when an attendant
// replies or the conversation is resolved.
func (e *Engine) CancelForConversation(ctx context.Context, companyID, conversationID uuid.UUID, reason string) int {
	if e.db == nil {
		return 0
	}
	res, err := e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'cancelled', resume_at = NULL, last_error = $1, updated_at = CURRENT_TIMESTAMP
		WHERE company_id = $2 AND conversation_id = $3 AND status IN ('running', 'waiting_input', 'waiting_delay')`, reason, companyID, conversationID)
	if err != nil {
		return 0
	}
	n, _ := res.RowsAffected()
	return int(n)
}

// CancelExecution stops one execution of the company.
func (e *Engine) CancelExecution(ctx context.Context, companyID, executionID uuid.UUID) (bool, error) {
	res, err := e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'cancelled', resume_at = NULL, last_error = 'Cancelada manualmente', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND company_id = $2 AND status IN ('running', 'waiting_input', 'waiting_delay')`, executionID, companyID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func (e *Engine) start(ctx context.Context, companyID, flowID, conversationID uuid.UUID, def models.FlowDefinition, trigger, firstText string) (*models.FlowExecution, error) {
	startNode := StartNode(def)
	if startNode == nil {
		return nil, fmt.Errorf("o fluxo não tem etapas")
	}
	var contactID uuid.UUID
	if err := e.db.GetContext(ctx, &contactID, `SELECT contact_id FROM conversations WHERE id = $1 AND company_id = $2`, conversationID, companyID); err != nil {
		return nil, fmt.Errorf("conversa não encontrada")
	}
	initial, _ := json.Marshal(map[string]interface{}{"last_input": firstText})
	var execs []models.FlowExecution
	err := e.db.SelectContext(ctx, &execs, `INSERT INTO flow_executions (id, flow_id, company_id, conversation_id, contact_id, current_node_id, status, context_json, trigger_event)
		VALUES ($1, $2, $3, $4, $5, $6, 'running', $7::jsonb, $8)
		ON CONFLICT (conversation_id) WHERE status IN ('running', 'waiting_input', 'waiting_delay') DO NOTHING
		RETURNING `+execColumns, uuid.New(), flowID, companyID, conversationID, contactID, startNode.ID, string(initial), trigger)
	if err != nil {
		return nil, fmt.Errorf("não foi possível iniciar a execução: %w", err)
	}
	if len(execs) == 0 {
		return nil, ErrConversationBusy
	}
	exec := execs[0]
	st := &execState{exec: exec, def: def, data: map[string]interface{}{"last_input": firstText}}
	// Run outside the caller's request: sending messages and calling the AI can take seconds.
	go e.runFrom(context.Background(), st, startNode)
	return &exec, nil
}

func (e *Engine) resumeWithReply(ctx context.Context, exec models.FlowExecution, text string) {
	st, err := e.loadState(ctx, exec)
	if err != nil {
		e.failRaw(ctx, exec.ID, err.Error())
		return
	}
	node := findNode(st.def, exec.CurrentNodeID)
	if node == nil {
		e.failRaw(ctx, exec.ID, "A etapa em espera não existe mais no fluxo")
		return
	}
	st.data["last_input"] = text
	switch node.Type {
	case NodeAsk:
		e.storeAnswer(ctx, st, node, text)
		st.trace(node, "respondida")
		e.runFrom(ctx, st, NextNode(st.def, node, "reply"))
	case NodeAIAgent:
		e.runFrom(ctx, st, node) // continue the AI conversation
	default:
		e.runFrom(ctx, st, NextNode(st.def, node, ""))
	}
}

func (e *Engine) resumeDue(ctx context.Context) {
	type due struct {
		models.FlowExecution
		PrevStatus string `db:"prev_status"`
	}
	var rows []due
	err := e.db.SelectContext(ctx, &rows, `WITH due AS (
			SELECT id, status FROM flow_executions
			WHERE status IN ('waiting_input', 'waiting_delay') AND resume_at IS NOT NULL AND resume_at <= CURRENT_TIMESTAMP
			ORDER BY resume_at LIMIT 25
			FOR UPDATE SKIP LOCKED
		)
		UPDATE flow_executions f SET status = 'running', resume_at = NULL, updated_at = CURRENT_TIMESTAMP
		FROM due WHERE f.id = due.id
		RETURNING f.id, f.flow_id, f.company_id, f.conversation_id, f.contact_id, f.current_node_id, f.status, f.context_json, f.resume_at, f.last_error, f.trigger_event, f.created_at, f.updated_at, due.status AS prev_status`)
	if err != nil {
		log.Printf("[FlowEngine] scheduler: %v", err)
		return
	}
	for _, r := range rows {
		st, err := e.loadState(ctx, r.FlowExecution)
		if err != nil {
			e.failRaw(ctx, r.ID, err.Error())
			continue
		}
		node := findNode(st.def, r.CurrentNodeID)
		if node == nil {
			e.failRaw(ctx, r.ID, "A etapa em espera não existe mais no fluxo")
			continue
		}
		handle := ""
		if r.PrevStatus == StatusWaitingInput {
			handle = "timeout"
			if node.Type == NodeAIAgent {
				handle = "done"
			}
			st.trace(node, "sem resposta no prazo")
		}
		go e.runFrom(ctx, st, NextNode(st.def, node, handle))
	}
}

func (e *Engine) failRaw(ctx context.Context, id uuid.UUID, msg string) {
	_, _ = e.db.ExecContext(ctx, `UPDATE flow_executions SET status = 'failed', last_error = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status <> 'cancelled'`, msg, id)
}

// ---------------------------------------------------------------- runner

type waitSpec struct {
	status   string
	resumeAt *time.Time
}

func (e *Engine) runFrom(ctx context.Context, st *execState, node *models.FlowNode) {
	for steps := 0; node != nil; steps++ {
		if steps >= maxStepsPerRun {
			e.save(ctx, st, StatusFailed, nil, "A automação passou do limite de etapas seguidas sem pausa (verifique ciclos)")
			return
		}
		if e.isCancelled(ctx, st.exec.ID) {
			return
		}
		st.exec.CurrentNodeID = node.ID
		handle, wait, err := e.runNode(ctx, st, node)
		if err != nil {
			st.trace(node, "erro: "+err.Error())
			e.save(ctx, st, StatusFailed, nil, err.Error())
			return
		}
		if wait != nil {
			st.trace(node, "aguardando")
			e.save(ctx, st, wait.status, wait.resumeAt, "")
			return
		}
		result := "ok"
		if handle != "" {
			result = handle
		}
		st.trace(node, result)
		if node.Type == NodeEnd {
			e.save(ctx, st, StatusCompleted, nil, "")
			return
		}
		next := NextNode(st.def, node, handle)
		if next == nil && handle == "error" {
			next = NextNode(st.def, node, "")
		}
		node = next
		if node != nil {
			st.exec.CurrentNodeID = node.ID
			e.save(ctx, st, StatusRunning, nil, "")
		}
	}
	e.save(ctx, st, StatusCompleted, nil, "")
}

func (e *Engine) runNode(ctx context.Context, st *execState, node *models.FlowNode) (string, *waitSpec, error) {
	d := node.Data
	switch node.Type {
	case NodeTrigger:
		return "", nil, nil

	case NodeSendMessage:
		return "", nil, e.send(ctx, st, Render(str(d, "message"), e.vars(ctx, st)))

	case NodeAsk:
		if err := e.send(ctx, st, Render(str(d, "message"), e.vars(ctx, st))); err != nil {
			return "", nil, err
		}
		return "", e.waitInput(num(d, "timeout_minutes")), nil

	case NodeCondition:
		actual := e.resolveField(ctx, st, str(d, "field"))
		if EvaluateCondition(actual, str(d, "operator"), Render(str(d, "value"), e.vars(ctx, st))) {
			return "true", nil, nil
		}
		return "false", nil, nil

	case NodeWait:
		dur := WaitDuration(d)
		if dur <= 0 {
			return "", nil, nil
		}
		at := e.now().Add(dur)
		return "", &waitSpec{status: StatusWaitingDelay, resumeAt: &at}, nil

	case NodeTransferQueue:
		if msg := strings.TrimSpace(str(d, "message")); msg != "" {
			if err := e.send(ctx, st, Render(msg, e.vars(ctx, st))); err != nil {
				return "", nil, err
			}
		}
		return "", nil, e.transferToQueue(ctx, st, str(d, "queue_id"))

	case NodeAddTag:
		return "", nil, e.addTag(ctx, st, strings.TrimSpace(Render(str(d, "tag"), e.vars(ctx, st))))

	case NodeCRMMove:
		return "", nil, e.moveCard(ctx, st, d)

	case NodeWebhook:
		return e.callWebhook(ctx, st, d), nil, nil

	case NodeAIAgent:
		return e.runAI(ctx, st, node)

	case NodeEnd:
		if boolean(d, "resolve") {
			_, err := e.db.ExecContext(ctx, `UPDATE conversations SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND company_id = $2`, st.exec.ConversationID, st.exec.CompanyID)
			if err != nil {
				return "", nil, fmt.Errorf("não foi possível resolver a conversa")
			}
			e.broadcast(st, "status_changed", map[string]interface{}{"id": st.exec.ConversationID, "status": "resolved"})
		}
		return "", nil, nil
	}
	return "", nil, fmt.Errorf("tipo de etapa desconhecido: %s", node.Type)
}

func (e *Engine) waitInput(timeoutMinutes float64) *waitSpec {
	w := &waitSpec{status: StatusWaitingInput}
	if timeoutMinutes > 0 {
		at := e.now().Add(time.Duration(timeoutMinutes * float64(time.Minute)))
		w.resumeAt = &at
	}
	return w
}

func (e *Engine) send(ctx context.Context, st *execState, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if e.sender == nil {
		return errors.New("envio de mensagens indisponível")
	}
	if err := e.sender.SendAutomatedMessage(ctx, st.exec.CompanyID, st.exec.ConversationID, text); err != nil {
		return fmt.Errorf("não foi possível enviar a mensagem: %w", err)
	}
	return nil
}

func (e *Engine) broadcast(st *execState, event string, payload interface{}) {
	if e.wsHub != nil {
		e.wsHub.BroadcastToCompany(st.exec.CompanyID.String(), event, payload)
	}
}

// ---------------------------------------------------------------- data access

type contactInfo struct {
	Name  string  `db:"name"`
	Phone *string `db:"phone"`
	Email *string `db:"email"`
}

func (e *Engine) contact(ctx context.Context, st *execState) contactInfo {
	var c contactInfo
	_ = e.db.GetContext(ctx, &c, `SELECT name, phone, email FROM contacts WHERE id = $1 AND company_id = $2`, st.exec.ContactID, st.exec.CompanyID)
	return c
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// vars exposes contact data, custom fields, the last reply and saved
// answers to message templates: {{contact.name}}, {{last_input}}, {{var.x}}.
func (e *Engine) vars(ctx context.Context, st *execState) map[string]string {
	c := e.contact(ctx, st)
	v := map[string]string{
		"contact.name":  c.Name,
		"contact.phone": deref(c.Phone),
		"contact.email": deref(c.Email),
		"first_name":    strings.Fields(c.Name + " ")[0],
	}
	if s, ok := st.data["last_input"].(string); ok {
		v["last_input"] = s
		v["message.text"] = s
	}
	for k, val := range st.mapOf("vars") {
		if s, ok := val.(string); ok {
			v["var."+k] = s
		}
	}
	rows, err := e.db.QueryxContext(ctx, `SELECT cf.key, cv.value FROM contact_custom_values cv JOIN custom_fields cf ON cf.id = cv.custom_field_id
		WHERE cv.contact_id = $1 AND cf.company_id = $2`, st.exec.ContactID, st.exec.CompanyID)
	if err == nil {
		for rows.Next() {
			var k string
			var val *string
			if rows.Scan(&k, &val) == nil {
				v["contact."+k] = deref(val)
			}
		}
		rows.Close()
	}
	return v
}

func (e *Engine) resolveField(ctx context.Context, st *execState, field string) string {
	switch field {
	case "conversation.tags":
		var names []string
		_ = e.db.SelectContext(ctx, &names, `SELECT t.name FROM tags t JOIN conversation_tags ct ON ct.tag_id = t.id WHERE ct.conversation_id = $1 AND t.company_id = $2`, st.exec.ConversationID, st.exec.CompanyID)
		return strings.Join(names, ",")
	case "conversation.channel_type":
		var t *string
		_ = e.db.GetContext(ctx, &t, `SELECT ch.type FROM conversations c JOIN channels ch ON ch.id = c.channel_id WHERE c.id = $1 AND c.company_id = $2`, st.exec.ConversationID, st.exec.CompanyID)
		return deref(t)
	}
	return e.vars(ctx, st)[field]
}

// storeAnswer keeps a question's reply as {{var.<variable>}} and, when
// asked to, on the contact (name, email, phone or a custom field).
func (e *Engine) storeAnswer(ctx context.Context, st *execState, node *models.FlowNode, text string) {
	if name := strings.TrimSpace(str(node.Data, "variable")); name != "" {
		st.mapOf("vars")[name] = text
	}
	saveTo := str(node.Data, "save_to")
	if !strings.HasPrefix(saveTo, "contact.") {
		return
	}
	key := strings.TrimPrefix(saveTo, "contact.")
	switch key {
	case "name", "email", "phone":
		_, _ = e.db.ExecContext(ctx, fmt.Sprintf(`UPDATE contacts SET %s = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3`, key), text, st.exec.ContactID, st.exec.CompanyID)
	default:
		var fieldID uuid.UUID
		if e.db.GetContext(ctx, &fieldID, `SELECT id FROM custom_fields WHERE company_id = $1 AND key = $2`, st.exec.CompanyID, key) == nil {
			_, _ = e.db.ExecContext(ctx, `INSERT INTO contact_custom_values (id, contact_id, custom_field_id, value) VALUES ($1, $2, $3, $4)
				ON CONFLICT (contact_id, custom_field_id) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, uuid.New(), st.exec.ContactID, fieldID, text)
		}
	}
}

func (e *Engine) transferToQueue(ctx context.Context, st *execState, queueIDStr string) error {
	queueID, err := uuid.Parse(queueIDStr)
	if err != nil {
		return errors.New("fila não configurada")
	}
	var strategy string
	if err := e.db.GetContext(ctx, &strategy, `SELECT allocation_strategy FROM queues WHERE id = $1 AND company_id = $2`, queueID, st.exec.CompanyID); err != nil {
		return errors.New("a fila escolhida não existe mais")
	}
	var assignee *uuid.UUID
	if e.queues != nil {
		assignee, _ = e.queues.AssignOperatorByStrategy(ctx, st.exec.CompanyID, queueID, strategy)
	}
	if _, err := e.db.ExecContext(ctx, `UPDATE conversations SET queue_id = $1, assigned_user_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4`,
		queueID, assignee, st.exec.ConversationID, st.exec.CompanyID); err != nil {
		return errors.New("não foi possível transferir a conversa")
	}
	e.broadcast(st, "assigned_changed", map[string]interface{}{"id": st.exec.ConversationID, "queue_id": queueID, "assigned_user_id": assignee})
	return nil
}

func (e *Engine) addTag(ctx context.Context, st *execState, name string) error {
	if name == "" {
		return nil
	}
	var tagID uuid.UUID
	if err := e.db.GetContext(ctx, &tagID, `SELECT id FROM tags WHERE company_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, st.exec.CompanyID, name); err != nil {
		tagID = uuid.New()
		if _, err := e.db.ExecContext(ctx, `INSERT INTO tags (id, company_id, name, color) VALUES ($1, $2, $3, '#7468bd')`, tagID, st.exec.CompanyID, name); err != nil {
			return errors.New("não foi possível criar a tag")
		}
	}
	_, err := e.db.ExecContext(ctx, `INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, st.exec.ConversationID, tagID)
	if err != nil {
		return errors.New("não foi possível adicionar a tag")
	}
	return nil
}

func (e *Engine) moveCard(ctx context.Context, st *execState, d map[string]interface{}) error {
	var stage struct {
		ID         uuid.UUID `db:"id"`
		PipelineID uuid.UUID `db:"pipeline_id"`
	}
	var err error
	if id, perr := uuid.Parse(str(d, "stage_id")); perr == nil {
		err = e.db.GetContext(ctx, &stage, `SELECT id, pipeline_id FROM crm_stages WHERE id = $1 AND company_id = $2`, id, st.exec.CompanyID)
	} else {
		err = e.db.GetContext(ctx, &stage, `SELECT id, pipeline_id FROM crm_stages WHERE company_id = $1 AND LOWER(name) = LOWER($2) ORDER BY order_index LIMIT 1`, st.exec.CompanyID, str(d, "stage_name"))
	}
	if err != nil {
		return errors.New("a etapa do CRM escolhida não existe mais")
	}
	status := str(d, "status")
	if status != "won" && status != "lost" {
		status = "open"
	}
	var cardID uuid.UUID
	err = e.db.GetContext(ctx, &cardID, `SELECT id FROM crm_cards WHERE company_id = $1 AND pipeline_id = $2 AND (contact_id = $3 OR conversation_id = $4) ORDER BY updated_at DESC LIMIT 1`,
		st.exec.CompanyID, stage.PipelineID, st.exec.ContactID, st.exec.ConversationID)
	switch {
	case err == nil:
		if _, err := e.db.ExecContext(ctx, `UPDATE crm_cards SET stage_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4`, stage.ID, status, cardID, st.exec.CompanyID); err != nil {
			return errors.New("não foi possível mover o card")
		}
	case errors.Is(err, sql.ErrNoRows):
		title := strings.TrimSpace(Render(str(d, "title"), e.vars(ctx, st)))
		if title == "" {
			title = e.contact(ctx, st).Name
		}
		cardID = uuid.New()
		if _, err := e.db.ExecContext(ctx, `INSERT INTO crm_cards (id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			cardID, st.exec.CompanyID, stage.PipelineID, stage.ID, st.exec.ContactID, st.exec.ConversationID, title, num(d, "value"), status); err != nil {
			return errors.New("não foi possível criar o card no CRM")
		}
	default:
		return errors.New("não foi possível consultar o CRM")
	}
	e.broadcast(st, "crm_card_moved", map[string]interface{}{"card_id": cardID, "stage_id": stage.ID, "flow_id": st.exec.FlowID})
	return nil
}

// callWebhook returns the handle to follow: "error" on network errors or
// HTTP status >= 400.
func (e *Engine) callWebhook(ctx context.Context, st *execState, d map[string]interface{}) string {
	vars := e.vars(ctx, st)
	method := strings.ToUpper(str(d, "method"))
	if method == "" {
		method = http.MethodPost
	}
	var body io.Reader
	if method != http.MethodGet {
		payload := strings.TrimSpace(str(d, "body"))
		if payload == "" {
			raw, _ := json.Marshal(map[string]interface{}{
				"flow_id": st.exec.FlowID, "execution_id": st.exec.ID, "conversation_id": st.exec.ConversationID,
				"contact":    map[string]string{"name": vars["contact.name"], "phone": vars["contact.phone"], "email": vars["contact.email"]},
				"last_input": vars["last_input"], "vars": st.mapOf("vars"),
			})
			payload = string(raw)
		} else {
			payload = Render(payload, vars)
		}
		body = bytes.NewBufferString(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, Render(str(d, "url"), vars), body)
	if err != nil {
		st.mapOf("vars")["webhook_status"] = "erro"
		return "error"
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "WH-Panel-Flows/1.0")
	resp, err := e.http.Do(req)
	if err != nil {
		st.mapOf("vars")["webhook_status"] = "erro"
		return "error"
	}
	defer resp.Body.Close()
	st.mapOf("vars")["webhook_status"] = fmt.Sprint(resp.StatusCode)
	if resp.StatusCode >= 400 {
		return "error"
	}
	return ""
}

// runAI answers with the company's own AI key. "[TRANSFERIR]" in the answer
// (or a refusal, or a missing key) follows the "handoff" output.
func (e *Engine) runAI(ctx context.Context, st *execState, node *models.FlowNode) (string, *waitSpec, error) {
	d := node.Data
	provider, model, key, err := e.aiCredentials(ctx, st.exec.CompanyID, str(d, "provider"))
	if err != nil {
		st.mapOf("vars")["ai_error"] = err.Error()
		return "handoff", nil, nil
	}
	if m := strings.TrimSpace(str(d, "model")); m != "" {
		model = m
	}

	var msgs []struct {
		SenderType string `db:"sender_type"`
		Body       string `db:"body"`
	}
	_ = e.db.SelectContext(ctx, &msgs, `SELECT sender_type, body FROM (
			SELECT sender_type, body, created_at FROM messages
			WHERE conversation_id = $1 AND company_id = $2 AND is_internal = FALSE AND body <> ''
			ORDER BY created_at DESC LIMIT $3
		) recent ORDER BY created_at ASC`, st.exec.ConversationID, st.exec.CompanyID, aiHistoryLimit)
	history := make([]ai.Message, 0, len(msgs))
	for _, m := range msgs {
		role := "assistant"
		if m.SenderType == "contact" {
			role = "user"
		}
		history = append(history, ai.Message{Role: role, Text: m.Body})
	}

	system := strings.TrimSpace(Render(str(d, "instructions"), e.vars(ctx, st))) + "\n\n" +
		"Você está respondendo um cliente pelo WhatsApp em nome da empresa. Responda em português do Brasil, " +
		"de forma curta e natural (no máximo 3 frases), sem inventar preços, prazos ou políticas que não estejam nas instruções acima. " +
		"Se o cliente pedir para falar com uma pessoa, ou se você não tiver informação para responder com segurança, responda somente " + handoffMarker + "."

	reply, err := e.generate(ctx, ai.Request{Provider: provider, Model: model, APIKey: key, System: system, History: history})
	if err != nil {
		st.mapOf("vars")["ai_error"] = err.Error()
		return "handoff", nil, nil
	}
	if strings.Contains(reply, handoffMarker) {
		return "handoff", nil, nil
	}
	if err := e.send(ctx, st, reply); err != nil {
		return "", nil, err
	}

	turns := st.mapOf("ai_turns")
	count := num(turns, node.ID) + 1
	turns[node.ID] = count
	maxTurns := num(d, "max_turns")
	if maxTurns < 1 {
		maxTurns = 1
	}
	if count < maxTurns {
		timeout := num(d, "timeout_minutes")
		if timeout <= 0 {
			timeout = 60
		}
		return "", e.waitInput(timeout), nil
	}
	delete(turns, node.ID)
	return "done", nil, nil
}

func (e *Engine) aiCredentials(ctx context.Context, companyID uuid.UUID, provider string) (string, string, string, error) {
	var cfg struct {
		Provider string `db:"provider"`
		Key      string `db:"api_key_encrypted"`
		Model    string `db:"model_name"`
	}
	query := `SELECT provider, api_key_encrypted, model_name FROM ai_providers_config WHERE company_id = $1 AND is_active = TRUE`
	args := []interface{}{companyID}
	if provider != "" && provider != "auto" {
		query += ` AND provider = $2`
		args = append(args, provider)
	}
	query += ` ORDER BY updated_at DESC LIMIT 1`
	if err := e.db.GetContext(ctx, &cfg, query, args...); err != nil {
		return "", "", "", errors.New("nenhuma chave de IA configurada em Planos & Chaves de IA")
	}
	key, err := crypto.DecryptAES(cfg.Key, e.secret)
	if err != nil {
		return "", "", "", errors.New("não foi possível ler a chave de IA; salve-a novamente")
	}
	return cfg.Provider, cfg.Model, key, nil
}
