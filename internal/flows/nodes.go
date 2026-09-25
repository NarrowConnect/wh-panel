package flows

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"wh-panel/internal/models"
)

// Node types understood by both the canvas (web/src/pages/Flows.jsx) and the engine.
const (
	NodeTrigger       = "trigger"
	NodeSendMessage   = "send_message"
	NodeAsk           = "ask"
	NodeCondition     = "condition"
	NodeWait          = "wait"
	NodeTransferQueue = "transfer_queue"
	NodeAddTag        = "add_tag"
	NodeCRMMove       = "crm_move"
	NodeWebhook       = "webhook"
	NodeAIAgent       = "ai_agent"
	NodeEnd           = "end"
)

// Output handles per node type. The first one is the default: legacy edges
// without a handle leave from it.
var nodeHandles = map[string][]string{
	NodeTrigger:       {"next"},
	NodeSendMessage:   {"next"},
	NodeAsk:           {"reply", "timeout"},
	NodeCondition:     {"true", "false"},
	NodeWait:          {"next"},
	NodeTransferQueue: {"next"},
	NodeAddTag:        {"next"},
	NodeCRMMove:       {"next"},
	NodeWebhook:       {"next", "error"},
	NodeAIAgent:       {"done", "handoff"},
	NodeEnd:           {},
}

// Trigger events.
const (
	TriggerNewConversation = "new_conversation"
	TriggerEveryMessage    = "every_message"
	TriggerKeyword         = "keyword"
	TriggerManual          = "manual"
)

// NormalizeDefinition maps node types saved by older editors onto the
// canonical ones so existing flows keep running.
func NormalizeDefinition(def models.FlowDefinition) models.FlowDefinition {
	for i := range def.Nodes {
		n := &def.Nodes[i]
		if n.Data == nil {
			n.Data = map[string]interface{}{}
		}
		switch n.Type {
		case "message":
			n.Type = NodeSendMessage
			if str(n.Data, "message") == "" {
				n.Data["message"] = str(n.Data, "text")
			}
		case "collect", "collect_input":
			n.Type = NodeAsk
			if str(n.Data, "save_to") == "" {
				n.Data["save_to"] = str(n.Data, "field")
			}
		case "delay":
			n.Type = NodeWait
		case "http_request", "call_integration":
			n.Type = NodeWebhook
		case "crm_stage", "update_card", "update_card_stage":
			n.Type = NodeCRMMove
		}
		if n.Type == NodeWait && str(n.Data, "unit") == "" {
			// Legacy waits were expressed in seconds.
			secs := num(n.Data, "seconds")
			if secs == 0 {
				secs = num(n.Data, "delay")
			}
			n.Data["amount"] = secs
			n.Data["unit"] = "seconds"
		}
	}
	return def
}

// StartNode is the trigger node, or the first node nothing points to.
func StartNode(def models.FlowDefinition) *models.FlowNode {
	for i := range def.Nodes {
		if def.Nodes[i].Type == NodeTrigger {
			return &def.Nodes[i]
		}
	}
	targets := map[string]bool{}
	for _, e := range def.Edges {
		targets[e.Target] = true
	}
	for i := range def.Nodes {
		if !targets[def.Nodes[i].ID] {
			return &def.Nodes[i]
		}
	}
	if len(def.Nodes) > 0 {
		return &def.Nodes[0]
	}
	return nil
}

func findNode(def models.FlowDefinition, id string) *models.FlowNode {
	for i := range def.Nodes {
		if def.Nodes[i].ID == id {
			return &def.Nodes[i]
		}
	}
	return nil
}

func edgeHandle(e models.FlowEdge) string {
	if e.SourceHandle != "" {
		return e.SourceHandle
	}
	if e.Label != "" {
		return e.Label
	}
	if l, ok := e.Data["label"].(string); ok {
		return l
	}
	return ""
}

