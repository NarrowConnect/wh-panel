package crm

import (
	"database/sql"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
)

type Handler struct {
	db *sqlx.DB
}

func NewHandler(db *sqlx.DB) *Handler {
	return &Handler{db: db}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	crmGroup := router.Group("/crm")

	// Pipelines Routes
	crmGroup.Get("/pipelines", h.ListPipelines)
	crmGroup.Post("/pipelines", tenant.RequireRole("admin", "supervisor"), h.CreatePipeline)
	crmGroup.Get("/pipelines/:id", h.GetPipeline)
	crmGroup.Delete("/pipelines/:id", tenant.RequireRole("admin"), h.DeletePipeline)

	// Kanban Board Route
	crmGroup.Get("/pipelines/:id/kanban", h.GetKanbanBoard)

	// Stages Routes
	crmGroup.Post("/pipelines/:id/stages", tenant.RequireRole("admin", "supervisor"), h.CreateStage)
	crmGroup.Delete("/stages/:stage_id", tenant.RequireRole("admin", "supervisor"), h.DeleteStage)

	// Cards Routes
	crmGroup.Post("/cards", h.CreateCard)
	crmGroup.Get("/cards/:id", h.GetCard)
	crmGroup.Patch("/cards/:id/move", h.MoveCard)
	crmGroup.Delete("/cards/:id", tenant.RequireRole("admin", "supervisor"), h.DeleteCard)
}

func (h *Handler) ListPipelines(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var pipelines []models.CRMPipeline
	query := `SELECT id, company_id, name, is_default, created_at, updated_at FROM crm_pipelines WHERE company_id = $1 ORDER BY is_default DESC, name ASC`
	if err := h.db.SelectContext(c.UserContext(), &pipelines, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch pipelines"})
	}

	return c.JSON(pipelines)
}

func (h *Handler) GetPipeline(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	pIDStr := c.Params("id")
	pID, err := uuid.Parse(pIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid pipeline ID"})
	}

	var pipeline models.CRMPipeline
	query := `SELECT id, company_id, name, is_default, created_at, updated_at FROM crm_pipelines WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &pipeline, query, pID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	var stages []models.CRMStage
	_ = h.db.SelectContext(c.UserContext(), &stages, `SELECT id, pipeline_id, company_id, name, color, order_index, created_at FROM crm_stages WHERE pipeline_id = $1 ORDER BY order_index ASC`, pID)
	pipeline.Stages = stages

	return c.JSON(pipeline)
}

func (h *Handler) CreatePipeline(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateCRMPipelineRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pipeline name is required"})
	}

	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database transaction error"})
	}
	defer tx.Rollback()

	pID := uuid.New()
	pQuery := `INSERT INTO crm_pipelines (id, company_id, name, is_default) VALUES ($1, $2, $3, $4) RETURNING id, company_id, name, is_default, created_at, updated_at`
	var newPipeline models.CRMPipeline
	err = tx.GetContext(c.UserContext(), &newPipeline, pQuery, pID, companyID, req.Name, req.IsDefault)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create pipeline"})
	}

	// Default stages if none provided
	stages := req.Stages
	if len(stages) == 0 {
		stages = []models.CreateStageDTO{
			{Name: "Novo Lead", Color: "#3B82F6", OrderIndex: 1},
			{Name: "Contato Feito", Color: "#F59E0B", OrderIndex: 2},
			{Name: "Proposta Enviada", Color: "#8B5CF6", OrderIndex: 3},
			{Name: "Negociação", Color: "#EC4899", OrderIndex: 4},
			{Name: "Fechado / Ganho", Color: "#10B981", OrderIndex: 5},
		}
	}

	for _, s := range stages {
		sID := uuid.New()
		sQuery := `INSERT INTO crm_stages (id, pipeline_id, company_id, name, color, order_index) VALUES ($1, $2, $3, $4, $5, $6)`
		_, _ = tx.ExecContext(c.UserContext(), sQuery, sID, pID, companyID, s.Name, s.Color, s.OrderIndex)
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit pipeline transaction"})
	}

	return c.Status(fiber.StatusCreated).JSON(newPipeline)
}

func (h *Handler) DeletePipeline(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	pIDStr := c.Params("id")
	pID, _ := uuid.Parse(pIDStr)

	// Prevent deletion of default pipeline
	var isDefault bool
	_ = h.db.GetContext(c.UserContext(), &isDefault, `SELECT is_default FROM crm_pipelines WHERE id = $1 AND company_id = $2`, pID, companyID)
	if isDefault {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Cannot delete the default pipeline. Set another pipeline as default first."})
	}

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM crm_pipelines WHERE id = $1 AND company_id = $2`, pID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete pipeline"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}

	return c.JSON(fiber.Map{"message": "Pipeline deleted successfully"})
}

