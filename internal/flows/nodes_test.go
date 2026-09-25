package flows

import (
	"strings"
	"testing"
	"time"

	"wh-panel/internal/models"
)

func node(id, typ string, data map[string]interface{}) models.FlowNode {
	if data == nil {
		data = map[string]interface{}{}
	}
	return models.FlowNode{ID: id, Type: typ, Data: data}
}

func TestNormalizeLegacyNodes(t *testing.T) {
	def := NormalizeDefinition(models.FlowDefinition{Nodes: []models.FlowNode{
		node("a", "message", map[string]interface{}{"text": "Oi"}),
		node("b", "collect_input", map[string]interface{}{"field": "contact.email"}),
		node("c", "crm_stage", map[string]interface{}{"stage_name": "Proposta"}),
		node("d", "delay", map[string]interface{}{"seconds": float64(30)}),
	}})
	if def.Nodes[0].Type != NodeSendMessage || def.Nodes[0].Data["message"] != "Oi" {
		t.Errorf("message not mapped: %+v", def.Nodes[0])
	}
	if def.Nodes[1].Type != NodeAsk || def.Nodes[1].Data["save_to"] != "contact.email" {
		t.Errorf("collect not mapped: %+v", def.Nodes[1])
	}
	if def.Nodes[2].Type != NodeCRMMove {
		t.Errorf("crm_stage not mapped: %+v", def.Nodes[2])
	}
	if WaitDuration(def.Nodes[3].Data) != 30*time.Second {
		t.Errorf("legacy delay = %v", WaitDuration(def.Nodes[3].Data))
	}
}

func TestNextNodeFollowsHandles(t *testing.T) {
	def := models.FlowDefinition{
		Nodes: []models.FlowNode{node("start", NodeTrigger, nil), node("cond", NodeCondition, nil), node("yes", NodeSendMessage, nil), node("no", NodeSendMessage, nil), node("ask", NodeAsk, nil), node("late", NodeSendMessage, nil)},
		Edges: []models.FlowEdge{
			{Source: "start", Target: "cond"},
			{Source: "cond", Target: "yes", SourceHandle: "true"},
			{Source: "cond", Target: "no", Label: "false"}, // older editors used labels
			{Source: "ask", Target: "yes", SourceHandle: "reply"},
			{Source: "ask", Target: "late", SourceHandle: "timeout"},
		},
	}
	get := func(id string) *models.FlowNode { return findNode(def, id) }
	if n := NextNode(def, get("start"), ""); n == nil || n.ID != "cond" {
		t.Errorf("start -> %v", n)
	}
	if n := NextNode(def, get("cond"), "true"); n == nil || n.ID != "yes" {
		t.Errorf("true -> %v", n)
	}
	if n := NextNode(def, get("cond"), "false"); n == nil || n.ID != "no" {
		t.Errorf("false -> %v", n)
	}
	if n := NextNode(def, get("ask"), "timeout"); n == nil || n.ID != "late" {
		t.Errorf("timeout -> %v", n)
	}
	if n := NextNode(def, get("yes"), ""); n != nil {
		t.Errorf("dangling node should end, got %v", n)
	}
}

func TestNextNodeDoesNotTakeUnlabelledEdgeForSecondaryHandle(t *testing.T) {
	def := models.FlowDefinition{
		Nodes: []models.FlowNode{node("w", NodeWebhook, nil), node("n", NodeSendMessage, nil)},
		Edges: []models.FlowEdge{{Source: "w", Target: "n"}},
	}
	if NextNode(def, &def.Nodes[0], "error") != nil {
		t.Error("an edge without handle belongs to the default output only")
	}
	if n := NextNode(def, &def.Nodes[0], ""); n == nil || n.ID != "n" {
		t.Error("default output should follow the unlabelled edge")
	}
}

func TestEvaluateCondition(t *testing.T) {
	cases := []struct {
		actual, op, value string
		want              bool
	}{
		{"Quero AGENDAR", "contains", "agendar", true},
		{"oi", "equals", "OI ", true},
		{"oi", "not_equals", "oi", false},
		{"", "empty", "", true},
		{"x", "not_empty", "", true},
		{"boleto", "in", "pix, boleto", true},
		{"quero o boleto de março", "contains_any", "pix, boleto", true},
		{"12,5", "gte", "10", true},
		{"abc", "gte", "10", false},
		{"Maria", "starts_with", "ma", true},
		{"texto", "not_contains", "xyz", true},
	}
	for _, c := range cases {
		if got := EvaluateCondition(c.actual, c.op, c.value); got != c.want {
			t.Errorf("%q %s %q = %v, want %v", c.actual, c.op, c.value, got, c.want)
		}
	}
}

func TestMatchTrigger(t *testing.T) {
	kw := node("t", NodeTrigger, map[string]interface{}{"event": TriggerKeyword, "keywords": "boleto, 2ª via"})
	if ok, prio := MatchTrigger(&kw, InboundEvent{Text: "Preciso da 2ª via"}); !ok || prio != 3 {
		t.Errorf("keyword match = %v %d", ok, prio)
	}
	if ok, _ := MatchTrigger(&kw, InboundEvent{Text: "oi"}); ok {
		t.Error("keyword should not match")
	}
	nc := node("t", NodeTrigger, map[string]interface{}{"event": TriggerNewConversation})
	if ok, _ := MatchTrigger(&nc, InboundEvent{Text: "oi", NewConversation: false}); ok {
		t.Error("new_conversation must not fire on an existing conversation")
	}
	scoped := node("t", NodeTrigger, map[string]interface{}{"event": TriggerEveryMessage, "channel_ids": []interface{}{"ch-1"}})
	if ok, _ := MatchTrigger(&scoped, InboundEvent{ChannelID: "ch-2"}); ok {
		t.Error("channel filter ignored")
	}
	if ok, _ := MatchTrigger(&scoped, InboundEvent{ChannelID: "ch-1"}); !ok {
		t.Error("channel filter should allow ch-1")
	}
	manual := node("t", NodeTrigger, map[string]interface{}{"event": TriggerManual})
	if ok, _ := MatchTrigger(&manual, InboundEvent{NewConversation: true}); ok {
		t.Error("manual flows never auto-start")
	}
}

func TestRender(t *testing.T) {
	got := Render("Olá {{ contact.name }}, recebemos: {{last_input}}{{unknown}}", map[string]string{"contact.name": "Ana", "last_input": "oi"})
	if got != "Olá Ana, recebemos: oi" {
		t.Errorf("Render = %q", got)
	}
}

func TestValidate(t *testing.T) {
	good := models.FlowDefinition{
		Nodes: []models.FlowNode{
			node("start", NodeTrigger, map[string]interface{}{"event": TriggerNewConversation}),
			node("m", NodeSendMessage, map[string]interface{}{"message": "Oi"}),
		},
		Edges: []models.FlowEdge{{Source: "start", Target: "m"}},
	}
	if p := Validate(good); len(p) != 0 {
		t.Errorf("valid flow reported %v", p)
	}

	bad := models.FlowDefinition{
		Nodes: []models.FlowNode{
			node("m", NodeSendMessage, nil),
			node("w", NodeWebhook, map[string]interface{}{"url": "ftp://x"}),
			node("q", NodeTransferQueue, nil),
		},
		Edges: []models.FlowEdge{{Source: "m", Target: "gone"}},
	}
	joined := strings.Join(Validate(bad), " | ")
	for _, want := range []string{"Início", "mensagem está vazia", "URL", "fila", "não existe mais"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing problem %q in %q", want, joined)
		}
	}
}
