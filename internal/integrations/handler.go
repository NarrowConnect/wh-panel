package integrations

import (
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/sandbox"
)

type Handler struct {
	db        *sqlx.DB
	jwtSecret string
	publisher *EventPublisher
}

func NewHandler(db *sqlx.DB, jwtSecret string, publisher *EventPublisher) *Handler {
	return &Handler{
		db:        db,
		jwtSecret: jwtSecret,
		publisher: publisher,
	}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	// Integrations Routes
	integ := router.Group("/integrations")
	integ.Get("/", h.ListIntegrations)
	integ.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateIntegration)
	integ.Get("/:id", h.GetIntegration)
	integ.Delete("/:id", tenant.RequireRole("admin"), h.DeleteIntegration)
	integ.Post("/transform-test", h.TestJSSandboxTransform)

	// Outbound Event Webhooks Subscriptions Routes
	hooks := router.Group("/webhooks-subscriptions")
	hooks.Get("/", h.ListWebhooks)
	hooks.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateWebhook)
	hooks.Get("/:id", h.GetWebhook)
	hooks.Delete("/:id", tenant.RequireRole("admin"), h.DeleteWebhook)
}

func (h *Handler) ListIntegrations(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var list []models.Integration
	query := `SELECT id, company_id, name, type, endpoint_url, created_at, updated_at FROM integrations WHERE company_id = $1 ORDER BY created_at DESC`
	if err := h.db.SelectContext(c.UserContext(), &list, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch integrations"})
	}

	return c.JSON(list)
}

func (h *Handler) GetIntegration(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	integIDStr := c.Params("id")
	integID, err := uuid.Parse(integIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid integration ID"})
	}

	var item models.Integration
	query := `SELECT id, company_id, name, type, endpoint_url, created_at, updated_at FROM integrations WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &item, query, integID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Integration not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	return c.JSON(item)
}

func (h *Handler) CreateIntegration(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateIntegrationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" || req.EndpointURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name and endpoint_url are required"})
	}

	integType := req.Type
	if integType == "" {
		integType = "rest_api"
	}

	var encryptedHeaders *string
	if len(req.AuthHeaders) > 0 {
		headerBytes, _ := json.Marshal(req.AuthHeaders)
		enc, err := crypto.EncryptAES(string(headerBytes), h.jwtSecret)
		if err == nil {
			encryptedHeaders = &enc
		}
	}

	integID := uuid.New()
	query := `INSERT INTO integrations (id, company_id, name, type, endpoint_url, auth_headers_encrypted) 
		VALUES ($1, $2, $3, $4, $5, $6) 
		RETURNING id, company_id, name, type, endpoint_url, created_at, updated_at`

	var newInteg models.Integration
	err := h.db.GetContext(c.UserContext(), &newInteg, query, integID, companyID, req.Name, integType, req.EndpointURL, encryptedHeaders)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create integration"})
	}

	return c.Status(fiber.StatusCreated).JSON(newInteg)
}

func (h *Handler) DeleteIntegration(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	integIDStr := c.Params("id")
	integID, _ := uuid.Parse(integIDStr)

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM integrations WHERE id = $1 AND company_id = $2`, integID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete integration"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Integration not found"})
	}

	return c.JSON(fiber.Map{"message": "Integration deleted successfully"})
}

// TestJSSandboxTransform runs custom JS code in Goja VM sandbox
func (h *Handler) TestJSSandboxTransform(c *fiber.Ctx) error {
	var req models.TransformScriptTestRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	result, err := sandbox.ExecuteJSScript(req.Script, req.Payload)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":  "JS execution error: " + err.Error(),
			"status": "failed",
		})
	}

	return c.JSON(fiber.Map{
		"output": result,
		"status": "success",
	})
}

// Outbound Webhook Subscriptions
func (h *Handler) ListWebhooks(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var list []models.WebhookSubscription
	query := `SELECT id, company_id, name, event_type, target_url, secret_token, is_active, created_at, updated_at FROM webhooks WHERE company_id = $1 ORDER BY created_at DESC`
	if err := h.db.SelectContext(c.UserContext(), &list, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch webhooks"})
	}

	return c.JSON(list)
}

func (h *Handler) GetWebhook(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	hookIDStr := c.Params("id")
	hookID, _ := uuid.Parse(hookIDStr)

	var item models.WebhookSubscription
	query := `SELECT id, company_id, name, event_type, target_url, secret_token, is_active, created_at, updated_at FROM webhooks WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &item, query, hookID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Webhook subscription not found"})
	}

	return c.JSON(item)
}

func (h *Handler) CreateWebhook(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateWebhookSubscriptionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" || req.EventType == "" || req.TargetURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name, event_type, and target_url are required"})
	}

	hookID := uuid.New()
	query := `INSERT INTO webhooks (id, company_id, name, event_type, target_url, secret_token, is_active) 
		VALUES ($1, $2, $3, $4, $5, $6, TRUE) 
		RETURNING id, company_id, name, event_type, target_url, secret_token, is_active, created_at, updated_at`

	var newHook models.WebhookSubscription
	err := h.db.GetContext(c.UserContext(), &newHook, query, hookID, companyID, req.Name, req.EventType, req.TargetURL, req.SecretToken)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create webhook subscription"})
	}

	return c.Status(fiber.StatusCreated).JSON(newHook)
}

func (h *Handler) DeleteWebhook(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	hookIDStr := c.Params("id")
	hookID, _ := uuid.Parse(hookIDStr)

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM webhooks WHERE id = $1 AND company_id = $2`, hookID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete webhook"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Webhook not found"})
	}

	return c.JSON(fiber.Map{"message": "Webhook subscription deleted successfully"})
}
