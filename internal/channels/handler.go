package channels

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
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

type queueRouter interface {
	EvaluateAndRouteConversation(ctx context.Context, companyID, conversationID uuid.UUID) (*uuid.UUID, *uuid.UUID, error)
}

type flowResumer interface {
	ResumeWaitingExecutions(ctx context.Context, companyID, conversationID uuid.UUID, inboundText string) int
}

type eventPublisher interface {
	PublishEvent(companyID string, eventType string, payload interface{})
}

type Handler struct {
	db           *sqlx.DB
	jwtSecret    string
	metaClient   *meta.Client
	wahaClient   *waha.Client
	queueService queueRouter
	flowEngine   flowResumer
	publisher    eventPublisher
}

func NewHandler(db *sqlx.DB, jwtSecret string, metaClient *meta.Client, wahaClient *waha.Client) *Handler {
	return &Handler{
		db:         db,
		jwtSecret:  jwtSecret,
		metaClient: metaClient,
		wahaClient: wahaClient,
	}
}

func NewHandlerWithQueue(db *sqlx.DB, jwtSecret string, metaClient *meta.Client, wahaClient *waha.Client, qs queueRouter) *Handler {
	h := NewHandler(db, jwtSecret, metaClient, wahaClient)
	h.queueService = qs
	return h
}

func (h *Handler) SetFlowEngine(fe flowResumer) {
	h.flowEngine = fe
}

func (h *Handler) SetPublisher(p eventPublisher) {
	h.publisher = p
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

	if req.Type == "whatsapp_official" || req.Type == "whatsapp_meta" {
		h.seedMetaTemplatesForCompany(c.UserContext(), companyID, newChannel.ID)
	}

	return c.Status(fiber.StatusCreated).JSON(newChannel)
}

