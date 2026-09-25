package flows

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"

	"wh-panel/internal/models"
	"wh-panel/pkg/ai"
	"wh-panel/pkg/crypto"
)

// Runs against a migrated database, e.g.
// WH_TEST_DATABASE_URL="postgres://wh_user:wh_password@localhost:55432/wh_panel_db?sslmode=disable"

type fakeSender struct {
	mu   sync.Mutex
	sent []string
}

func (f *fakeSender) SendAutomatedMessage(_ context.Context, _, _ uuid.UUID, body string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, body)
	return nil
}

func (f *fakeSender) all() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.sent...)
}

type fixture struct {
	db                         *sqlx.DB
	engine                     *Engine
	sender                     *fakeSender
	company, contact, conv, fl uuid.UUID
}

const testSecret = "integration-secret-32-bytes-long!"

func setup(t *testing.T, def models.FlowDefinition) *fixture {
	t.Helper()
	url := os.Getenv("WH_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("WH_TEST_DATABASE_URL not set")
	}
	db, err := sqlx.Connect("postgres", url)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{db: db, sender: &fakeSender{}, company: uuid.New(), contact: uuid.New(), conv: uuid.New(), fl: uuid.New()}
	mustExec := func(q string, args ...interface{}) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	mustExec(`INSERT INTO companies (id, name, slug) VALUES ($1, 'flow test', $2)`, f.company, "flow-"+f.company.String())
	mustExec(`INSERT INTO contacts (id, company_id, name, phone) VALUES ($1, $2, 'Ana Souza', '5511999990000')`, f.contact, f.company)
	mustExec(`INSERT INTO conversations (id, company_id, contact_id, status) VALUES ($1, $2, $3, 'open')`, f.conv, f.company, f.contact)
	mustExec(`INSERT INTO messages (id, conversation_id, company_id, sender_type, body, is_internal, status) VALUES ($1, $2, $3, 'contact', 'oi', FALSE, 'delivered')`, uuid.New(), f.conv, f.company)
	raw, _ := json.Marshal(def)
	mustExec(`INSERT INTO flows (id, company_id, name, status, definition_json) VALUES ($1, $2, 'Teste', 'active', $3)`, f.fl, f.company, string(raw))
	enc, _ := crypto.EncryptAES("sk-test", testSecret)
	mustExec(`INSERT INTO ai_providers_config (id, company_id, provider, api_key_encrypted, model_name, is_active) VALUES ($1, $2, 'anthropic', $3, 'claude-opus-5', TRUE)`, uuid.New(), f.company, enc)
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM companies WHERE id = $1`, f.company)
		db.Close()
	})

	f.engine = NewEngine(db, nil)
	f.engine.Configure(f.sender, nil, testSecret)
	f.engine.generate = func(_ context.Context, req ai.Request) (string, error) {
		if req.APIKey != "sk-test" || req.Provider != "anthropic" || !strings.Contains(req.System, "Clínica") {
			t.Errorf("unexpected AI request: %+v", req)
		}
		return "Temos horário amanhã às 9h.", nil
	}
	return f
}

func (f *fixture) waitStatus(t *testing.T, want string) models.FlowExecution {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var exec models.FlowExecution
		err := f.db.Get(&exec, `SELECT `+execColumns+` FROM flow_executions WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, f.conv)
		if err == nil && exec.Status == want {
			return exec
		}
		if time.Now().After(deadline) {
			t.Fatalf("execution status = %q (err %v), want %q", exec.Status, err, want)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func fullFlow() models.FlowDefinition {
	return models.FlowDefinition{
		Nodes: []models.FlowNode{
			{ID: "start", Type: NodeTrigger, Data: map[string]interface{}{"event": TriggerNewConversation}},
			{ID: "hello", Type: NodeSendMessage, Title: "Boas-vindas", Data: map[string]interface{}{"message": "Olá {{first_name}}!"}},
			{ID: "ask", Type: NodeAsk, Data: map[string]interface{}{"message": "Qual seu e-mail?", "save_to": "contact.email", "variable": "email", "timeout_minutes": float64(30)}},
			{ID: "check", Type: NodeCondition, Data: map[string]interface{}{"field": "var.email", "operator": "contains", "value": "@"}},
			{ID: "tag", Type: NodeAddTag, Data: map[string]interface{}{"tag": "lead"}},
			{ID: "bot", Type: NodeAIAgent, Data: map[string]interface{}{"instructions": "Você atende a Clínica São Pedro."}},
			{ID: "bye", Type: NodeEnd, Data: map[string]interface{}{"resolve": true}},
			{ID: "invalid", Type: NodeSendMessage, Data: map[string]interface{}{"message": "E-mail inválido."}},
			{ID: "late", Type: NodeSendMessage, Data: map[string]interface{}{"message": "Sem resposta, encerrando."}},
		},
		Edges: []models.FlowEdge{
			{Source: "start", Target: "hello"},
			{Source: "hello", Target: "ask"},
			{Source: "ask", Target: "check", SourceHandle: "reply"},
			{Source: "ask", Target: "late", SourceHandle: "timeout"},
			{Source: "check", Target: "tag", SourceHandle: "true"},
			{Source: "check", Target: "invalid", SourceHandle: "false"},
			{Source: "tag", Target: "bot"},
			{Source: "bot", Target: "bye", SourceHandle: "done"},
		},
	}
}

func TestEngineRunsWholeFlow(t *testing.T) {
	f := setup(t, fullFlow())
	ctx := context.Background()

	f.engine.HandleInbound(ctx, f.company, f.conv, nil, "oi", true)
	f.waitStatus(t, StatusWaitingInput)
	if got := f.sender.all(); len(got) != 2 || got[0] != "Olá Ana!" || got[1] != "Qual seu e-mail?" {
		t.Fatalf("messages before reply = %q", got)
	}

	// A second inbound message must not start a second bot while one waits.
	var active int
	_ = f.db.Get(&active, `SELECT COUNT(*) FROM flow_executions WHERE conversation_id = $1 AND status IN ('running','waiting_input','waiting_delay')`, f.conv)
	if active != 1 {
		t.Fatalf("active executions = %d", active)
	}

	f.engine.HandleInbound(ctx, f.company, f.conv, nil, "ana@exemplo.com", false)
	exec := f.waitStatus(t, StatusCompleted)

	got := f.sender.all()
	if len(got) != 3 || got[2] != "Temos horário amanhã às 9h." {
		t.Fatalf("messages = %q", got)
	}
	var email string
	_ = f.db.Get(&email, `SELECT COALESCE(email, '') FROM contacts WHERE id = $1`, f.contact)
	if email != "ana@exemplo.com" {
		t.Errorf("answer not saved on contact: %q", email)
	}
	var tags int
	_ = f.db.Get(&tags, `SELECT COUNT(*) FROM conversation_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.conversation_id = $1 AND t.name = 'lead'`, f.conv)
	if tags != 1 {
		t.Errorf("tag lead attached %d times", tags)
	}
	var status string
	_ = f.db.Get(&status, `SELECT status FROM conversations WHERE id = $1`, f.conv)
	if status != "resolved" {
		t.Errorf("conversation status = %q, want resolved", status)
	}
	var data map[string]interface{}
	_ = json.Unmarshal([]byte(exec.ContextJSON), &data)
	if trace, _ := data["trace"].([]interface{}); len(trace) < 7 {
		t.Errorf("trace too short: %v", trace)
	}
}

func TestQuestionTimeoutFollowsTimeoutBranch(t *testing.T) {
	f := setup(t, fullFlow())
	ctx := context.Background()
	// Timeouts computed an hour in the past are already due.
	f.engine.now = func() time.Time { return time.Now().Add(-time.Hour) }

	f.engine.HandleInbound(ctx, f.company, f.conv, nil, "oi", true)
	f.waitStatus(t, StatusWaitingInput)
	f.engine.resumeDue(ctx)
	f.waitStatus(t, StatusCompleted)
	got := f.sender.all()
	if got[len(got)-1] != "Sem resposta, encerrando." {
		t.Errorf("messages = %q", got)
	}
}

func TestAttendantReplyStopsBot(t *testing.T) {
	f := setup(t, fullFlow())
	ctx := context.Background()
	f.engine.HandleInbound(ctx, f.company, f.conv, nil, "oi", true)
	f.waitStatus(t, StatusWaitingInput)

	if n := f.engine.CancelForConversation(ctx, f.company, f.conv, "Atendente assumiu a conversa"); n != 1 {
		t.Fatalf("cancelled %d executions", n)
	}
	before := len(f.sender.all())
	f.engine.HandleInbound(ctx, f.company, f.conv, nil, "ana@exemplo.com", false)
	time.Sleep(300 * time.Millisecond)
	if after := len(f.sender.all()); after != before {
		t.Errorf("bot kept talking after the attendant took over (%d -> %d messages)", before, after)
	}
}
