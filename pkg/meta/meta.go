package meta

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Config struct {
	AppID                 string
	AppSecret             string
	VerifyToken           string
	APIVersion            string
	AccessToken           string
	EmbeddedSignupVersion string
	ConfigID              string
}

type Client struct {
	appID                 string
	appSecret             string
	verifyToken           string
	apiVersion            string
	accessToken           string
	embeddedSignupVersion string
	configID              string
	httpClient            *http.Client
}

type EmbeddedSignupResult struct {
	AccessToken string `json:"access_token"`
	WabaID      string `json:"waba_id"`
	PhoneNumber string `json:"phone_number"`
	PhoneID     string `json:"phone_number_id"`
	Quality     string `json:"quality_rating"`
}

func NewClient(cfg Config) *Client {
	apiVersion := cfg.APIVersion
	if apiVersion == "" {
		apiVersion = "v26.0"
	}

	// NOTE: configID and verifyToken are intentionally left empty when not
	// provided via environment configuration. Previous versions of this
	// client fell back to hardcoded values tied to the original developer's
	// own Meta App (Embedded Signup config + webhook verify secret); reusing
	// those for any other tenant/deployment would silently misconfigure or
	// break the Meta connection instead of surfacing a clear setup error.
	signupVersion := cfg.EmbeddedSignupVersion
	if signupVersion != "v3" && signupVersion != "v4" {
		signupVersion = "v4"
	}
	return &Client{
		embeddedSignupVersion: signupVersion,
		appID:                 cfg.AppID,
		appSecret:             cfg.AppSecret,
		verifyToken:           cfg.VerifyToken,
		apiVersion:            apiVersion,
		accessToken:           cfg.AccessToken,
		configID:              cfg.ConfigID,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) AppID() string {
	return c.appID
}

func (c *Client) EmbeddedSignupVersion() string { return c.embeddedSignupVersion }

func (c *Client) ConfigID() string {
	return c.configID
}

func (c *Client) VerifyToken() string {
	return c.verifyToken
}

// AppSecretConfigured reports whether META_APP_SECRET is set, without exposing the
// secret itself — used to surface setup/health status to the frontend.
func (c *Client) AppSecretConfigured() bool {
	return c.appSecret != ""
}

func (c *Client) APIVersion() string {
	return c.apiVersion
}

// VerifyWebhookToken checks if the incoming hub.verify_token matches the configured verify token
func (c *Client) VerifyWebhookToken(token string) bool {
	return c.verifyToken != "" && token == c.verifyToken
}

// VerifySignature validates Meta's X-Hub-Signature-256 header using the Narrow App Secret
func (c *Client) VerifySignature(rawPayload []byte, signatureHeader string) bool {
	if c.appSecret == "" {
		// Fail closed: without an App Secret there is no way to verify the
		// payload actually came from Meta, so unsigned/unverifiable webhook
		// deliveries must be rejected rather than silently trusted.
		return false
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
	if accessToken == "" || !assetIDPattern.MatchString(phoneNumberID) {
		return nil, fmt.Errorf("credenciais do canal Meta inválidas")
	}
	var result map[string]interface{}
	err := c.graphJSON(ctx, "POST", phoneNumberID+"/messages", accessToken, map[string]interface{}{
		"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text", "text": map[string]string{"body": text},
	}, &result)
	if err != nil {
		return nil, err
	}
	messages, _ := result["messages"].([]interface{})
	if len(messages) == 0 {
		return nil, fmt.Errorf("Meta não confirmou o envio")
	}
	message, _ := messages[0].(map[string]interface{})
	if id, _ := message["id"].(string); id == "" {
		return nil, fmt.Errorf("Meta não retornou o ID da mensagem")
	}
	return result, nil
}

// SubmitTemplate creates a message template on the WABA via Meta Graph API
func (c *Client) SubmitTemplate(ctx context.Context, wabaID, accessToken, name, category, language string, components interface{}) (string, error) {
	if accessToken == "" {
		accessToken = c.accessToken
	}
	if wabaID == "" {
		return "", fmt.Errorf("waba_id is required to submit template")
	}
	if accessToken == "" {
		return "", fmt.Errorf("meta access token is required")
	}
	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/message_templates", c.apiVersion, wabaID)
	payload := map[string]interface{}{
		"name":       name,
		"category":   category,
		"language":   language,
		"components": components,
	}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("error calling Meta submit template: %w", err)
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("meta submit template error (status %d): %s", resp.StatusCode, string(respBytes))
	}
	var result struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(respBytes, &result)
	if result.ID == "" {
		return "", fmt.Errorf("Meta não retornou o ID do template")
	}
	return result.ID, nil
}

// MetaTemplateResult represents one message template as returned by the Meta Graph API,
// including its REAL current approval status (APPROVED, PENDING, REJECTED).
type MetaTemplateResult struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Category   string          `json:"category"`
	Language   string          `json:"language"`
	Status     string          `json:"status"`
	Components json.RawMessage `json:"components"`
}