// NextNode follows the edge leaving nodeID through handle. An empty handle
// means the node's default output; edges without a handle (older flows)
// count as the default output.
func NextNode(def models.FlowDefinition, node *models.FlowNode, handle string) *models.FlowNode {
	handles := nodeHandles[node.Type]
	def0 := ""
	if len(handles) > 0 {
		def0 = handles[0]
	}
	if handle == "" {
		handle = def0
	}
	var fallback *models.FlowNode
	for _, e := range def.Edges {
		if e.Source != node.ID {
			continue
		}
		h := edgeHandle(e)
		if strings.EqualFold(h, handle) {
			return findNode(def, e.Target)
		}
		if h == "" && handle == def0 && fallback == nil {
			fallback = findNode(def, e.Target)
		}
	}
	return fallback
}

// EvaluateCondition compares actual against value with operator.
func EvaluateCondition(actual, operator, value string) bool {
	a := strings.ToLower(strings.TrimSpace(actual))
	v := strings.ToLower(strings.TrimSpace(value))
	switch operator {
	case "not_equals":
		return a != v
	case "contains":
		return v != "" && strings.Contains(a, v)
	case "not_contains":
		return v == "" || !strings.Contains(a, v)
	case "starts_with":
		return strings.HasPrefix(a, v)
	case "empty":
		return a == ""
	case "not_empty":
		return a != ""
	case "in":
		for _, opt := range strings.Split(v, ",") {
			if strings.TrimSpace(opt) == a {
				return true
			}
		}
		return false
	case "contains_any":
		for _, opt := range strings.Split(v, ",") {
			if o := strings.TrimSpace(opt); o != "" && strings.Contains(a, o) {
				return true
			}
		}
		return false
	case "gte", "lte", "gt", "lt":
		af, err1 := parseNumber(a)
		vf, err2 := parseNumber(v)
		if err1 != nil || err2 != nil {
			return false
		}
		switch operator {
		case "gte":
			return af >= vf
		case "lte":
			return af <= vf
		case "gt":
			return af > vf
		default:
			return af < vf
		}
	default: // equals
		return a == v
	}
}

func parseNumber(s string) (float64, error) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	return strconv.ParseFloat(s, 64)
}

