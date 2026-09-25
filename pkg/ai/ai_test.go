package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeMergesAndStartsWithContact(t *testing.T) {
	got := normalize([]Message{
		{Role: "assistant", Text: "Olá!"},
		{Role: "user", Text: "Oi"},
		{Role: "user", Text: "tudo bem?"},
		{Role: "assistant", Text: "  "},
		{Role: "system", Text: "ignorar"},
		{Role: "assistant", Text: "Tudo sim"},
	})
	want := []Message{{Role: "user", Text: "Oi\ntudo bem?"}, {Role: "assistant", Text: "Tudo sim"}}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %+v, want %+v", got, want)
		}
	}
}

func anthropicServer(t *testing.T, stopReason string, check func(body map[string]any, r *http.Request)) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/v1/messages") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		if check != nil {
			check(body, r)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5",
			"content":[{"type":"text","text":"Podemos agendar sábado às 9h."}],
			"stop_reason":"`+stopReason+`","usage":{"input_tokens":10,"output_tokens":5}}`)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestAnthropicReplyUsesSystemEffortAndFallbacks(t *testing.T) {
	srv := anthropicServer(t, "end_turn", func(body map[string]any, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-ant-test" {
			t.Errorf("missing api key header")
		}
		if !strings.Contains(r.Header.Get("anthropic-beta"), "server-side-fallback-2026-07-01") {
			t.Errorf("fallback beta header missing: %q", r.Header.Get("anthropic-beta"))
		}
		if body["model"] != "claude-opus-5" {
			t.Errorf("model = %v", body["model"])
		}
		if body["fallbacks"] != "default" {
			t.Errorf("fallbacks = %v", body["fallbacks"])
		}
		if oc, _ := body["output_config"].(map[string]any); oc["effort"] != "low" {
			t.Errorf("output_config = %v", body["output_config"])
		}
		msgs, _ := body["messages"].([]any)
		if len(msgs) != 1 {
			t.Errorf("messages = %v", msgs)
		}
		if !strings.Contains(string(mustJSON(body["system"])), "Clínica") {
			t.Errorf("system = %v", body["system"])
		}
	})
	AnthropicBaseURL = srv.URL
	t.Cleanup(func() { AnthropicBaseURL = "" })

	got, err := Generate(context.Background(), Request{
		Provider: "anthropic", APIKey: "sk-ant-test", System: "Você atende a Clínica.",
		History: []Message{{Role: "user", Text: "Vocês abrem sábado?"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != "Podemos agendar sábado às 9h." {
		t.Errorf("reply = %q", got)
	}
}

func TestAnthropicOlderModelSkipsEffortAndFallbacks(t *testing.T) {
	srv := anthropicServer(t, "end_turn", func(body map[string]any, r *http.Request) {
		if _, ok := body["output_config"]; ok {
			t.Errorf("effort sent to a model without effort support")
		}
		if _, ok := body["fallbacks"]; ok {
			t.Errorf("fallbacks sent to a model without fallback support")
		}
	})
	AnthropicBaseURL = srv.URL
	t.Cleanup(func() { AnthropicBaseURL = "" })
	if _, err := Generate(context.Background(), Request{Provider: "anthropic", Model: "claude-haiku-4-5", APIKey: "k", History: []Message{{Role: "user", Text: "oi"}}}); err != nil {
		t.Fatal(err)
	}
}

func TestAnthropicRefusal(t *testing.T) {
	srv := anthropicServer(t, "refusal", nil)
	AnthropicBaseURL = srv.URL
	t.Cleanup(func() { AnthropicBaseURL = "" })
	_, err := Generate(context.Background(), Request{Provider: "anthropic", APIKey: "k", History: []Message{{Role: "user", Text: "oi"}}})
	if !errors.Is(err, ErrRefused) {
		t.Fatalf("err = %v, want ErrRefused", err)
	}
}

func TestOpenAICompatible(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" || r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("bad request %s %s", r.URL.Path, r.Header.Get("Authorization"))
		}
		var body struct {
			Model    string `json:"model"`
			Messages []struct{ Role, Content string }
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Model != "gpt-4o-mini" || len(body.Messages) != 2 || body.Messages[0].Role != "system" {
			t.Errorf("body = %+v", body)
		}
		_, _ = io.WriteString(w, `{"choices":[{"finish_reason":"stop","message":{"content":"Olá!"}}]}`)
	}))
	defer srv.Close()
	OpenAIBaseURL = srv.URL
	got, err := Generate(context.Background(), Request{Provider: "openai", APIKey: "sk-test", System: "s", History: []Message{{Role: "user", Text: "oi"}}})
	if err != nil || got != "Olá!" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestMissingKeyAndEmptyHistory(t *testing.T) {
	if _, err := Generate(context.Background(), Request{Provider: "openai"}); err == nil {
		t.Error("expected error without key")
	}
	if _, err := Generate(context.Background(), Request{Provider: "openai", APIKey: "k", History: []Message{{Role: "assistant", Text: "só a empresa falou"}}}); err == nil {
		t.Error("expected error without a contact message")
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
