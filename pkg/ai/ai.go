// Package ai generates one chatbot reply with the company's own provider key
// (configured in Planos & Chaves de IA). Anthropic goes through the official
// SDK; OpenAI and DeepSeek through their chat-completions HTTP APIs.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// Default models per provider, used when the company did not pick one.
var DefaultModels = map[string]string{
	"anthropic": "claude-opus-5",
	"openai":    "gpt-4o-mini",
	"deepseek":  "deepseek-chat",
}

// Base URLs; tests point them at an httptest server.
var (
	AnthropicBaseURL = "" // empty: SDK default
	OpenAIBaseURL    = "https://api.openai.com/v1"
	DeepSeekBaseURL  = "https://api.deepseek.com"
)

// ErrRefused means the provider declined to answer (safety refusal).
var ErrRefused = errors.New("ai: o provedor recusou responder")

type Message struct {
	Role string // "user" (the contact) or "assistant" (the business)
	Text string
}

type Request struct {
	Provider string
	Model    string
	APIKey   string
	System   string
	History  []Message
}

// Generate returns the reply text. History should end with the contact's message.
func Generate(ctx context.Context, req Request) (string, error) {
	if strings.TrimSpace(req.APIKey) == "" {
		return "", errors.New("ai: chave de API não configurada")
	}
	model := strings.TrimSpace(req.Model)
	if model == "" || model == "default" {
		model = DefaultModels[req.Provider]
	}
	history := normalize(req.History)
	if len(history) == 0 {
		return "", errors.New("ai: nenhuma mensagem do contato para responder")
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	switch req.Provider {
	case "anthropic":
		return generateAnthropic(ctx, model, req.APIKey, req.System, history)
	case "openai":
		return generateChatCompletions(ctx, OpenAIBaseURL, model, req.APIKey, req.System, history)
	case "deepseek":
		return generateChatCompletions(ctx, DeepSeekBaseURL, model, req.APIKey, req.System, history)
	default:
		return "", fmt.Errorf("ai: provedor %q não suportado", req.Provider)
	}
}

// normalize drops empty turns, merges consecutive turns of the same role and
// makes the history start with the contact, as the chat APIs require.
func normalize(in []Message) []Message {
	var out []Message
	for _, m := range in {
		text := strings.TrimSpace(m.Text)
		if text == "" || (m.Role != "user" && m.Role != "assistant") {
			continue
		}
		if len(out) > 0 && out[len(out)-1].Role == m.Role {
			out[len(out)-1].Text += "\n" + text
			continue
		}
		out = append(out, Message{Role: m.Role, Text: text})
	}
	for len(out) > 0 && out[0].Role != "user" {
		out = out[1:]
	}
	return out
}

// Models that accept output_config.effort and the refusal fallback chain.
func supportsEffort(model string) bool {
	for _, p := range []string{"claude-opus-5", "claude-fable-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"} {
		if strings.HasPrefix(model, p) {
			return true
		}
	}
	return false
}

func supportsFallbacks(model string) bool {
	return strings.HasPrefix(model, "claude-opus-5") || strings.HasPrefix(model, "claude-fable-5")
}

func generateAnthropic(ctx context.Context, model, apiKey, system string, history []Message) (string, error) {
	opts := []option.RequestOption{option.WithAPIKey(apiKey), option.WithMaxRetries(2)}
	if AnthropicBaseURL != "" {
		opts = append(opts, option.WithBaseURL(AnthropicBaseURL))
	}
	client := anthropic.NewClient(opts...)

	msgs := make([]anthropic.BetaMessageParam, 0, len(history))
	for _, m := range history {
		block := anthropic.NewBetaTextBlock(m.Text)
		if m.Role == "user" {
			msgs = append(msgs, anthropic.NewBetaUserMessage(block))
		} else {
			msgs = append(msgs, anthropic.BetaMessageParam{Role: anthropic.BetaMessageParamRoleAssistant, Content: []anthropic.BetaContentBlockParamUnion{block}})
		}
	}

	params := anthropic.BetaMessageNewParams{
		Model: anthropic.Model(model),
		// Room for adaptive thinking plus a chat-sized answer.
		MaxTokens: 8000,
		Messages:  msgs,
	}
	if system != "" {
		params.System = []anthropic.BetaTextBlockParam{{Text: system}}
	}
	if supportsEffort(model) {
		// Short customer-service replies do not need deep reasoning.
		params.OutputConfig = anthropic.BetaOutputConfigParam{Effort: anthropic.BetaOutputConfigEffortLow}
	}
	if supportsFallbacks(model) {
		// A safety refusal is re-served by another model inside the same call.
		params.Betas = []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01}
		params.Fallbacks = anthropic.BetaFallbacksParamOfDefault()
	}

	resp, err := client.Beta.Messages.New(ctx, params)
	if err != nil {
		var apiErr *anthropic.Error
		if errors.As(err, &apiErr) {
			return "", fmt.Errorf("ai: anthropic respondeu %d: %s", apiErr.StatusCode, apiErr.Error())
		}
		return "", fmt.Errorf("ai: anthropic: %w", err)
	}
	if resp.StopReason == anthropic.BetaStopReasonRefusal {
		return "", ErrRefused
	}
	var sb strings.Builder
	for _, block := range resp.Content {
		if tb, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			sb.WriteString(tb.Text)
		}
	}
	text := strings.TrimSpace(sb.String())
	if text == "" {
		return "", errors.New("ai: resposta vazia")
	}
	return text, nil
}

func generateChatCompletions(ctx context.Context, baseURL, model, apiKey, system string, history []Message) (string, error) {
	type chatMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	msgs := make([]chatMsg, 0, len(history)+1)
	if system != "" {
		msgs = append(msgs, chatMsg{Role: "system", Content: system})
	}
	for _, m := range history {
		msgs = append(msgs, chatMsg{Role: m.Role, Content: m.Text})
	}
	body, _ := json.Marshal(map[string]any{"model": model, "messages": msgs})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("ai: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("ai: provedor respondeu %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var parsed struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content string `json:"content"`
				Refusal string `json:"refusal"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Choices) == 0 {
		return "", errors.New("ai: resposta inválida do provedor")
	}
	choice := parsed.Choices[0]
	if choice.Message.Refusal != "" || choice.FinishReason == "content_filter" {
		return "", ErrRefused
	}
	text := strings.TrimSpace(choice.Message.Content)
	if text == "" {
		return "", errors.New("ai: resposta vazia")
	}
	return text, nil
}
