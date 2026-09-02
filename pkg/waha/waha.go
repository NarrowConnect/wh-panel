package waha

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	BaseURL string
	APIKey  string
}

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewClient(cfg Config) *Client {
	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}

	return &Client{
		baseURL: baseURL,
		apiKey:  cfg.APIKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) BaseURL() string {
	return c.baseURL
}

type SessionInfo struct {
	Name   string                 `json:"name"`
	Status string                 `json:"status"` // STOPPED, STARTING, SCAN_QR_CODE, WORKING, FAILED
	Config map[string]interface{} `json:"config,omitempty"`
	Me     map[string]interface{} `json:"me,omitempty"`
}

type QRCodeResponse struct {
	Raw    string `json:"raw,omitempty"`
	QRCode string `json:"qr,omitempty"`
	Data   string `json:"data,omitempty"`
	Image  string `json:"image,omitempty"`
	Value  string `json:"value,omitempty"`
}

func (c *Client) request(ctx context.Context, method, endpoint string, body interface{}) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("error encoding json: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBytes)
	}

	url := fmt.Sprintf("%s%s", c.baseURL, endpoint)
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("error creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.apiKey != "" {
		req.Header.Set("X-Api-Key", c.apiKey)
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("error executing request to WAHA (%s): %w", url, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("error reading response: %w", err)
	}

	return respBytes, resp.StatusCode, nil
}

// Health checks if WAHA is reachable
func (c *Client) Health(ctx context.Context) (bool, error) {
	respBytes, code, err := c.request(ctx, "GET", "/api/server/version", nil)
	if err != nil || (code != http.StatusOK && code != http.StatusNotFound) {
		// Fallback to pinging root or sessions
		_, code2, err2 := c.request(ctx, "GET", "/api/sessions", nil)
		if err2 != nil {
			return false, err2
		}
		return code2 == http.StatusOK, nil
	}
	_ = respBytes
	return true, nil
}

// ListSessions returns all sessions registered in WAHA
func (c *Client) ListSessions(ctx context.Context, all bool) ([]SessionInfo, error) {
	endpoint := fmt.Sprintf("/api/sessions?all=%t", all)
	respBytes, code, err := c.request(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("waha returned status %d: %s", code, string(respBytes))
	}

	var sessions []SessionInfo
	if err := json.Unmarshal(respBytes, &sessions); err != nil {
		return nil, fmt.Errorf("failed to unmarshal sessions: %w", err)
	}
	return sessions, nil
}

// StartSession initiates a session (creates if not existing)
func (c *Client) StartSession(ctx context.Context, sessionName string, webhookURL string) (*SessionInfo, error) {
	payload := map[string]interface{}{
		"name": sessionName,
	}
	if webhookURL != "" {
		payload["config"] = map[string]interface{}{
			"webhooks": []map[string]interface{}{
				{
					"url":    webhookURL,
					"events": []string{"message", "message.ack", "session.status"},
				},
			},
		}
	}

	// Try POST /api/sessions/start
	respBytes, code, err := c.request(ctx, "POST", "/api/sessions/start", payload)
	if err != nil || code >= 400 {
		// Fallback to POST /api/sessions
		respBytes, code, err = c.request(ctx, "POST", "/api/sessions", payload)
		if err != nil {
			return nil, err
		}
	}

	if code != http.StatusOK && code != http.StatusCreated && code != http.StatusConflict {
		return nil, fmt.Errorf("failed to start session (status %d): %s", code, string(respBytes))
	}

	var session SessionInfo
	_ = json.Unmarshal(respBytes, &session)
	if session.Name == "" {
		session.Name = sessionName
	}
	return &session, nil
}

// GetSession retrieves the current status of a session
func (c *Client) GetSession(ctx context.Context, sessionName string) (*SessionInfo, error) {
	endpoint := fmt.Sprintf("/api/sessions/%s", sessionName)
	respBytes, code, err := c.request(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("failed to get session (status %d): %s", code, string(respBytes))
	}

	var session SessionInfo
	if err := json.Unmarshal(respBytes, &session); err != nil {
		return nil, fmt.Errorf("failed to parse session info: %w", err)
	}
	return &session, nil
}