// ListTemplates fetches every message template currently registered on the given WABA,
// with Meta's own approval status — used to sync real template state instead of
// fabricating local "approved" records.
func (c *Client) ListTemplates(ctx context.Context, wabaID, accessToken string) ([]MetaTemplateResult, error) {
	if accessToken == "" {
		accessToken = c.accessToken
	}
	if wabaID == "" {
		return nil, fmt.Errorf("waba_id é obrigatório para listar templates")
	}
	if accessToken == "" {
		return nil, fmt.Errorf("meta access token é obrigatório")
	}

	var all []MetaTemplateResult
	nextURL := fmt.Sprintf("https://graph.facebook.com/%s/%s/message_templates?limit=100&access_token=%s",
		c.apiVersion, wabaID, url.QueryEscape(accessToken))

	for nextURL != "" {
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, err
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("erro ao consultar templates na Meta: %w", err)
		}
		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("erro ao listar templates na Meta (status %d): %s", resp.StatusCode, string(bodyBytes))
		}

		var page struct {
			Data   []MetaTemplateResult `json:"data"`
			Paging struct {
				Next string `json:"next"`
			} `json:"paging"`
		}
		if err := json.Unmarshal(bodyBytes, &page); err != nil {
			return nil, fmt.Errorf("resposta inesperada ao listar templates na Meta: %s", string(bodyBytes))
		}
		all = append(all, page.Data...)
		nextURL = page.Paging.Next
	}

	return all, nil
}

// ParseSignedRequest verifies and decodes a Meta/Facebook "signed_request" parameter
// (format: "<base64url signature>.<base64url JSON payload>"), as sent to the Data
// Deletion Request and Deauthorize callbacks. Returns the Facebook user_id from the
// payload once the HMAC-SHA256 signature has been verified against the App Secret.
// Reference: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
func (c *Client) ParseSignedRequest(signedRequest string) (string, error) {
	parts := strings.SplitN(signedRequest, ".", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("signed_request malformado")
	}
	encodedSig, encodedPayload := parts[0], parts[1]

	sig, err := base64.RawURLEncoding.DecodeString(encodedSig)
	if err != nil {
		return "", fmt.Errorf("assinatura com codificação inválida: %w", err)
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return "", fmt.Errorf("payload com codificação inválida: %w", err)
	}

	if c.appSecret == "" {
		return "", fmt.Errorf("META_APP_SECRET não está configurado no servidor")
	}
	mac := hmac.New(sha256.New, []byte(c.appSecret))
	mac.Write([]byte(encodedPayload))
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return "", fmt.Errorf("assinatura inválida")
	}

	var payload struct {
		UserID    string `json:"user_id"`
		Algorithm string `json:"algorithm"`
	}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return "", fmt.Errorf("payload JSON inválido: %w", err)
	}
	if payload.UserID == "" {
		return "", fmt.Errorf("user_id ausente no payload")
	}
	return payload.UserID, nil
}

// UploadMedia uploads a sample media file (image/video/document) using Meta's
// Resumable Upload API and returns the resulting file handle. This handle is
// required as `example.header_handle` when creating a message template whose
// HEADER component format is IMAGE, VIDEO or DOCUMENT.
// Reference: https://developers.facebook.com/docs/graph-api/guides/upload
func (c *Client) UploadMedia(ctx context.Context, fileBytes []byte, mimeType string) (string, error) {
	if c.appID == "" || c.appSecret == "" {
		return "", fmt.Errorf("meta APP_ID e APP_SECRET precisam estar configurados no servidor para enviar mídia de exemplo")
	}
	appAccessToken := fmt.Sprintf("%s|%s", c.appID, c.appSecret)

	// 1. Start an upload session
	startURL := fmt.Sprintf("https://graph.facebook.com/%s/%s/uploads?file_length=%d&file_type=%s&access_token=%s",
		c.apiVersion, c.appID, len(fileBytes), url.QueryEscape(mimeType), url.QueryEscape(appAccessToken))

	startReq, err := http.NewRequestWithContext(ctx, "POST", startURL, nil)
	if err != nil {
		return "", err
	}
	startResp, err := c.httpClient.Do(startReq)
	if err != nil {
		return "", fmt.Errorf("falha ao iniciar sessão de upload na Meta: %w", err)
	}
	defer startResp.Body.Close()

	startBodyBytes, _ := io.ReadAll(startResp.Body)
	if startResp.StatusCode >= 400 {
		return "", fmt.Errorf("erro ao iniciar upload na Meta (status %d): %s", startResp.StatusCode, string(startBodyBytes))
	}

	var sessionResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(startBodyBytes, &sessionResp); err != nil || sessionResp.ID == "" {
		return "", fmt.Errorf("resposta inesperada ao iniciar upload na Meta: %s", string(startBodyBytes))
	}

	// 2. Upload the file bytes to the session
	uploadURL := fmt.Sprintf("https://graph.facebook.com/%s/%s", c.apiVersion, sessionResp.ID)
	uploadReq, err := http.NewRequestWithContext(ctx, "POST", uploadURL, bytes.NewReader(fileBytes))
	if err != nil {
		return "", err
	}
	uploadReq.Header.Set("Authorization", fmt.Sprintf("OAuth %s", appAccessToken))
	uploadReq.Header.Set("file_offset", "0")

	uploadResp, err := c.httpClient.Do(uploadReq)
	if err != nil {
		return "", fmt.Errorf("falha ao enviar bytes do arquivo para a Meta: %w", err)
	}
	defer uploadResp.Body.Close()

	uploadBodyBytes, _ := io.ReadAll(uploadResp.Body)
	if uploadResp.StatusCode >= 400 {
		return "", fmt.Errorf("erro no upload de mídia da Meta (status %d): %s", uploadResp.StatusCode, string(uploadBodyBytes))
	}

	var handleResp struct {
		H string `json:"h"`
	}
	if err := json.Unmarshal(uploadBodyBytes, &handleResp); err != nil || handleResp.H == "" {
		return "", fmt.Errorf("resposta inesperada no upload de mídia da Meta: %s", string(uploadBodyBytes))
	}

	return handleResp.H, nil
}
