package meta

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestMetaClientSignatureVerification(t *testing.T) {
	appSecret := "test_secret_12345"
	client := NewClient(Config{
		AppID:       "123456789",
		AppSecret:   appSecret,
		VerifyToken: "my_verify_secret",
		ConfigID:    "894644480139460",
	})

	if client.ConfigID() != "894644480139460" {
		t.Fatalf("expected config ID 894644480139460, got %s", client.ConfigID())
	}

	if !client.VerifyWebhookToken("my_verify_secret") {
		t.Fatalf("verify token should match")
	}

	payload := []byte(`{"entry":[{"id":"123","changes":[]}]}`)
	mac := hmac.New(sha256.New, []byte(appSecret))
	mac.Write(payload)
	validSig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	if !client.VerifySignature(payload, validSig) {
		t.Fatalf("valid signature should be accepted")
	}

	if client.VerifySignature(payload, "sha256=invalid_hash") {
		t.Fatalf("invalid signature should be rejected")
	}
}

func TestMetaClientDefaults(t *testing.T) {
	client := NewClient(Config{})
	// configID and verifyToken must stay empty when not explicitly configured —
	// falling back to a hardcoded value here would silently misconfigure any
	// tenant/deployment other than the original one these values were tied to.
	if client.ConfigID() != "" {
		t.Errorf("default config ID should be empty when unset, got %s", client.ConfigID())
	}
	if client.APIVersion() != "v26.0" {
		t.Errorf("default api version should be v26.0, got %s", client.APIVersion())
	}
	if client.VerifyToken() != "" {
		t.Errorf("default verify token should be empty when unset, got %s", client.VerifyToken())
	}
}
