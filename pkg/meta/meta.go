package meta

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	AppID       string
	AppSecret   string
	VerifyToken string
	APIVersion  string
	AccessToken string
}

type Client struct {
	appID       string
	appSecret   string
	verifyToken string
	apiVersion  string
	accessToken string
	httpClient  *http.Client
}

func NewClient(cfg Config) *Client {
	apiVersion := cfg.APIVersion
	if apiVersion == "" {
		apiVersion = "v20.0"
	}
	verifyToken := cfg.VerifyToken
	if verifyToken == "" {
		verifyToken = "narrow_wh_verify_secret_2026"
	}

	return &Client{
		appID:       cfg.AppID,
		appSecret:   cfg.AppSecret,
		verifyToken: verifyToken,
		apiVersion:  apiVersion,
		accessToken: cfg.AccessToken,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) AppID() string {
	return c.appID
}

func (c *Client) VerifyToken() string {
	return c.verifyToken
}

func (c *Client) APIVersion() string {
	return c.apiVersion
}

// VerifyWebhookToken checks if the incoming hub.verify_token matches the configured verify token
func (c *Client) VerifyWebhookToken(token string) bool {
	return token == c.verifyToken
}

// VerifySignature validates Meta's X-Hub-Signature-256 header using the Narrow App Secret
func (c *Client) VerifySignature(rawPayload []byte, signatureHeader string) bool {
	if c.appSecret == "" {
		// If App Secret is not configured yet in .env, accept for initial setup
		return true
	}
	if signatureHeader == "" {
		return false
	}

	parts := strings.SplitN(signatureHeader, "=", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "sha256" {
		return false
	}

	expectedSignature := parts[1]

	mac := hmac.New(sha256.New, []byte(c.appSecret))
	mac.Write(rawPayload)
	calculatedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(calculatedSignature), []byte(expectedSignature))
}

// SendTextMessage sends an official WhatsApp Cloud API message via Meta Graph API
func (c *Client) SendTextMessage(ctx context.Context, phoneNumberID, accessToken, to, text string) (map[string]interface{}, error) {
	if accessToken == "" {
		accessToken = c.accessToken
	}
	if accessToken == "" {
		return nil, fmt.Errorf("meta access token is required")
	}

	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/messages", c.apiVersion, phoneNumberID)

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                to,
		"type":              "text",
		"text": map[string]string{
			"body": text,
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error calling Meta Graph API: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("meta graph API error (status %d): %s", resp.StatusCode, string(respBytes))
	}

	var result map[string]interface{}
	_ = json.Unmarshal(respBytes, &result)
	return result, nil
}
