package meta

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
)

var assetIDPattern = regexp.MustCompile(`^[0-9]+$`)
var pinPattern = regexp.MustCompile(`^[0-9]{6}$`)

// graphJSON never includes request URLs in errors: OAuth URLs contain secrets.
func (c *Client) graphJSON(ctx context.Context, method, path, token string, payload, result interface{}) error {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, "https://graph.facebook.com/"+c.apiVersion+"/"+path, body)
	if err != nil {
		return fmt.Errorf("requisição Meta inválida")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("falha de comunicação com a Meta")
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return fmt.Errorf("falha ao ler resposta Meta")
	}
	var envelope struct {
		Error *struct {
			Code    int    `json:"code"`
			Subcode int    `json:"error_subcode"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(b, &envelope); err != nil {
		return fmt.Errorf("resposta Meta inválida (HTTP %d)", resp.StatusCode)
	}
	if envelope.Error != nil {
		return fmt.Errorf("Meta recusou a operação (código %d, subcódigo %d)", envelope.Error.Code, envelope.Error.Subcode)
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("Meta recusou a operação (HTTP %d)", resp.StatusCode)
	}
	if err := json.Unmarshal(b, result); err != nil {
		return fmt.Errorf("resposta Meta inválida")
	}
	return nil
}

// ExchangeEmbeddedSignupCode checks the explicitly selected assets against the
// customer-scoped token. Registration/subscription happen after tenant ownership checks.
func (c *Client) ExchangeEmbeddedSignupCode(ctx context.Context, code, wabaID, phoneID string) (*EmbeddedSignupResult, error) {
	if c.appID == "" || c.appSecret == "" {
		return nil, fmt.Errorf("configure META_APP_ID e META_APP_SECRET no servidor")
	}
	if code == "" || !assetIDPattern.MatchString(wabaID) || !assetIDPattern.MatchString(phoneID) {
		return nil, fmt.Errorf("o cadastro deve retornar código, WABA e número selecionados; conclua o fluxo completo")
	}
	params := url.Values{"client_id": {c.appID}, "client_secret": {c.appSecret}, "code": {code}}
	var token struct {
		AccessToken string `json:"access_token"`
	}
	if err := c.graphJSON(ctx, "GET", "oauth/access_token?"+params.Encode(), "", nil, &token); err != nil {
		return nil, err
	}
	if token.AccessToken == "" {
		return nil, fmt.Errorf("Meta não retornou token de acesso")
	}
	var debug struct {
		Data struct {
			AppID  string `json:"app_id"`
			Valid  bool   `json:"is_valid"`
			Scopes []struct {
				Scope   string   `json:"scope"`
				Targets []string `json:"target_ids"`
			} `json:"granular_scopes"`
		} `json:"data"`
	}
	if err := c.graphJSON(ctx, "GET", "debug_token?"+url.Values{"input_token": {token.AccessToken}}.Encode(), c.appID+"|"+c.appSecret, nil, &debug); err != nil {
		return nil, err
	}
	if !debug.Data.Valid || debug.Data.AppID != c.appID {
		return nil, fmt.Errorf("token inválido ou pertencente a outro aplicativo")
	}
	allowed := false
	for _, scope := range debug.Data.Scopes {
		if scope.Scope == "whatsapp_business_management" {
			for _, id := range scope.Targets {
				if id == wabaID {
					allowed = true
				}
			}
		}
	}
	if !allowed {
		return nil, fmt.Errorf("a WABA selecionada não foi autorizada neste cadastro")
	}
	// Paginate with cursors, always on our Graph host and the selected WABA.
	after := ""
	for page := 0; page < 100; page++ {
		params := url.Values{"fields": {"id,display_phone_number,quality_rating"}, "limit": {"100"}}
		if after != "" {
			params.Set("after", after)
		}
		var phones struct {
			Data []struct {
				ID      string `json:"id"`
				Number  string `json:"display_phone_number"`
				Quality string `json:"quality_rating"`
			} `json:"data"`
			Paging struct {
				Next    string `json:"next"`
				Cursors struct {
					After string `json:"after"`
				} `json:"cursors"`
			} `json:"paging"`
		}
		if err := c.graphJSON(ctx, "GET", wabaID+"/phone_numbers?"+params.Encode(), token.AccessToken, nil, &phones); err != nil {
			return nil, err
		}
		for _, phone := range phones.Data {
			if phone.ID == phoneID {
				return &EmbeddedSignupResult{AccessToken: token.AccessToken, WabaID: wabaID, PhoneID: phoneID, PhoneNumber: phone.Number, Quality: phone.Quality}, nil
			}
		}
		if phones.Paging.Next == "" || phones.Paging.Cursors.After == "" || phones.Paging.Cursors.After == after {
			break
		}
		after = phones.Paging.Cursors.After
	}
	return nil, fmt.Errorf("o número selecionado não pertence à WABA autorizada")
}

func (c *Client) ActivateEmbeddedSignup(ctx context.Context, res *EmbeddedSignupResult, pin string) error {
	if !pinPattern.MatchString(pin) {
		return fmt.Errorf("informe um PIN de verificação em duas etapas com 6 dígitos")
	}
	var registered struct {
		Success bool `json:"success"`
	}
	if err := c.graphJSON(ctx, "POST", res.PhoneID+"/register", res.AccessToken, map[string]string{"messaging_product": "whatsapp", "pin": pin}, &registered); err != nil {
		return fmt.Errorf("registro do número: %w", err)
	}
	if !registered.Success {
		return fmt.Errorf("Meta não confirmou o registro do número")
	}
	var subscribed struct {
		Success bool `json:"success"`
	}
	if err := c.graphJSON(ctx, "POST", res.WabaID+"/subscribed_apps", res.AccessToken, nil, &subscribed); err != nil {
		return fmt.Errorf("inscrição do webhook: %w", err)
	}
	if !subscribed.Success {
		return fmt.Errorf("Meta não confirmou a inscrição do webhook")
	}
	return nil
}

func (c *Client) SendTemplateMessage(ctx context.Context, phoneID, token, to, name, language string) (string, error) {
	if token == "" || !assetIDPattern.MatchString(phoneID) {
		return "", fmt.Errorf("credenciais do canal inválidas")
	}
	var result struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	err := c.graphJSON(ctx, "POST", phoneID+"/messages", token, map[string]interface{}{
		"messaging_product": "whatsapp", "to": to, "type": "template", "template": map[string]interface{}{"name": name, "language": map[string]string{"code": language}},
	}, &result)
	if err != nil {
		return "", err
	}
	if len(result.Messages) == 0 || result.Messages[0].ID == "" {
		return "", fmt.Errorf("Meta não confirmou o envio")
	}
	return result.Messages[0].ID, nil
}