var placeholder = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}`)

// Render replaces {{contact.name}}-style placeholders; unknown ones become empty.
func Render(text string, vars map[string]string) string {
	return placeholder.ReplaceAllStringFunc(text, func(m string) string {
		key := placeholder.FindStringSubmatch(m)[1]
		return vars[key]
	})
}

// InboundEvent is an inbound contact message as seen by the trigger matcher.
type InboundEvent struct {
	Text            string
	ChannelID       string
	NewConversation bool
}

// MatchTrigger reports whether a trigger node fires for the event, and a
// priority used to pick one flow when several match (keyword first).
func MatchTrigger(trigger *models.FlowNode, ev InboundEvent) (bool, int) {
	if trigger == nil || trigger.Type != NodeTrigger {
		return false, 0
	}
	if ids := strList(trigger.Data, "channel_ids"); len(ids) > 0 {
		found := false
		for _, id := range ids {
			if id == ev.ChannelID {
				found = true
				break
			}
		}
		if !found {
			return false, 0
		}
	}
	switch str(trigger.Data, "event") {
	case TriggerKeyword:
		text := strings.ToLower(ev.Text)
		for _, kw := range strings.Split(str(trigger.Data, "keywords"), ",") {
			if kw = strings.ToLower(strings.TrimSpace(kw)); kw != "" && strings.Contains(text, kw) {
				return true, 3
			}
		}
		return false, 0
	case TriggerNewConversation, "":
		return ev.NewConversation, 2
	case TriggerEveryMessage:
		return true, 1
	default: // manual
		return false, 0
	}
}

// WaitDuration converts a wait node's amount/unit.
func WaitDuration(data map[string]interface{}) time.Duration {
	amount := num(data, "amount")
	switch str(data, "unit") {
	case "seconds":
		return time.Duration(amount * float64(time.Second))
	case "hours":
		return time.Duration(amount * float64(time.Hour))
	case "days":
		return time.Duration(amount * 24 * float64(time.Hour))
	default:
		return time.Duration(amount * float64(time.Minute))
	}
}

// Validate lists problems that would stop a flow from working. Only
// active flows must be free of them; drafts can be saved half-built.
func Validate(def models.FlowDefinition) []string {
	var problems []string
	ids := map[string]bool{}
	triggers := 0
	for _, n := range def.Nodes {
		if ids[n.ID] {
			problems = append(problems, fmt.Sprintf("Etapa duplicada: %s", n.ID))
		}
		ids[n.ID] = true
		if _, ok := nodeHandles[n.Type]; !ok {
			problems = append(problems, fmt.Sprintf("Tipo de etapa desconhecido: %s", n.Type))
			continue
		}
		name := n.Title
		if name == "" {
			name = n.Type
		}
		switch n.Type {
		case NodeTrigger:
			triggers++
			if str(n.Data, "event") == TriggerKeyword && strings.TrimSpace(str(n.Data, "keywords")) == "" {
				problems = append(problems, "Início: informe ao menos uma palavra-chave")
			}
		case NodeSendMessage:
			if strings.TrimSpace(str(n.Data, "message")) == "" {
				problems = append(problems, fmt.Sprintf("%q: a mensagem está vazia", name))
			}
		case NodeAsk:
			if strings.TrimSpace(str(n.Data, "message")) == "" {
				problems = append(problems, fmt.Sprintf("%q: escreva a pergunta", name))
			}
		case NodeCondition:
			if str(n.Data, "field") == "" {
				problems = append(problems, fmt.Sprintf("%q: escolha o campo a comparar", name))
			}
		case NodeWait:
			if WaitDuration(n.Data) <= 0 {
				problems = append(problems, fmt.Sprintf("%q: informe quanto tempo esperar", name))
			}
		case NodeTransferQueue:
			if str(n.Data, "queue_id") == "" {
				problems = append(problems, fmt.Sprintf("%q: escolha a fila", name))
			}
		case NodeAddTag:
			if strings.TrimSpace(str(n.Data, "tag")) == "" {
				problems = append(problems, fmt.Sprintf("%q: informe a tag", name))
			}
		case NodeCRMMove:
			if str(n.Data, "stage_id") == "" && str(n.Data, "stage_name") == "" {
				problems = append(problems, fmt.Sprintf("%q: escolha a etapa do CRM", name))
			}
		case NodeWebhook:
			u, err := url.Parse(str(n.Data, "url"))
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				problems = append(problems, fmt.Sprintf("%q: informe uma URL http(s) válida", name))
			}
		case NodeAIAgent:
			if strings.TrimSpace(str(n.Data, "instructions")) == "" {
				problems = append(problems, fmt.Sprintf("%q: escreva as instruções do agente", name))
			}
		}
	}
	if triggers == 0 {
		problems = append(problems, "Adicione a etapa Início para definir quando o fluxo começa")
	}
	if triggers > 1 {
		problems = append(problems, "O fluxo deve ter apenas uma etapa Início")
	}
	for _, e := range def.Edges {
		if !ids[e.Source] || !ids[e.Target] {
			problems = append(problems, "Há uma conexão apontando para uma etapa que não existe mais")
			break
		}
	}
	if start := StartNode(def); start != nil && len(def.Nodes) > 1 && NextNode(def, start, "") == nil {
		problems = append(problems, "Conecte a etapa Início à primeira ação")
	}
	return problems
}

func str(m map[string]interface{}, k string) string {
	switch v := m[k].(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	}
	return ""
}

func num(m map[string]interface{}, k string) float64 {
	switch v := m[k].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case string:
		f, _ := parseNumber(v)
		return f
	}
	return 0
}

func boolean(m map[string]interface{}, k string) bool {
	switch v := m[k].(type) {
	case bool:
		return v
	case string:
		return v == "true"
	}
	return false
}

func strList(m map[string]interface{}, k string) []string {
	var out []string
	if arr, ok := m[k].([]interface{}); ok {
		for _, v := range arr {
			if s, ok := v.(string); ok && s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}
