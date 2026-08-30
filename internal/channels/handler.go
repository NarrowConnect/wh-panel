package channels

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/pkg/crypto"
)

type Handler struct {
	db        *sqlx.DB
	jwtSecret string
}

func NewHandler(db *sqlx.DB, jwtSecret string) *Handler {
	return &Handler{
		db:        db,
		jwtSecret: jwtSecret,
	}
}

func (h *Handler) RegisterPublicRoutes(router fiber.Router) {
	webhooks := router.Group("/webhooks")
	webhooks.Get("/:channel_type/:channel_id", h.VerifyWebhook)
	webhooks.Post("/:channel_type/:channel_id", h.ReceiveWebhook)
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	channels := router.Group("/channels")
	channels.Get("/", h.ListChannels)
	channels.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateChannel)
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

	return c.JSON(fiber.Map{
		"channels": channelsList,
		"total":    len(channelsList),
	})
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

	if req.Type == "" || req.Name == "" || len(req.Credentials) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Type, name, and credentials are required"})
	}

	// Encrypt credentials JSON
	credBytes, err := json.Marshal(req.Credentials)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid credentials object"})
	}

	encryptedCreds, err := crypto.EncryptAES(string(credBytes), h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt channel credentials"})
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
	err = h.db.GetContext(c.UserContext(), &newChannel, query, channelID, companyID, req.Type, req.Name, encryptedCreds, string(configBytes))
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

// VerifyWebhook handles Meta WhatsApp / Instagram GET verification challenge with verify_token check
func (h *Handler) VerifyWebhook(c *fiber.Ctx) error {
	channelIDStr := c.Params("channel_id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel_id"})
	}

	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	if mode == "subscribe" && token != "" {
		var configJSON string
		_ = h.db.GetContext(c.UserContext(), &configJSON, `SELECT config_json::text FROM channels WHERE id = $1`, channelID)

		var cfg map[string]interface{}
		_ = json.Unmarshal([]byte(configJSON), &cfg)

		expectedToken, _ := cfg["verify_token"].(string)
		if expectedToken != "" && expectedToken != token {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Verify token mismatch"})
		}

		return c.SendString(challenge)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"status":  "active",
		"message": "Webhook receiver ready",
	})
}

// ReceiveWebhook handles incoming events from Meta WhatsApp, Instagram, Webchat or external channels
func (h *Handler) ReceiveWebhook(c *fiber.Ctx) error {
	channelType := c.Params("channel_type")
	channelIDStr := c.Params("channel_id")

	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel_id"})
	}

	// Fetch channel to know tenant/company_id
	var channel models.Channel
	query := `SELECT id, company_id, type, name, status, config_json FROM channels WHERE id = $1`
	if err := h.db.GetContext(c.UserContext(), &channel, query, channelID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Target channel not found"})
	}

	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON payload"})
	}

	log.Printf("[Webhook] Received payload for channel %s (%s, company: %s)", channel.Name, channelType, channel.CompanyID)

	// Extract sender phone or email if present in payload to auto-create / link contact
	senderPhone, senderName, senderEmail := extractSenderInfo(payload)
	senderPhone = NormalizePhone(senderPhone)

	if senderPhone != "" || senderEmail != "" {
		h.autoLinkContact(c.UserContext(), channel.CompanyID, senderName, senderPhone, senderEmail)
	}

	return c.JSON(fiber.Map{
		"status":     "received",
		"channel_id": channel.ID,
		"company_id": channel.CompanyID,
	})
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

func (h *Handler) autoLinkContact(ctx fiber.Ctx, companyID uuid.UUID, name, phone, email string) {
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
		findErr = h.db.GetContext(ctx.UserContext(), &existing, `SELECT id FROM contacts WHERE company_id = $1 AND phone = $2 LIMIT 1`, companyID, phone)
	} else if email != "" {
		findErr = h.db.GetContext(ctx.UserContext(), &existing, `SELECT id FROM contacts WHERE company_id = $1 AND email = $2 LIMIT 1`, companyID, email)
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
		_, _ = h.db.ExecContext(ctx.UserContext(), insertQuery, newID, companyID, name, p, e)
		log.Printf("[ContactAutoLink] Created new contact %s (%s) for company %s", name, phone, companyID)
	}
}
