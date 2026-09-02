package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/meta"
	"wh-panel/pkg/waha"
)

type Handler struct {
	db         *sqlx.DB
	jwtSecret  string
	metaClient *meta.Client
	wahaClient *waha.Client
}

func NewHandler(db *sqlx.DB, jwtSecret string, metaClient *meta.Client, wahaClient *waha.Client) *Handler {
	return &Handler{
		db:         db,
		jwtSecret:  jwtSecret,
		metaClient: metaClient,
		wahaClient: wahaClient,
	}
}

func (h *Handler) RegisterPublicRoutes(router fiber.Router) {
	webhooks := router.Group("/webhooks")

	// Global Narrow Meta App Webhook Endpoints
	webhooks.Get("/meta", h.VerifyGlobalMetaWebhook)
	webhooks.Post("/meta", h.ReceiveGlobalMetaWebhook)

	// Channel-specific Meta Webhooks
	webhooks.Get("/meta/:channel_id", h.VerifyChannelMetaWebhook)
	webhooks.Post("/meta/:channel_id", h.ReceiveChannelMetaWebhook)

	// WAHA (WhatsApp Non-Official) Webhook Endpoints
	webhooks.Post("/waha", h.ReceiveWAHAWebhook)
	webhooks.Post("/waha/:channel_id", h.ReceiveWAHAWebhook)

	// Generic fallback
	webhooks.Get("/:channel_type/:channel_id", h.VerifyChannelMetaWebhook)
	webhooks.Post("/:channel_type/:channel_id", h.ReceiveGenericWebhook)
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	channels := router.Group("/channels")
	channels.Get("/", h.ListChannels)
	channels.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateChannel)
	channels.Get("/meta/config", h.GetMetaAppConfig)
	channels.Post("/meta/embedded-signup", tenant.RequireRole("admin", "supervisor"), h.HandleEmbeddedSignup)
	channels.Get("/waha/status", h.GetWAHAStatus)
	channels.Post("/waha/sessions", tenant.RequireRole("admin", "supervisor"), h.CreateWAHASession)
	channels.Get("/waha/sessions/:session/qr", h.GetWAHAQRCode)
	channels.Get("/waha/sessions/:session/status", h.GetWAHASessionStatus)
	channels.Post("/waha/sessions/:session/logout", tenant.RequireRole("admin", "supervisor"), h.LogoutWAHASession)
	channels.Post("/waha/sessions/:session/restart", tenant.RequireRole("admin", "supervisor"), h.RestartWAHASession)
	channels.Get("/:id", h.GetChannel)
	channels.Put("/:id", tenant.RequireRole("admin", "supervisor"), h.UpdateChannel)
	channels.Delete("/:id", tenant.RequireRole("admin"), h.DeleteChannel)
}

// ListChannels returns all channels belonging to the current tenant
func (h *Handler) ListChannels(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var channelsList []models.Channel
	query := `SELECT id, company_id, type, name, status, config_json, created_at, updated_at FROM channels WHERE company_id = $1 ORDER BY created_at DESC`
	if err := h.db.SelectContext(c.UserContext(), &channelsList, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch channels"})
	}

	return c.JSON(channelsList)
}