// seedMetaTemplatesForCompany creates a couple of local DRAFT starter templates for a
// newly connected WhatsApp channel, purely as editing examples. They are intentionally
// NOT marked as "approved" and carry no meta_template_id — they do not exist on Meta's
// servers and must be submitted (Templates > Sincronizar/Submeter) for real approval
// before they can be used to send messages.
func (h *Handler) seedMetaTemplatesForCompany(ctx context.Context, companyID, channelID uuid.UUID) {
	var count int
	_ = h.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM templates WHERE company_id = $1`, companyID)
	if count == 0 {
		q := `INSERT INTO templates (id, company_id, channel_id, name, category, language, components_json, status)
		VALUES
		($1, $2, $3, 'boas_vindas_atendimento', 'UTILITY', 'pt_BR', '[{"type":"HEADER","format":"TEXT","text":"Atendimento"},{"type":"BODY","text":"Olá {{1}}, obrigado pelo contato! Seu protocolo é {{2}}. Um de nossos especialistas entrará em contato em instantes.","example":{"body_text":[["Lucas","AT-2026-99"]]}},{"type":"FOOTER","text":"Atendimento Omnichannel"}]', 'draft'),
		($4, $2, $3, 'confirmacao_agendamento', 'UTILITY', 'pt_BR', '[{"type":"HEADER","format":"TEXT","text":"Confirmação de Reunião"},{"type":"BODY","text":"Olá {{1}}, confirmamos sua demonstração para o dia {{2}} às {{3}}. Caso precise reagendar, clique no botão abaixo.","example":{"body_text":[["Amanda","15/09/2026","14:00"]]}},{"type":"FOOTER","text":"Equipe Comercial"},{"type":"BUTTONS","buttons":[{"type":"QUICK_REPLY","text":"Confirmar Presença"},{"type":"QUICK_REPLY","text":"Reagendar"}]}]', 'draft')`
		_, _ = h.db.ExecContext(ctx, q, uuid.New(), companyID, channelID, uuid.New())
	}
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

// publicBaseURL resolves the public-facing base URL for building webhook callback URLs.
// Prefers the explicit APP_URL env var (correct behind a reverse proxy that doesn't
// forward the original Host/Proto), falling back to the incoming request's own base URL.
func publicBaseURL(c *fiber.Ctx) string {
	if appURL := os.Getenv("APP_URL"); appURL != "" {
		return strings.TrimRight(appURL, "/")
	}
	return c.BaseURL()
}

// GetMetaAppConfig returns verification details for configuring Narrow's Meta App
func (h *Handler) GetMetaAppConfig(c *fiber.Ctx) error {
	webhookURL := publicBaseURL(c) + "/webhooks/meta"
	return c.JSON(fiber.Map{
		"app_id":       h.metaClient.AppID(),
		"config_id":    h.metaClient.ConfigID(),
		"verify_token": h.metaClient.VerifyToken(),
		"api_version":  h.metaClient.APIVersion(),
		"webhook_url":  webhookURL,
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
		channelName = "WhatsApp Oficial"
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
		"app_managed":     "wh_panel",
	}
	configBytes, _ := json.Marshal(configMap)

	// Check if a channel with this WABA ID or Phone Number ID already exists for this tenant
	var existingID uuid.UUID
	checkQuery := `SELECT id FROM channels WHERE company_id = $1 AND type = 'whatsapp_meta' AND (
		(config_json->>'waba_id' != '' AND config_json->>'waba_id' = $2) OR 
		(config_json->>'phone_number_id' != '' AND config_json->>'phone_number_id' = $3)
	) LIMIT 1`
	err = h.db.GetContext(c.UserContext(), &existingID, checkQuery, companyID, res.WabaID, res.PhoneID)

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
		err = h.db.GetContext(c.UserContext(), &newChannel, updateQuery, channelName, encCreds, string(configBytes), existingID, companyID)
		if err != nil {
			log.Printf("[EmbeddedSignup] Failed to update existing channel: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update connected channel"})
		}
	} else {
		channelID := uuid.New()
		query := `INSERT INTO channels (id, company_id, type, name, status, credentials_encrypted, config_json) 
			VALUES ($1, $2, 'whatsapp_meta', $3, 'active', $4, $5) 
			RETURNING id, company_id, type, name, status, config_json, created_at, updated_at`

		err = h.db.GetContext(c.UserContext(), &newChannel, query, channelID, companyID, channelName, encCreds, string(configBytes))
		if err != nil {
			log.Printf("[EmbeddedSignup] Failed to insert channel: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save connected channel"})
		}
	}

	h.seedMetaTemplatesForCompany(c.UserContext(), companyID, newChannel.ID)

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

// ReceiveChannelMetaWebhook handles channel-specific incoming events (with HMAC when global secret configured)
func (h *Handler) ReceiveChannelMetaWebhook(c *fiber.Ctx) error {
	signature := c.Get("X-Hub-Signature-256")
	body := c.Body()
	if signature != "" {
		if !h.metaClient.VerifySignature(body, signature) {
			log.Printf("[MetaWebhook] Invalid HMAC signature on channel webhook: %s", signature)
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid HMAC signature"})
		}
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		if err2 := c.BodyParser(&payload); err2 != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
		}
	}
	h.processMetaEvent(c.UserContext(), payload)
	return c.JSON(fiber.Map{"status": "received"})
}

func (h *Handler) processMetaEvent(ctx context.Context, payload map[string]interface{}) {
	// 0. Handle Meta template status updates (message_template_status_update)
	if h.handleMetaTemplateStatusUpdate(ctx, payload) {
		return
	}
	phone, name, email := extractSenderInfo(payload)
	phone = NormalizePhone(phone)
	if phone == "" {
		return
	}

	phoneNumberID, wabaID := extractMetaChannelIDs(payload)

	var companyID uuid.UUID
	var err error
	// 1. Prefer exact phone_number_id match (most precise per Meta docs)
	if phoneNumberID != "" {
		err = h.db.GetContext(ctx, &companyID, `SELECT company_id FROM channels WHERE config_json->>'phone_number_id' = $1 AND status = 'active' LIMIT 1`, phoneNumberID)
	}
	// 2. Fallback to waba_id
	if (err != nil || companyID == uuid.Nil) && wabaID != "" {
		err = h.db.GetContext(ctx, &companyID, `SELECT company_id FROM channels WHERE config_json->>'waba_id' = $1 AND status = 'active' LIMIT 1`, wabaID)
	}
	// 3. Fallback to channel_id in URL is handled by caller; final fallback = first active meta channel (legacy)
	if err != nil || companyID == uuid.Nil {
		err = h.db.GetContext(ctx, &companyID, `SELECT company_id FROM channels WHERE type IN ('whatsapp_meta','whatsapp_official') AND status = 'active' LIMIT 1`)
	}
	if err == nil && companyID != uuid.Nil {
		h.ensureContactAndConversation(ctx, companyID, name, phone, email, payload)
	}
}

func (h *Handler) handleMetaTemplateStatusUpdate(ctx context.Context, payload map[string]interface{}) bool {
	entries, ok := payload["entry"].([]interface{})
	if !ok {
		return false
	}
	handled := false
	for _, e := range entries {
		em, ok := e.(map[string]interface{})
		if !ok {
			continue
		}
		changes, ok := em["changes"].([]interface{})
		if !ok {
			continue
		}
		for _, ch := range changes {
			chm, ok := ch.(map[string]interface{})
			if !ok {
				continue
			}
			field, _ := chm["field"].(string)
			if field != "message_template_status_update" && field != "message_template_status" {
				continue
			}
			value, ok := chm["value"].(map[string]interface{})
			if !ok {
				continue
			}
			tmplName, _ := value["message_template_name"].(string)
			if tmplName == "" {
				tmplName, _ = value["name"].(string)
			}
			statusRaw, _ := value["event"].(string)
			if statusRaw == "" {
				statusRaw, _ = value["message_template_status"].(string)
			}
			reason, _ := value["reason"].(string)
			status := strings.ToLower(statusRaw)
			// Map Meta statuses to internal: approved, rejected, pending, paused, disabled
			var internalStatus string
			switch status {
			case "approved":
				internalStatus = "approved"
			case "rejected":
				internalStatus = "rejected"
			case "pending":
				internalStatus = "pending"
			case "paused", "disabled", "appeal_requested":
				internalStatus = status
			default:
				internalStatus = status
			}
			if tmplName != "" && internalStatus != "" {
				_, _ = h.db.ExecContext(ctx, `UPDATE templates SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE LOWER(name)=LOWER($2)`, internalStatus, tmplName)
				if reason != "" {
					log.Printf("[MetaWebhook] Template %s → %s (reason: %s)", tmplName, internalStatus, reason)
				} else {
					log.Printf("[MetaWebhook] Template %s → %s", tmplName, internalStatus)
				}
				handled = true
			}
		}
	}
	return handled
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

	webhookURL := publicBaseURL(c) + "/webhooks/waha"
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
	webhookURL := publicBaseURL(c) + "/webhooks/waha"
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
	// WAHA may send session inside payload.session or as URL param
	if session == "" {
		session = c.Params("channel_id")
		if session == "" {
			session = c.Params("session")
		}
	}
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
				var err error
				if session != "" {
					err = h.db.GetContext(c.UserContext(), &companyID, `SELECT company_id FROM channels WHERE type = 'whatsapp_qr' AND config_json->>'session_name' = $1 LIMIT 1`, session)
				}
				if (err != nil || companyID == uuid.Nil) && session != "" {
					// Fallback: try credentials_encrypted session lookup via any channel of type whatsapp_qr with that session
					err = h.db.GetContext(c.UserContext(), &companyID, `SELECT company_id FROM channels WHERE type = 'whatsapp_qr' AND status = 'active' LIMIT 1`)
				}
				if err == nil && companyID != uuid.Nil {
					contactName := fmt.Sprintf("WhatsApp %s", fromNumber)
					h.ensureContactAndConversation(c.UserContext(), companyID, contactName, fromNumber, "", payload)
				}
				_ = body
			}
		}
	}
	// Handle session.status SCAN_QR_CODE / FAILED if needed (logged above)

	return c.JSON(fiber.Map{"status": "received"})
}

func (h *Handler) ReceiveGenericWebhook(c *fiber.Ctx) error {
	channelType := c.Params("channel_type")
	channelIDStr := c.Params("channel_id")
	var companyID uuid.UUID
	var dbChannelType string
	if cid, err := uuid.Parse(channelIDStr); err == nil {
		_ = h.db.GetContext(c.UserContext(), &companyID, `SELECT company_id FROM channels WHERE id=$1`, cid)
		_ = h.db.GetContext(c.UserContext(), &dbChannelType, `SELECT type FROM channels WHERE id=$1`, cid)
		if dbChannelType != "" && dbChannelType != channelType {
			log.Printf("[GenericWebhook] channel_type mismatch url=%s db=%s", channelType, dbChannelType)
		}
	}
	// If company not resolved via channel_id, try fallback via webchat active channel lookup by type
	if companyID == uuid.Nil && channelType == "webchat" {
		// No channel_id, try to resolve via first active webchat channel (multi-tenant fallback not ideal but handles widget without id)
		_ = h.db.GetContext(c.UserContext(), &companyID, `SELECT company_id FROM channels WHERE type='webchat' AND status='active' LIMIT 1`)
	}

	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		// Try raw body fallback
		body := c.Body()
		if len(body) > 0 {
			_ = json.Unmarshal(body, &payload)
		}
		if payload == nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
		}
	}
	// Webchat structure: {phone, name, email, body, text, message}
	phone := ""
	name := ""
	email := ""
	bodyText := ""
	if v, ok := payload["phone"].(string); ok {
		phone = v
	}
	if v, ok := payload["name"].(string); ok {
		name = v
	}
	if v, ok := payload["email"].(string); ok {
		email = v
	}
	if v, ok := payload["body"].(string); ok {
		bodyText = v
	} else if v, ok := payload["text"].(string); ok {
		bodyText = v
	} else if v, ok := payload["message"].(string); ok {
		bodyText = v
	}
	// Inject bodyText into payload for extractInboundText compatibility
	if bodyText != "" {
		payload["__webchat_body"] = bodyText
	}

	if phone == "" {
		// Try generic extractor
		phone, name, email = extractSenderInfo(payload)
		if bodyText == "" {
			bodyText = extractInboundText(payload)
		}
	}
	phone = NormalizePhone(phone)
	// For webchat visitor without real phone, keep original visitor id (webchat_xxx) as phone-like identifier if NormalizePhone empties it
	if phone == "" && channelType == "webchat" {
		if raw, ok := payload["phone"].(string); ok && raw != "" {
			phone = raw
		} else {
			phone = "webchat_" + uuid.New().String()[:8]
		}
	}
	if phone == "" {
		return c.JSON(fiber.Map{"status": "received", "warning": "no phone/contact identifier"})
	}
	if companyID == uuid.Nil {
		// Final fallback: first active channel of any type
		_ = h.db.GetContext(c.UserContext(), &companyID, `SELECT company_id FROM channels WHERE status='active' LIMIT 1`)
		if companyID == uuid.Nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel/company not found"})
		}
	}
	h.ensureContactAndConversation(c.UserContext(), companyID, name, phone, email, payload)
	return c.JSON(fiber.Map{"status": "received", "channel_type": channelType})
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

func extractMetaChannelIDs(payload map[string]interface{}) (phoneNumberID, wabaID string) {
	if entry, ok := payload["entry"].([]interface{}); ok && len(entry) > 0 {
		if entryMap, ok := entry[0].(map[string]interface{}); ok {
			// entry[0].id is often the WABA ID
			if id, ok := entryMap["id"].(string); ok {
				wabaID = id
			}
			if changes, ok := entryMap["changes"].([]interface{}); ok && len(changes) > 0 {
				if changeMap, ok := changes[0].(map[string]interface{}); ok {
					if value, ok := changeMap["value"].(map[string]interface{}); ok {
						if meta, ok := value["metadata"].(map[string]interface{}); ok {
							if pid, ok := meta["phone_number_id"].(string); ok {
								phoneNumberID = pid
							}
							if did, ok := meta["display_phone_number"].(string); ok && phoneNumberID == "" {
								_ = did
							}
						}
						// Some payloads put business id at value.business
						if bid, ok := value["business"].(string); ok && wabaID == "" {
							wabaID = bid
						}
					}
				}
			}
		}
	}
	return phoneNumberID, wabaID
}

func (h *Handler) autoLinkContact(ctx context.Context, companyID uuid.UUID, name, phone, email string) {
	h.ensureContactAndConversation(ctx, companyID, name, phone, email, nil)
}

func (h *Handler) ensureContactAndConversation(ctx context.Context, companyID uuid.UUID, name, phone, email string, rawPayload map[string]interface{}) {
	if name == "" {
		if phone != "" {
			name = fmt.Sprintf("Contato %s", phone)
		} else {
			name = "Novo Contato"
		}
	}

	var contactID uuid.UUID
	var findErr error
	var existing models.Contact

	if phone != "" {
		findErr = h.db.GetContext(ctx, &existing, `SELECT id FROM contacts WHERE company_id = $1 AND phone = $2 LIMIT 1`, companyID, phone)
	} else if email != "" {
		findErr = h.db.GetContext(ctx, &existing, `SELECT id FROM contacts WHERE company_id = $1 AND email = $2 LIMIT 1`, companyID, email)
	}

	if findErr != nil && errors.Is(findErr, sql.ErrNoRows) {
		contactID = uuid.New()
		var p *string
		var e *string
		if phone != "" {
			p = &phone
		}
		if email != "" {
			e = &email
		}
		insertQuery := `INSERT INTO contacts (id, company_id, name, phone, email, status) VALUES ($1, $2, $3, $4, $5, 'active')`
		_, _ = h.db.ExecContext(ctx, insertQuery, contactID, companyID, name, p, e)
		log.Printf("[ContactAutoLink] Created new contact %s (%s) for company %s", name, phone, companyID)
	} else if findErr == nil {
		contactID = existing.ID
	} else {
		return
	}

	// Ensure an open conversation exists for this contact
	var convID uuid.UUID
	isNewConv := false
	err := h.db.GetContext(ctx, &convID, `SELECT id FROM conversations WHERE company_id = $1 AND contact_id = $2 AND status IN ('open','pending') LIMIT 1`, companyID, contactID)
	if err != nil || convID == uuid.Nil {
		convID = uuid.New()
		isNewConv = true
		// Try to resolve channel_id from tenant routing context
		var channelID *uuid.UUID
		if rawPayload != nil {
			if pid, _ := extractMetaChannelIDs(rawPayload); pid != "" {
				var chID uuid.UUID
				if err := h.db.GetContext(ctx, &chID, `SELECT id FROM channels WHERE company_id = $1 AND config_json->>'phone_number_id' = $2 LIMIT 1`, companyID, pid); err == nil {
					channelID = &chID
				}
			}
		}
		_, _ = h.db.ExecContext(ctx, `INSERT INTO conversations (id, company_id, contact_id, channel_id, status) VALUES ($1,$2,$3,$4,'open') ON CONFLICT DO NOTHING`, convID, companyID, contactID, channelID)
		if h.publisher != nil && isNewConv {
			h.publisher.PublishEvent(companyID.String(), "conversation.created", map[string]interface{}{"conversation_id": convID, "contact_id": contactID, "channel_id": channelID})
		}
	}
	var inboundBody string
	// Optionally enqueue inbound message if payload contains text (best-effort)
	if rawPayload != nil {
		if body := extractInboundText(rawPayload); body != "" {
			inboundBody = body
			msgID := uuid.New()
			_, _ = h.db.ExecContext(ctx, `INSERT INTO messages (id, conversation_id, company_id, sender_type, body, is_internal, status) VALUES ($1,$2,$3,'contact',$4,FALSE,'delivered') ON CONFLICT DO NOTHING`, msgID, convID, companyID, body)
			_, _ = h.db.ExecContext(ctx, `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, convID)
			if h.publisher != nil {
				h.publisher.PublishEvent(companyID.String(), "message.received", map[string]interface{}{"conversation_id": convID, "contact_id": contactID, "body": body, "message_id": msgID})
			}
		}
	}
	// Flow resume: if inbound text and flows waiting_input
	if inboundBody != "" && h.flowEngine != nil && convID != uuid.Nil {
		go h.flowEngine.ResumeWaitingExecutions(context.Background(), companyID, convID, inboundBody)
	}
	// Auto-triagem: roteia para fila correta (Chatwoot-like) de forma assíncrona
	if h.queueService != nil && convID != uuid.Nil {
		go func(cid, coid uuid.UUID) {
			// Use background context to avoid cancellation
			if _, _, err := h.queueService.EvaluateAndRouteConversation(context.Background(), coid, cid); err != nil {
				log.Printf("[AutoRoute] failed for conv %s: %v", cid, err)
			}
		}(convID, companyID)
	}
	// Auto-CRM: cria card no pipeline padrão se não existir (spec 3.11)
	go h.ensureCRMCard(context.Background(), companyID, contactID, convID)
}