// normalizeQRCode ensures images are properly data-URI formatted
func normalizeQRCode(val string, rawBytes []byte) string {
	if bytes.HasPrefix(rawBytes, []byte("\x89PNG")) || bytes.HasPrefix(rawBytes, []byte("GIF8")) || bytes.HasPrefix(rawBytes, []byte("\xff\xd8\xff")) {
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(rawBytes)
	}
	trimmed := strings.Trim(val, "\" \r\n\t")
	if strings.HasPrefix(trimmed, "data:image/") || strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return trimmed
	}
	if strings.HasPrefix(trimmed, "iVBORw0KGgo") || strings.HasPrefix(trimmed, "/9j/") {
		return "data:image/png;base64," + trimmed
	}
	return trimmed
}

// GetQRCode fetches the QR code string or image payload for authentication
func (c *Client) GetQRCode(ctx context.Context, sessionName string) (string, error) {
	// 1. Try GET /api/{session}/auth/qr
	endpoint := fmt.Sprintf("/api/%s/auth/qr", sessionName)
	respBytes, code, err := c.request(ctx, "GET", endpoint, nil)
	if err == nil && code == http.StatusOK {
		if bytes.HasPrefix(respBytes, []byte("\x89PNG")) {
			return normalizeQRCode("", respBytes), nil
		}
		var qrResp QRCodeResponse
		if err := json.Unmarshal(respBytes, &qrResp); err == nil {
			if qrResp.Data != "" {
				return normalizeQRCode(qrResp.Data, nil), nil
			}
			if qrResp.Image != "" {
				return normalizeQRCode(qrResp.Image, nil), nil
			}
			if qrResp.QRCode != "" {
				return normalizeQRCode(qrResp.QRCode, nil), nil
			}
			if qrResp.Value != "" {
				return normalizeQRCode(qrResp.Value, nil), nil
			}
			if qrResp.Raw != "" {
				return normalizeQRCode(qrResp.Raw, nil), nil
			}
		}
		raw := string(respBytes)
		if len(raw) > 10 {
			return normalizeQRCode(raw, nil), nil
		}
	}

	// 2. Try GET /api/sessions/{session}/auth/qr
	endpoint = fmt.Sprintf("/api/sessions/%s/auth/qr", sessionName)
	respBytes, code, err = c.request(ctx, "GET", endpoint, nil)
	if err == nil && code == http.StatusOK {
		if bytes.HasPrefix(respBytes, []byte("\x89PNG")) {
			return normalizeQRCode("", respBytes), nil
		}
		var qrResp QRCodeResponse
		if err := json.Unmarshal(respBytes, &qrResp); err == nil {
			if qrResp.Data != "" {
				return normalizeQRCode(qrResp.Data, nil), nil
			}
			if qrResp.Image != "" {
				return normalizeQRCode(qrResp.Image, nil), nil
			}
			if qrResp.QRCode != "" {
				return normalizeQRCode(qrResp.QRCode, nil), nil
			}
			if qrResp.Value != "" {
				return normalizeQRCode(qrResp.Value, nil), nil
			}
			if qrResp.Raw != "" {
				return normalizeQRCode(qrResp.Raw, nil), nil
			}
		}
		return normalizeQRCode(string(respBytes), nil), nil
	}

	return "", fmt.Errorf("qr code not available yet (session might be starting or already connected)")
}

// LogoutSession logs out of WhatsApp and resets the session
func (c *Client) LogoutSession(ctx context.Context, sessionName string) error {
	endpoint := fmt.Sprintf("/api/sessions/%s/logout", sessionName)
	respBytes, code, err := c.request(ctx, "POST", endpoint, nil)
	if err != nil {
		// Fallback to /api/sessions/stop
		endpoint = fmt.Sprintf("/api/sessions/%s/stop", sessionName)
		respBytes, code, err = c.request(ctx, "POST", endpoint, nil)
		if err != nil {
			return err
		}
	}
	if code >= 400 && code != http.StatusNotFound {
		return fmt.Errorf("failed to logout session: %s", string(respBytes))
	}
	return nil
}

// SendTextMessage sends a text message to a WhatsApp chat via WAHA
func (c *Client) SendTextMessage(ctx context.Context, sessionName, chatId, text string) (map[string]interface{}, error) {
	// Normalize chat ID (e.g. 5511999998888@c.us)
	if !strings.Contains(chatId, "@") {
		chatId = fmt.Sprintf("%s@c.us", chatId)
	}

	payload := map[string]interface{}{
		"session": sessionName,
		"chatId":  chatId,
		"text":    text,
	}

	respBytes, code, err := c.request(ctx, "POST", "/api/sendText", payload)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("waha sendText returned status %d: %s", code, string(respBytes))
	}

	var result map[string]interface{}
	_ = json.Unmarshal(respBytes, &result)
	return result, nil
}