// GetChannel retrieves a single channel by ID
func (h *Handler) GetChannel(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	channelIDStr := c.Params("id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}

	var channel models.Channel
	query := `SELECT id, company_id, type, name, status, config_json, created_at, updated_at FROM channels WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &channel, query, channelID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	return c.JSON(channel)
}

// CreateChannel registers a new communication channel for the tenant
func (h *Handler) CreateChannel(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateChannelRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Type == "" || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Type and name are required"})
	}

	// Encrypt credentials JSON if provided
	var encryptedCreds string
	if len(req.Credentials) > 0 {
		credBytes, _ := json.Marshal(req.Credentials)
		enc, err := crypto.EncryptAES(string(credBytes), h.jwtSecret)
		if err == nil {
			encryptedCreds = enc
		}
	}

	configBytes, _ := json.Marshal(req.Config)
	if len(configBytes) == 0 {
		configBytes = []byte("{}")
	}

	channelID := uuid.New()
	query := `INSERT INTO channels (id, company_id, type, name, status, credentials_encrypted, config_json) 
		VALUES ($1, $2, $3, $4, 'active', $5, $6) 
		RETURNING id, company_id, type, name, status, config_json, created_at, updated_at`

	var newChannel models.Channel
	err := h.db.GetContext(c.UserContext(), &newChannel, query, channelID, companyID, req.Type, req.Name, encryptedCreds, string(configBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create channel"})
	}

	return c.Status(fiber.StatusCreated).JSON(newChannel)
}

// UpdateChannel updates an existing channel configuration or name
func (h *Handler) UpdateChannel(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	channelIDStr := c.Params("id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}

	var req models.UpdateChannelRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var encryptedCreds *string
	if len(req.Credentials) > 0 {
		credBytes, _ := json.Marshal(req.Credentials)
		enc, err := crypto.EncryptAES(string(credBytes), h.jwtSecret)
		if err == nil {
			encryptedCreds = &enc
		}
	}

	var configStr *string
	if len(req.Config) > 0 {
		cfgBytes, _ := json.Marshal(req.Config)
		str := string(cfgBytes)
		configStr = &str
	}

	query := `UPDATE channels SET 
		name = COALESCE(NULLIF($1, ''), name), 
		status = COALESCE(NULLIF($2, ''), status),
		credentials_encrypted = COALESCE($3, credentials_encrypted),
		config_json = COALESCE($4::jsonb, config_json),
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $5 AND company_id = $6 
		RETURNING id, company_id, type, name, status, config_json, created_at, updated_at`

	var updated models.Channel
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Name, req.Status, encryptedCreds, configStr, channelID, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update channel"})
	}

	return c.JSON(updated)
}

// DeleteChannel removes a channel from the tenant
func (h *Handler) DeleteChannel(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	channelIDStr := c.Params("id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}

	query := `DELETE FROM channels WHERE id = $1 AND company_id = $2`
	res, err := h.db.ExecContext(c.UserContext(), query, channelID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete channel"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}

	return c.JSON(fiber.Map{"message": "Channel deleted successfully"})
}

// ==========================================
// NARROW META APP WEBHOOK HANDLERS
// ==========================================

// GetMetaAppConfig returns verification details for configuring Narrow's Meta App
func (h *Handler) GetMetaAppConfig(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"app_id":       h.metaClient.AppID(),
		"config_id":    h.metaClient.ConfigID(),
		"verify_token": h.metaClient.VerifyToken(),
		"api_version":  h.metaClient.APIVersion(),
		"webhook_url":  fmt.Sprintf("%s/webhooks/meta", c.BaseURL()),
	})
}

// HandleEmbeddedSignup processes the OAuth authorization code returned by Meta Embedded Signup popup
func (h *Handler) HandleEmbeddedSignup(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req struct {
		Code          string `json:"code"`
		ChannelName   string `json:"channel_name"`
		WabaID        string `json:"waba_id"`
		PhoneNumberID string `json:"phone_number_id"`
	}
	if err := c.BodyParser(&req); err != nil || req.Code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Authorization code is required"})
	}

	channelName := strings.TrimSpace(req.ChannelName)
	if channelName == "" {
		channelName = "WhatsApp Oficial Narrow"
	}

	// Exchange code on Meta Graph API
	res, err := h.metaClient.ExchangeEmbeddedSignupCode(c.UserContext(), req.Code)
	if err != nil {
		log.Printf("[EmbeddedSignup] Error exchanging code: %v", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("Meta authorization failed: %v", err)})
	}

	// Fallback to frontend session data if token inspection didn't resolve WABA/Phone ID
	if res.WabaID == "" && req.WabaID != "" {
		res.WabaID = req.WabaID
	}
	if res.PhoneID == "" && req.PhoneNumberID != "" {
		res.PhoneID = req.PhoneNumberID
	}

	// Prepare credentials to encrypt
	creds := map[string]string{
		"access_token":    res.AccessToken,
		"waba_id":         res.WabaID,
		"phone_number_id": res.PhoneID,
	}
	credBytes, _ := json.Marshal(creds)
	encCreds, _ := crypto.EncryptAES(string(credBytes), h.jwtSecret)

	// Prepare channel config
	configMap := map[string]interface{}{
		"phone_number":    res.PhoneNumber,
		"waba_id":         res.WabaID,
		"phone_number_id": res.PhoneID,
		"quality_rating":  res.Quality,
		"provider":        "meta_cloud_api",
		"app_managed":     "narrow_connect",
	}
	configBytes, _ := json.Marshal(configMap)

	channelID := uuid.New()
	query := `INSERT INTO channels (id, company_id, type, name, status, credentials_encrypted, config_json) 
		VALUES ($1, $2, 'whatsapp_meta', $3, 'active', $4, $5) 
		RETURNING id, company_id, type, name, status, config_json, created_at, updated_at`

	var newChannel models.Channel
	err = h.db.GetContext(c.UserContext(), &newChannel, query, channelID, companyID, channelName, encCreds, string(configBytes))
	if err != nil {
		log.Printf("[EmbeddedSignup] Failed to insert channel: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save connected channel"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "WhatsApp Meta conectado com sucesso!",
		"channel": newChannel,
	})
}

// VerifyGlobalMetaWebhook handles GET verification challenge from Narrow's Meta App
func (h *Handler) VerifyGlobalMetaWebhook(c *fiber.Ctx) error {
	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	if mode == "subscribe" && token != "" {
		if !h.metaClient.VerifyWebhookToken(token) {
			log.Printf("[MetaWebhook] Verify token mismatch: received '%s'", token)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Verify token mismatch"})
		}
		log.Println("[MetaWebhook] Narrow Meta App webhook verified successfully!")
		return c.SendString(challenge)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "ready", "app": "Narrow Meta App"})
}

// ReceiveGlobalMetaWebhook handles POST events from Narrow's Meta App with HMAC verification
func (h *Handler) ReceiveGlobalMetaWebhook(c *fiber.Ctx) error {
	signature := c.Get("X-Hub-Signature-256")
	body := c.Body()

	if !h.metaClient.VerifySignature(body, signature) {
		log.Printf("[MetaWebhook] Invalid HMAC signature: %s", signature)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid HMAC signature"})
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	log.Printf("[MetaWebhook] Received verified event from Narrow Meta App")
	h.processMetaEvent(c.UserContext(), payload)

	return c.JSON(fiber.Map{"status": "received"})
}

// VerifyChannelMetaWebhook handles channel-specific verification
func (h *Handler) VerifyChannelMetaWebhook(c *fiber.Ctx) error {
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	if token != "" {
		if h.metaClient.VerifyWebhookToken(token) {
			return c.SendString(challenge)
		}
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "ready"})
}

// ReceiveChannelMetaWebhook handles channel-specific incoming events
func (h *Handler) ReceiveChannelMetaWebhook(c *fiber.Ctx) error {
	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	h.processMetaEvent(c.UserContext(), payload)
	return c.JSON(fiber.Map{"status": "received"})
}

func (h *Handler) processMetaEvent(ctx context.Context, payload map[string]interface{}) {
	phone, name, email := extractSenderInfo(payload)
	phone = NormalizePhone(phone)
	if phone == "" {
		return
	}

	// Lookup all active companies or default to first active channel
	var companyID uuid.UUID
	err := h.db.GetContext(ctx, &companyID, `SELECT company_id FROM channels WHERE type = 'whatsapp_meta' AND status = 'active' LIMIT 1`)
	if err == nil {
		h.autoLinkContact(ctx, companyID, name, phone, email)
	}
}

// ==========================================
// WAHA (WHATSAPP HTTP API) HANDLERS
// ==========================================

// GetWAHAStatus checks if the remote WAHA server is reachable
func (h *Handler) GetWAHAStatus(c *fiber.Ctx) error {
	healthy, err := h.wahaClient.Health(c.UserContext())
	if err != nil || !healthy {
		return c.JSON(fiber.Map{
			"status":   "disconnected",
			"base_url": h.wahaClient.BaseURL(),
			"error":    fmt.Sprintf("%v", err),
		})
	}
	return c.JSON(fiber.Map{
		"status":   "connected",
		"base_url": h.wahaClient.BaseURL(),
	})
}

// CreateWAHASession starts a session on WAHA and registers webhook
func (h *Handler) CreateWAHASession(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req struct {
		SessionName string `json:"session_name"`
		ChannelName string `json:"channel_name"`
	}
	if err := c.BodyParser(&req); err != nil || req.SessionName == "" {
		req.SessionName = fmt.Sprintf("session_%s", companyID.String()[:8])
	}
	if req.ChannelName == "" {
		req.ChannelName = fmt.Sprintf("WhatsApp WAHA (%s)", req.SessionName)
	}

	webhookURL := fmt.Sprintf("%s/webhooks/waha", c.BaseURL())
	session, err := h.wahaClient.StartSession(c.UserContext(), req.SessionName, webhookURL)
	if err != nil {
		log.Printf("[WAHA] Error starting session: %v", err)
	}

	// Prepare encrypted credentials & config
	creds := map[string]string{
		"session_name": req.SessionName,
		"waha_url":     h.wahaClient.BaseURL(),
	}
	credBytes, _ := json.Marshal(creds)
	encCreds, _ := crypto.EncryptAES(string(credBytes), h.jwtSecret)

	cfgJSON, _ := json.Marshal(map[string]interface{}{
		"session_name": req.SessionName,
		"waha_url":     h.wahaClient.BaseURL(),
		"provider":     "waha",
	})

	// Check if a channel with this session already exists for this tenant
	var existingID uuid.UUID
	checkQuery := `SELECT id FROM channels WHERE company_id = $1 AND type = 'whatsapp_qr' AND config_json->>'session_name' = $2 LIMIT 1`
	err = h.db.GetContext(c.UserContext(), &existingID, checkQuery, companyID, req.SessionName)

	var newChannel models.Channel
	if err == nil && existingID != uuid.Nil {
		updateQuery := `UPDATE channels SET 
			name = $1, 
			status = 'active', 
			credentials_encrypted = $2, 
			config_json = $3, 
			updated_at = CURRENT_TIMESTAMP 
			WHERE id = $4 AND company_id = $5 
			RETURNING id, company_id, type, name, status, config_json, created_at, updated_at`
		err = h.db.GetContext(c.UserContext(), &newChannel, updateQuery, req.ChannelName, encCreds, string(cfgJSON), existingID, companyID)
		if err != nil {
			log.Printf("[WAHA] Failed to update channel in DB: %v", err)
		}
	} else {
		channelID := uuid.New()
		insertQuery := `INSERT INTO channels (id, company_id, type, name, status, credentials_encrypted, config_json) 
			VALUES ($1, $2, 'whatsapp_qr', $3, 'active', $4, $5) 
			RETURNING id, company_id, type, name, status, config_json, created_at, updated_at`
		err = h.db.GetContext(c.UserContext(), &newChannel, insertQuery, channelID, companyID, req.ChannelName, encCreds, string(cfgJSON))
		if err != nil {
			log.Printf("[WAHA] Failed to insert channel into DB: %v", err)
		}
	}

	return c.JSON(fiber.Map{
		"session": session,
		"channel": newChannel,
		"status":  "session_initiated",
	})
}

// GetWAHAQRCode retrieves the current live QR code from WAHA
func (h *Handler) GetWAHAQRCode(c *fiber.Ctx) error {
	sessionName := c.Params("session")
	qr, err := h.wahaClient.GetQRCode(c.UserContext(), sessionName)
	if err != nil {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":  "waiting",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"status": "ready",
		"qr":     qr,
	})
}

// GetWAHASessionStatus checks the session state on WAHA
func (h *Handler) GetWAHASessionStatus(c *fiber.Ctx) error {
	sessionName := c.Params("session")
	session, err := h.wahaClient.GetSession(c.UserContext(), sessionName)
	if err != nil {
		return c.JSON(fiber.Map{"status": "UNKNOWN", "error": err.Error()})
	}

	// If session connected, extract phone number and update channel config in DB
	if session != nil && session.Status == "WORKING" && session.Me != nil {
		rawPhone := fmt.Sprintf("%v", session.Me["id"])
		rawPhone = strings.Split(rawPhone, "@")[0]
		rawPhone = strings.Split(rawPhone, ":")[0]
		if rawPhone != "" && rawPhone != "<nil>" {
			_ , _ = h.db.ExecContext(c.UserContext(), `UPDATE channels 
				SET status = 'active', 
				    config_json = jsonb_set(config_json, '{phone_number}', to_jsonb($1::text)), 
				    updated_at = CURRENT_TIMESTAMP 
				WHERE type = 'whatsapp_qr' AND config_json->>'session_name' = $2`, rawPhone, sessionName)
		}
	}

	return c.JSON(session)
}

// LogoutWAHASession disconnects the WAHA session
func (h *Handler) LogoutWAHASession(c *fiber.Ctx) error {
	sessionName := c.Params("session")
	_ = h.wahaClient.LogoutSession(c.UserContext(), sessionName)
	return c.JSON(fiber.Map{"status": "logged_out"})
}

// RestartWAHASession restarts the WAHA session
func (h *Handler) RestartWAHASession(c *fiber.Ctx) error {
	sessionName := c.Params("session")
	webhookURL := fmt.Sprintf("%s/webhooks/waha", c.BaseURL())
	session, err := h.wahaClient.StartSession(c.UserContext(), sessionName, webhookURL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(session)
}

// ReceiveWAHAWebhook receives events sent by WAHA (messages, acks, session status)
func (h *Handler) ReceiveWAHAWebhook(c *fiber.Ctx) error {
	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}

	event, _ := payload["event"].(string)
	session, _ := payload["session"].(string)
	log.Printf("[WAHA Webhook] Received event '%s' for session '%s'", event, session)

	// Extract message data
	if event == "message" {
		if data, ok := payload["payload"].(map[string]interface{}); ok {
			from, _ := data["from"].(string)
			body, _ := data["body"].(string)
			fromNumber := strings.Split(from, "@")[0]
			fromNumber = NormalizePhone(fromNumber)

			if fromNumber != "" {
				var companyID uuid.UUID
				err := h.db.GetContext(c.UserContext(), &companyID, `SELECT company_id FROM channels WHERE type = 'whatsapp_qr' AND status = 'active' LIMIT 1`)
				if err == nil {
					h.autoLinkContact(c.UserContext(), companyID, fmt.Sprintf("WhatsApp %s", fromNumber), fromNumber, "")
				}
				_ = body
			}
		}
	}

	return c.JSON(fiber.Map{"status": "received"})
}

func (h *Handler) ReceiveGenericWebhook(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "received"})
}

func extractSenderInfo(payload map[string]interface{}) (phone, name, email string) {
	if p, ok := payload["phone"].(string); ok {
		phone = p
	}
	if n, ok := payload["name"].(string); ok {
		name = n
	}
	if e, ok := payload["email"].(string); ok {
		email = e
	}

	// Try Meta WhatsApp Structure
	if entry, ok := payload["entry"].([]interface{}); ok && len(entry) > 0 {
		if entryMap, ok := entry[0].(map[string]interface{}); ok {
			if changes, ok := entryMap["changes"].([]interface{}); ok && len(changes) > 0 {
				if changeMap, ok := changes[0].(map[string]interface{}); ok {
					if value, ok := changeMap["value"].(map[string]interface{}); ok {
						if contacts, ok := value["contacts"].([]interface{}); ok && len(contacts) > 0 {
							if contact, ok := contacts[0].(map[string]interface{}); ok {
								if waID, ok := contact["wa_id"].(string); ok {
									phone = waID
								}
								if profile, ok := contact["profile"].(map[string]interface{}); ok {
									if pName, ok := profile["name"].(string); ok {
										name = pName
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return phone, name, email
}

func NormalizePhone(phone string) string {
	if phone == "" {
		return ""
	}
	re := regexp.MustCompile(`[^\d]`)
	return re.ReplaceAllString(phone, "")
}

func (h *Handler) autoLinkContact(ctx context.Context, companyID uuid.UUID, name, phone, email string) {
	if name == "" {
		if phone != "" {
			name = fmt.Sprintf("Contato %s", phone)
		} else {
			name = "Novo Contato"
		}
	}

	var existing models.Contact
	var findErr error

	if phone != "" {
		findErr = h.db.GetContext(ctx, &existing, `SELECT id FROM contacts WHERE company_id = $1 AND phone = $2 LIMIT 1`, companyID, phone)
	} else if email != "" {
		findErr = h.db.GetContext(ctx, &existing, `SELECT id FROM contacts WHERE company_id = $1 AND email = $2 LIMIT 1`, companyID, email)
	}

	if findErr != nil && errors.Is(findErr, sql.ErrNoRows) {
		newID := uuid.New()
		var p *string
		var e *string
		if phone != "" {
			p = &phone
		}
		if email != "" {
			e = &email
		}

		insertQuery := `INSERT INTO contacts (id, company_id, name, phone, email, status) VALUES ($1, $2, $3, $4, $5, 'active')`
		_, _ = h.db.ExecContext(ctx, insertQuery, newID, companyID, name, p, e)
		log.Printf("[ContactAutoLink] Created new contact %s (%s) for company %s", name, phone, companyID)
	}
}
