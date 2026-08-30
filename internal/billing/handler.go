package billing

import (
	"database/sql"
	"errors"

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

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	bGroup := router.Group("/billing")
	bGroup.Get("/plans", h.ListPlans)
	bGroup.Get("/subscription", h.GetMySubscription)
	bGroup.Post("/subscription", tenant.RequireRole("admin"), h.UpdateSubscription)

	// AI Providers Credentials Routes
	bGroup.Get("/ai-providers", h.ListAIProviders)
	bGroup.Post("/ai-providers", tenant.RequireRole("admin"), h.SaveAIProvider)
	bGroup.Delete("/ai-providers/:id", tenant.RequireRole("admin"), h.DeleteAIProvider)
}

func (h *Handler) ListPlans(c *fiber.Ctx) error {
	var plans []models.BillingPlan
	query := `SELECT id, name, slug, price_monthly, max_users, max_contacts, max_channels, created_at, updated_at FROM billing_plans ORDER BY price_monthly ASC`
	if err := h.db.SelectContext(c.UserContext(), &plans, query); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch billing plans"})
	}

	return c.JSON(plans)
}

func (h *Handler) GetMySubscription(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var sub models.Subscription
	query := `SELECT id, company_id, plan_id, status, current_period_end, created_at, updated_at FROM subscriptions WHERE company_id = $1`
	if err := h.db.GetContext(c.UserContext(), &sub, query, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Fallback: return default free plan details
			var starterPlan models.BillingPlan
			_ = h.db.GetContext(c.UserContext(), &starterPlan, `SELECT id, name, slug, price_monthly, max_users, max_contacts, max_channels FROM billing_plans WHERE slug = 'starter' LIMIT 1`)
			return c.JSON(fiber.Map{
				"status": "free",
				"plan":   starterPlan,
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	var plan models.BillingPlan
	_ = h.db.GetContext(c.UserContext(), &plan, `SELECT id, name, slug, price_monthly, max_users, max_contacts, max_channels FROM billing_plans WHERE id = $1`, sub.PlanID)
	sub.Plan = &plan

	return c.JSON(sub)
}

func (h *Handler) UpdateSubscription(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.UpdateSubscriptionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	subID := uuid.New()
	query := `INSERT INTO subscriptions (id, company_id, plan_id, status) VALUES ($1, $2, $3, 'active')
		ON CONFLICT (company_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', updated_at = CURRENT_TIMESTAMP
		RETURNING id, company_id, plan_id, status, current_period_end, created_at, updated_at`

	var sub models.Subscription
	err := h.db.GetContext(c.UserContext(), &sub, query, subID, companyID, req.PlanID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update subscription"})
	}

	return c.JSON(sub)
}

// AI Providers Handlers (OpenAI, Anthropic, DeepSeek)
func (h *Handler) ListAIProviders(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var list []models.AIProviderConfig
	query := `SELECT id, company_id, provider, model_name, is_active, created_at, updated_at FROM ai_providers_config WHERE company_id = $1 ORDER BY provider ASC`
	if err := h.db.SelectContext(c.UserContext(), &list, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch AI providers"})
	}

	return c.JSON(list)
}

func (h *Handler) SaveAIProvider(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.SaveAIProviderRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Provider == "" || req.APIKey == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Provider and APIKey are required"})
	}

	encKey, err := crypto.EncryptAES(req.APIKey, h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt API Key"})
	}

	modelName := req.ModelName
	if modelName == "" {
		if req.Provider == "openai" {
			modelName = "gpt-4o-mini"
		} else if req.Provider == "anthropic" {
			modelName = "claude-3-5-sonnet"
		} else if req.Provider == "deepseek" {
			modelName = "deepseek-chat"
		} else {
			modelName = "default"
		}
	}

	id := uuid.New()
	query := `INSERT INTO ai_providers_config (id, company_id, provider, api_key_encrypted, model_name, is_active) 
		VALUES ($1, $2, $3, $4, $5, TRUE)
		ON CONFLICT (company_id, provider) DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, model_name = EXCLUDED.model_name, updated_at = CURRENT_TIMESTAMP
		RETURNING id, company_id, provider, model_name, is_active, created_at, updated_at`

	var config models.AIProviderConfig
	err = h.db.GetContext(c.UserContext(), &config, query, id, companyID, req.Provider, encKey, modelName)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save AI provider configuration"})
	}

	return c.Status(fiber.StatusCreated).JSON(config)
}

func (h *Handler) DeleteAIProvider(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	provIDStr := c.Params("id")
	provID, _ := uuid.Parse(provIDStr)

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM ai_providers_config WHERE id = $1 AND company_id = $2`, provID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete AI provider"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "AI Provider not found"})
	}

	return c.JSON(fiber.Map{"message": "AI Provider removed successfully"})
}
