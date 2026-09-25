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
	"wh-panel/pkg/postgres"
)

type Handler struct {
	db     *postgres.DB
	engine *Engine
}

func NewHandler(db *sqlx.DB, engine *Engine) *Handler {
	return &Handler{
		db:     postgres.Wrap(db),
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
	flows.Post("/:id/execute", tenant.RequireRole("admin", "supervisor"), h.ExecuteFlow)
	flows.Get("/:id/executions", h.ListExecutions)
	flows.Post("/executions/:execId/cancel", tenant.RequireRole("admin", "supervisor"), h.CancelExecution)
}

func (h *Handler) ListFlows(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	list := []models.Flow{}
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

	switch req.Status {
	case "", "draft", "active", "inactive":
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Status inválido: use draft, active ou inactive"})
	}

	var current models.Flow
	if err := h.db.GetContext(c.UserContext(), &current, `SELECT id, status, definition_json FROM flows WHERE id = $1 AND company_id = $2`, flowID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Flow not found"})
	}

	var defStr *string
	def := req.Definition
	if def != nil {
		bytes, _ := json.Marshal(def)
		s := string(bytes)
		defStr = &s
	} else {
		var existing models.FlowDefinition
		_ = json.Unmarshal([]byte(current.DefinitionJSON), &existing)
		def = &existing
	}

	// Drafts may be half-built; an active flow must be able to run.
	finalStatus := req.Status
	if finalStatus == "" {
		finalStatus = current.Status
	}
	if finalStatus == "active" {
		if problems := Validate(NormalizeDefinition(*def)); len(problems) > 0 {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"error":    "O fluxo tem pendências e não pode ser ativado",
				"problems": problems,
			})
		}
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

	// Turning a flow off also stops the runs still waiting on it.
	if updated.Status != "active" && current.Status == "active" {
		_, _ = h.db.ExecContext(c.UserContext(), `UPDATE flow_executions SET status = 'cancelled', resume_at = NULL, last_error = 'Fluxo desativado', updated_at = CURRENT_TIMESTAMP
			WHERE flow_id = $1 AND company_id = $2 AND status IN ('running', 'waiting_input', 'waiting_delay')`, flowID, companyID)
	}

	return c.JSON(updated)
}

// ListExecutions returns the latest runs of a flow with their step trace.
func (h *Handler) ListExecutions(c *fiber.Ctx) error {
	companyID, _ := uuid.Parse(c.Locals(tenant.LocalCompanyIDKey).(string))
	flowID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid flow ID"})
	}

	type row struct {
		models.FlowExecution
		ContactName  *string `db:"contact_name"`
		ContactPhone *string `db:"contact_phone"`
	}
	var rows []row
	query := `SELECT e.id, e.flow_id, e.company_id, e.conversation_id, e.contact_id, e.current_node_id, e.status, e.context_json,
			e.resume_at, e.last_error, e.trigger_event, e.created_at, e.updated_at, ct.name AS contact_name, ct.phone AS contact_phone
		FROM flow_executions e LEFT JOIN contacts ct ON ct.id = e.contact_id
		WHERE e.flow_id = $1 AND e.company_id = $2
		ORDER BY e.created_at DESC LIMIT 50`
	if err := h.db.SelectContext(c.UserContext(), &rows, query, flowID, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch executions"})
	}

	out := make([]fiber.Map, 0, len(rows))
	counts := map[string]int{}
	for _, r := range rows {
		var data map[string]interface{}
		_ = json.Unmarshal([]byte(r.ContextJSON), &data)
		counts[r.Status]++
		out = append(out, fiber.Map{
			"id": r.ID, "conversation_id": r.ConversationID, "status": r.Status,
			"current_node_id": r.CurrentNodeID, "last_error": r.LastError, "trigger_event": r.TriggerEvent,
			"resume_at": r.ResumeAt, "created_at": r.CreatedAt, "updated_at": r.UpdatedAt,
			"contact_name": r.ContactName, "contact_phone": r.ContactPhone,
			"trace": data["trace"], "vars": data["vars"],
		})
	}
	return c.JSON(fiber.Map{"executions": out, "counts": counts})
}

func (h *Handler) CancelExecution(c *fiber.Ctx) error {
	companyID, _ := uuid.Parse(c.Locals(tenant.LocalCompanyIDKey).(string))
	execID, err := uuid.Parse(c.Params("execId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid execution ID"})
	}
	ok, err := h.engine.CancelExecution(c.UserContext(), companyID, execID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to cancel execution"})
	}
	if !ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Execução não encontrada ou já encerrada"})
	}
	return c.JSON(fiber.Map{"message": "Execução cancelada"})
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
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(execution)
}
