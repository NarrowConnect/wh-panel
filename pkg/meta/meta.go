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
	ConfigID    string
}

type Client struct {
	appID       string
	appSecret   string
	verifyToken string
	apiVersion  string
	accessToken string
	configID    string
	httpClient  *http.Client
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
		apiVersion = "v20.0"
	}
	verifyToken := cfg.VerifyToken
	if verifyToken == "" {
		verifyToken = "narrow_wh_verify_secret_2026"
	}
	configID := cfg.ConfigID
	if configID == "" {
		configID = "894644480139460"
	}

	return &Client{
		appID:       cfg.AppID,
		appSecret:   cfg.AppSecret,
		verifyToken: verifyToken,
		apiVersion:  apiVersion,
		accessToken: cfg.AccessToken,
		configID:    configID,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) AppID() string {
	return c.appID
}

func (c *Client) ConfigID() string {
	return c.configID
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

// ExchangeEmbeddedSignupCode exchanges the OAuth authorization code returned by the Embedded Signup popup
// for a long-lived user access token, queries the associated WABA ID and Phone Number ID, and registers webhooks.
func (c *Client) ExchangeEmbeddedSignupCode(ctx context.Context, code string) (*EmbeddedSignupResult, error) {
	if c.appID == "" || c.appSecret == "" {
		return nil, fmt.Errorf("meta APP_ID and APP_SECRET must be configured in server environment")
	}

	// 1. Exchange authorization code for User Access Token
	tokenURL := fmt.Sprintf("https://graph.facebook.com/%s/oauth/access_token?client_id=%s&client_secret=%s&code=%s",
		c.apiVersion, c.appID, c.appSecret, code)

	req, err := http.NewRequestWithContext(ctx, "GET", tokenURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call Meta OAuth endpoint: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("meta OAuth token exchange failed (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(bodyBytes, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	userToken := tokenResp.AccessToken
	if userToken == "" {
		return nil, fmt.Errorf("empty access token received from Meta")
	}

	// 2. Inspect token to discover WABA ID attached via granular scopes
	debugURL := fmt.Sprintf("https://graph.facebook.com/debug_token?input_token=%s&access_token=%s|%s",
		userToken, c.appID, c.appSecret)

	dReq, err := http.NewRequestWithContext(ctx, "GET", debugURL, nil)
	if err != nil {
		return nil, err
	}

	dResp, err := c.httpClient.Do(dReq)
	if err != nil {
		return nil, fmt.Errorf("failed to debug token: %w", err)
	}
	defer dResp.Body.Close()

	dBodyBytes, _ := io.ReadAll(dResp.Body)
	var debugResp struct {
		Data struct {
			GranularScopes []struct {
				Scope     string   `json:"scope"`
				TargetIDs []string `json:"target_ids"`
			} `json:"granular_scopes"`
		} `json:"data"`
	}
	_ = json.Unmarshal(dBodyBytes, &debugResp)

	var wabaID string
	for _, gs := range debugResp.Data.GranularScopes {
		if strings.Contains(gs.Scope, "whatsapp_business") && len(gs.TargetIDs) > 0 {
			wabaID = gs.TargetIDs[0]
			break
		}
	}

	// 3. If WABA ID found, query phone numbers belonging to this WABA
	res := &EmbeddedSignupResult{
		AccessToken: userToken,
		WabaID:      wabaID,
		Quality:     "GREEN",
	}

	if wabaID != "" {
		phonesURL := fmt.Sprintf("https://graph.facebook.com/%s/%s/phone_numbers?access_token=%s",
			c.apiVersion, wabaID, userToken)

		pReq, _ := http.NewRequestWithContext(ctx, "GET", phonesURL, nil)
		pResp, pErr := c.httpClient.Do(pReq)
		if pErr == nil {
			defer pResp.Body.Close()
			pBodyBytes, _ := io.ReadAll(pResp.Body)

			var phoneListResp struct {
				Data []struct {
					ID                 string `json:"id"`
					DisplayPhoneNumber string `json:"display_phone_number"`
					QualityRating      string `json:"quality_rating"`
				} `json:"data"`
			}
			if err := json.Unmarshal(pBodyBytes, &phoneListResp); err == nil && len(phoneListResp.Data) > 0 {
				res.PhoneID = phoneListResp.Data[0].ID
				res.PhoneNumber = phoneListResp.Data[0].DisplayPhoneNumber
				if phoneListResp.Data[0].QualityRating != "" {
					res.Quality = phoneListResp.Data[0].QualityRating
				}
			}
		}

		// 4. Subscribe App to WABA webhooks automatically
		subURL := fmt.Sprintf("https://graph.facebook.com/%s/%s/subscribed_apps", c.apiVersion, wabaID)
		subReq, _ := http.NewRequestWithContext(ctx, "POST", subURL, nil)
		subReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", userToken))
		if sResp, sErr := c.httpClient.Do(subReq); sErr == nil {
			sResp.Body.Close()
		}
	}

	return res, nil
}