func (h *Handler) ensureCRMCard(ctx context.Context, companyID, contactID, conversationID uuid.UUID) {
	var pipelineID uuid.UUID
	err := h.db.GetContext(ctx, &pipelineID, `SELECT id FROM crm_pipelines WHERE company_id=$1 ORDER BY is_default DESC, created_at ASC LIMIT 1`, companyID)
	if err != nil {
		return
	}
	var stageID uuid.UUID
	err = h.db.GetContext(ctx, &stageID, `SELECT id FROM crm_stages WHERE pipeline_id=$1 ORDER BY order_index ASC LIMIT 1`, pipelineID)
	if err != nil {
		return
	}
	var exists int
	_ = h.db.GetContext(ctx, &exists, `SELECT 1 FROM crm_cards WHERE company_id=$1 AND contact_id=$2 AND pipeline_id=$3 LIMIT 1`, companyID, contactID, pipelineID)
	if exists == 1 {
		return
	}
	var contactName string
	_ = h.db.GetContext(ctx, &contactName, `SELECT name FROM contacts WHERE id=$1`, contactID)
	cardID := uuid.New()
	_, _ = h.db.ExecContext(ctx, `INSERT INTO crm_cards (id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'open') ON CONFLICT DO NOTHING`, cardID, companyID, pipelineID, stageID, contactID, conversationID, contactName)
}

