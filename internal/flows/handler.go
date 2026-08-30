package flows

import (
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
)

type Handler struct {
	db     *sqlx.DB
	engine *Engine
}

func NewHandler(db *sqlx.DB, engine *Engine) *Handler {
	return &Handler{
		db:     db,
		engine: engine,
	}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	flows := router.Group("/flows")
	flows.Get("/", h.ListFlows)
	flows.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateFlow)
	flows.Get("/:id", h.GetFlow)
	flows.Put("/:id", tenant.RequireRole("admin", "supervisor"), h.UpdateFlow)
	flows.Delete("/:id", tenant.RequireRole("admin"), h.DeleteFlow)
	flows.Post("/:id/execute", h.ExecuteFlow)
}

func (h *Handler) ListFlows(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var list []models.Flow
	query := `SELECT id, company_id, name, description, status, definition_json, created_at, updated_at FROM flows WHERE company_id = $1 ORDER BY created_at DESC`
	if err := h.db.SelectContext(c.UserContext(), &list, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch flows"})
	}

	return c.JSON(list)
}

func (h *Handler) GetFlow(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	flowIDStr := c.Params("id")
	flowID, err := uuid.Parse(flowIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid flow ID"})
	}

	var f models.Flow
	query := `SELECT id, company_id, name, description, status, definition_json, created_at, updated_at FROM flows WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &f, query, flowID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Flow not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	return c.JSON(f)
}

func (h *Handler) CreateFlow(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateFlowRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Flow name is required"})
	}

	defBytes, err := json.Marshal(req.Definition)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid flow definition object"})
	}

	flowID := uuid.New()
	query := `INSERT INTO flows (id, company_id, name, description, status, definition_json) 
		VALUES ($1, $2, $3, $4, 'draft', $5) 
		RETURNING id, company_id, name, description, status, definition_json, created_at, updated_at`

	var newFlow models.Flow
	err = h.db.GetContext(c.UserContext(), &newFlow, query, flowID, companyID, req.Name, req.Description, string(defBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create flow"})
	}

	return c.Status(fiber.StatusCreated).JSON(newFlow)
}

func (h *Handler) UpdateFlow(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	flowIDStr := c.Params("id")
	flowID, err := uuid.Parse(flowIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid flow ID"})
	}

	var req models.UpdateFlowRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var defStr *string
	if req.Definition != nil {
		bytes, _ := json.Marshal(req.Definition)
		s := string(bytes)
		defStr = &s
	}

	query := `UPDATE flows SET 
		name = COALESCE(NULLIF($1, ''), name), 
		description = COALESCE($2, description),
		status = COALESCE(NULLIF($3, ''), status),
		definition_json = COALESCE($4::jsonb, definition_json),
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $5 AND company_id = $6 
		RETURNING id, company_id, name, description, status, definition_json, created_at, updated_at`

	var updated models.Flow
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Name, req.Description, req.Status, defStr, flowID, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Flow not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update flow"})
	}

	return c.JSON(updated)
}

func (h *Handler) DeleteFlow(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	flowIDStr := c.Params("id")
	flowID, _ := uuid.Parse(flowIDStr)

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM flows WHERE id = $1 AND company_id = $2`, flowID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete flow"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Flow not found"})
	}

	return c.JSON(fiber.Map{"message": "Flow deleted successfully"})
}

func (h *Handler) ExecuteFlow(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	flowIDStr := c.Params("id")
	flowID, err := uuid.Parse(flowIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid flow ID"})
	}

	var req models.TriggerFlowExecutionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	execution, err := h.engine.ExecuteFlow(c.UserContext(), companyID, flowID, req.ConversationID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(execution)
}
