package flows

import (
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBlockedIP(t *testing.T) {
	for _, s := range []string{"127.0.0.1", "10.1.2.3", "192.168.0.10", "172.16.5.4", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "0.0.0.0"} {
		if !blockedIP(net.ParseIP(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "157.240.1.35", "2606:4700::1111"} {
		if blockedIP(net.ParseIP(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

func TestWebhookClientRefusesLoopback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	defer srv.Close()
	t.Setenv("FLOWS_WEBHOOK_ALLOW_PRIVATE", "")
	_, err := webhookClient().Get(srv.URL)
	if err == nil || !errors.Is(err, errBlockedAddress) {
		t.Fatalf("expected blocked address error, got %v", err)
	}
	t.Setenv("FLOWS_WEBHOOK_ALLOW_PRIVATE", "true")
	resp, err := webhookClient().Get(srv.URL)
	if err != nil {
		t.Fatalf("override should allow loopback: %v", err)
	}
	resp.Body.Close()
}