func extractInboundText(payload map[string]interface{}) string {
	// Webchat / generic top-level
	if v, ok := payload["__webchat_body"].(string); ok && v != "" {
		return v
	}
	if v, ok := payload["body"].(string); ok && v != "" {
		return v
	}
	if v, ok := payload["text"].(string); ok && v != "" {
		return v
	}
	if v, ok := payload["message"].(string); ok && v != "" {
		return v
	}
	// Meta text message: entry[0].changes[0].value.messages[0].text.body
	if entry, ok := payload["entry"].([]interface{}); ok && len(entry) > 0 {
		if entryMap, ok := entry[0].(map[string]interface{}); ok {
			if changes, ok := entryMap["changes"].([]interface{}); ok && len(changes) > 0 {
				if changeMap, ok := changes[0].(map[string]interface{}); ok {
					if value, ok := changeMap["value"].(map[string]interface{}); ok {
						if msgs, ok := value["messages"].([]interface{}); ok && len(msgs) > 0 {
							if m, ok := msgs[0].(map[string]interface{}); ok {
								if t, ok := m["text"].(map[string]interface{}); ok {
									if b, ok := t["body"].(string); ok {
										return b
									}
								}
								if b, ok := m["body"].(string); ok {
									return b
								}
							}
						}
					}
				}
			}
		}
	}
	// WAHA payload: payload.body
	if data, ok := payload["payload"].(map[string]interface{}); ok {
		if b, ok := data["body"].(string); ok {
			return b
		}
	}
	return ""
}