// GetKanbanBoard returns full columns with cards and contact info
func (h *Handler) GetKanbanBoard(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	pIDStr := c.Params("id")
	pID, err := uuid.Parse(pIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid pipeline ID"})
	}

	var stages []models.CRMStage
	stageQuery := `SELECT id, pipeline_id, company_id, name, color, order_index, created_at FROM crm_stages WHERE pipeline_id = $1 AND company_id = $2 ORDER BY order_index ASC`
	if err := h.db.SelectContext(c.UserContext(), &stages, stageQuery, pID, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch stages"})
	}

	for i := range stages {
		var cards []models.CRMCard
		cardQuery := `SELECT id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, status, created_at, updated_at 
			FROM crm_cards WHERE stage_id = $1 AND company_id = $2 ORDER BY updated_at DESC`
		_ = h.db.SelectContext(c.UserContext(), &cards, cardQuery, stages[i].ID, companyID)

		for j := range cards {
			if cards[j].ContactID != nil {
				var contact models.Contact
				_ = h.db.GetContext(c.UserContext(), &contact, `SELECT id, name, phone, email, avatar_url FROM contacts WHERE id = $1`, cards[j].ContactID)
				cards[j].Contact = &contact
			}
		}

		stages[i].Cards = cards
	}

	return c.JSON(stages)
}

// Stages Endpoints
func (h *Handler) CreateStage(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	pIDStr := c.Params("id")
	pID, _ := uuid.Parse(pIDStr)

	var req models.CreateStageDTO
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	sID := uuid.New()
	color := req.Color
	if color == "" {
		color = "#6366F1"
	}

	// Auto-calculate order_index if not provided
	orderIdx := req.OrderIndex
	if orderIdx <= 0 {
		var maxIdx int
		_ = h.db.GetContext(c.UserContext(), &maxIdx, `SELECT COALESCE(MAX(order_index), 0) FROM crm_stages WHERE pipeline_id = $1`, pID)
		orderIdx = maxIdx + 1
	}

	query := `INSERT INTO crm_stages (id, pipeline_id, company_id, name, color, order_index) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, pipeline_id, company_id, name, color, order_index, created_at`
	var newStage models.CRMStage
	err := h.db.GetContext(c.UserContext(), &newStage, query, sID, pID, companyID, req.Name, color, orderIdx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create stage"})
	}

	return c.Status(fiber.StatusCreated).JSON(newStage)
}

func (h *Handler) DeleteStage(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	sIDStr := c.Params("stage_id")
	sID, _ := uuid.Parse(sIDStr)

	_, err := h.db.ExecContext(c.UserContext(), `DELETE FROM crm_stages WHERE id = $1 AND company_id = $2`, sID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete stage"})
	}

	return c.JSON(fiber.Map{"message": "Stage deleted successfully"})
}

// Cards Endpoints
func (h *Handler) CreateCard(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateCRMCardRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Card title is required"})
	}

	cID := uuid.New()
	query := `INSERT INTO crm_cards (id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, status) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open') 
		RETURNING id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, status, created_at, updated_at`

	var newCard models.CRMCard
	err := h.db.GetContext(c.UserContext(), &newCard, query, cID, companyID, req.PipelineID, req.StageID, req.ContactID, req.ConversationID, req.Title, req.Value)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create CRM card"})
	}

	return c.Status(fiber.StatusCreated).JSON(newCard)
}

func (h *Handler) GetCard(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	cardIDStr := c.Params("id")
	cardID, err := uuid.Parse(cardIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid card ID"})
	}

	var card models.CRMCard
	query := `SELECT id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, status, created_at, updated_at FROM crm_cards WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &card, query, cardID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Card not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	if card.ContactID != nil {
		var contact models.Contact
		_ = h.db.GetContext(c.UserContext(), &contact, `SELECT id, name, phone, email, avatar_url FROM contacts WHERE id = $1`, card.ContactID)
		card.Contact = &contact
	}

	return c.JSON(card)
}

func (h *Handler) MoveCard(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	cardIDStr := c.Params("id")
	cardID, err := uuid.Parse(cardIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid card ID"})
	}

	var req models.MoveCRMCardRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	// Validate target stage belongs to same pipeline as the card
	var cardPipelineID, stagePipelineID uuid.UUID
	_ = h.db.GetContext(c.UserContext(), &cardPipelineID, `SELECT pipeline_id FROM crm_cards WHERE id = $1 AND company_id = $2`, cardID, companyID)
	err = h.db.GetContext(c.UserContext(), &stagePipelineID, `SELECT pipeline_id FROM crm_stages WHERE id = $1 AND company_id = $2`, req.StageID, companyID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Target stage not found"})
	}
	if cardPipelineID != stagePipelineID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Target stage does not belong to the same pipeline as this card"})
	}

	status := req.Status
	if status == "" {
		status = "open"
	}

	query := `UPDATE crm_cards SET stage_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4 RETURNING id, pipeline_id, stage_id, title, value, status, updated_at`
	var moved models.CRMCard
	err = h.db.GetContext(c.UserContext(), &moved, query, req.StageID, status, cardID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to move card"})
	}

	return c.JSON(moved)
}

func (h *Handler) DeleteCard(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	cardIDStr := c.Params("id")
	cardID, _ := uuid.Parse(cardIDStr)

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM crm_cards WHERE id = $1 AND company_id = $2`, cardID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete card"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Card not found"})
	}

	return c.JSON(fiber.Map{"message": "Card deleted successfully"})
}
