package crm

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/channels"
	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/internal/websocket"
)

type eventPublisher interface {
	PublishEvent(companyID string, eventType string, payload interface{})
}

type Handler struct {
	db        *sqlx.DB
	publisher eventPublisher
	wsHub     *websocket.Hub
}

func NewHandler(db *sqlx.DB) *Handler {
	return &Handler{db: db}
}

func NewHandlerWithPublisher(db *sqlx.DB, p eventPublisher) *Handler {
	return &Handler{db: db, publisher: p}
}

func (h *Handler) SetWebSocketHub(hub *websocket.Hub) {
	h.wsHub = hub
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	crmGroup := router.Group("/crm")

	// Pipelines
	crmGroup.Get("/pipelines", h.ListPipelines)
	crmGroup.Post("/pipelines", tenant.RequireRole("admin", "supervisor"), h.CreatePipeline)
	crmGroup.Get("/pipelines/:id", h.GetPipeline)
	crmGroup.Put("/pipelines/:id", tenant.RequireRole("admin", "supervisor"), h.UpdatePipeline)
	crmGroup.Delete("/pipelines/:id", tenant.RequireRole("admin"), h.DeletePipeline)
	crmGroup.Get("/pipelines/:id/kanban", h.GetKanbanBoard)
	crmGroup.Post("/pipelines/:id/stages/reorder", tenant.RequireRole("admin", "supervisor"), h.ReorderStages)

	// Stages
	crmGroup.Post("/pipelines/:id/stages", tenant.RequireRole("admin", "supervisor"), h.CreateStage)
	crmGroup.Put("/stages/:stage_id", tenant.RequireRole("admin", "supervisor"), h.UpdateStage)
	crmGroup.Delete("/stages/:stage_id", tenant.RequireRole("admin", "supervisor"), h.DeleteStage)

	// Custom Fields (ClickUp-style per pipeline)
	crmGroup.Get("/custom-fields", h.ListCRMCustomFields)
	crmGroup.Post("/custom-fields", tenant.RequireRole("admin", "supervisor"), h.CreateCRMCustomField)
	crmGroup.Delete("/custom-fields/:field_id", tenant.RequireRole("admin"), h.DeleteCRMCustomField)

	// Cards
	crmGroup.Get("/cards", h.ListCards)
	crmGroup.Post("/cards", h.CreateCard)
	crmGroup.Get("/cards/:id", h.GetCard)
	crmGroup.Patch("/cards/:id", h.UpdateCard)
	crmGroup.Patch("/cards/:id/move", h.MoveCard)
	crmGroup.Delete("/cards/:id", tenant.RequireRole("admin", "supervisor"), h.DeleteCard)

	// Subtasks / checklist
	crmGroup.Get("/cards/:id/subtasks", h.ListSubtasks)
	crmGroup.Post("/cards/:id/subtasks", h.CreateSubtask)
	crmGroup.Patch("/cards/:id/subtasks/:sub_id", h.ToggleSubtask)
	crmGroup.Delete("/cards/:id/subtasks/:sub_id", h.DeleteSubtask)
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

	// Ensure is_default uniqueness
	if req.IsDefault {
		_, _ = tx.ExecContext(c.UserContext(), `UPDATE crm_pipelines SET is_default=false WHERE company_id=$1`, companyID)
	}

	pID := uuid.New()
	pQuery := `INSERT INTO crm_pipelines (id, company_id, name, is_default) VALUES ($1, $2, $3, $4) RETURNING id, company_id, name, is_default, created_at, updated_at`
	var newPipeline models.CRMPipeline
	err = tx.GetContext(c.UserContext(), &newPipeline, pQuery, pID, companyID, req.Name, req.IsDefault)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create pipeline"})
	}

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

func (h *Handler) UpdatePipeline(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	pIDStr := c.Params("id")
	pID, err := uuid.Parse(pIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid pipeline ID"})
	}
	var req models.UpdateCRMPipelineRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}
	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "DB error"})
	}
	defer tx.Rollback()
	if req.IsDefault != nil && *req.IsDefault {
		_, _ = tx.ExecContext(c.UserContext(), `UPDATE crm_pipelines SET is_default=false WHERE company_id=$1`, companyID)
	}
	query := `UPDATE crm_pipelines SET name=COALESCE($1, name), is_default=COALESCE($2, is_default), updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND company_id=$4 RETURNING id, company_id, name, is_default, created_at, updated_at`
	var updated models.CRMPipeline
	var namePtr *string
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		namePtr = req.Name
	}
	err = tx.GetContext(c.UserContext(), &updated, query, namePtr, req.IsDefault, pID, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update pipeline"})
	}
	_ = tx.Commit()
	return c.JSON(updated)
}

func (h *Handler) DeletePipeline(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	pIDStr := c.Params("id")
	pID, _ := uuid.Parse(pIDStr)

	var isDefault bool
	_ = h.db.GetContext(c.UserContext(), &isDefault, `SELECT is_default FROM crm_pipelines WHERE id = $1 AND company_id = $2`, pID, companyID)
	if isDefault {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Cannot delete the default pipeline. Set another pipeline as default first."})
	}
	var cardCount int
	_ = h.db.GetContext(c.UserContext(), &cardCount, `SELECT COUNT(*) FROM crm_cards WHERE pipeline_id=$1`, pID)
	if cardCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": fmt.Sprintf("Pipeline has %d cards. Move or delete cards first.", cardCount)})
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
	search := c.Query("search")
	statusFilter := c.Query("status")

	var stages []models.CRMStage
	stageQuery := `SELECT id, pipeline_id, company_id, name, color, order_index, created_at FROM crm_stages WHERE pipeline_id = $1 AND company_id = $2 ORDER BY order_index ASC`
	if err := h.db.SelectContext(c.UserContext(), &stages, stageQuery, pID, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch stages"})
	}

	for i := range stages {
		var cards []models.CRMCard
		// Build dynamic card query with filters
		q := `SELECT id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, description, value, status, priority, due_date, assignee_id, position, custom_values, created_at, updated_at FROM crm_cards WHERE stage_id = $1 AND company_id = $2`
		args := []interface{}{stages[i].ID, companyID}
		idx := 3
		if statusFilter != "" && statusFilter != "all" {
			q += fmt.Sprintf(" AND status = $%d", idx)
			args = append(args, statusFilter)
			idx++
		}
		if search != "" {
			q += fmt.Sprintf(" AND (title ILIKE $%d OR description ILIKE $%d)", idx, idx)
			args = append(args, "%"+search+"%")
			idx++
		}
		q += ` ORDER BY position ASC, updated_at DESC`
		_ = h.db.SelectContext(c.UserContext(), &cards, q, args...)

		for j := range cards {
			if cards[j].AssigneeID != nil {
				var ass models.User
				_ = h.db.GetContext(c.UserContext(), &ass, `SELECT id, name, email FROM users WHERE id=$1`, cards[j].AssigneeID)
				cards[j].Assignee = &ass
			}
			_ = h.db.SelectContext(c.UserContext(), &cards[j].Subtasks, `SELECT id, card_id, company_id, title, is_done, created_at FROM crm_card_subtasks WHERE card_id=$1 ORDER BY created_at ASC`, cards[j].ID)
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
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Stage name is required"})
	}

	sID := uuid.New()
	color := req.Color
	if color == "" {
		color = "#6366F1"
	}

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

func (h *Handler) UpdateStage(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	sIDStr := c.Params("stage_id")
	sID, _ := uuid.Parse(sIDStr)
	var req models.UpdateCRMStageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	q := `UPDATE crm_stages SET name=COALESCE($1, name), color=COALESCE($2, color), order_index=COALESCE($3, order_index) WHERE id=$4 AND company_id=$5 RETURNING id, pipeline_id, company_id, name, color, order_index, created_at`
	var updated models.CRMStage
	err := h.db.GetContext(c.UserContext(), &updated, q, req.Name, req.Color, req.OrderIndex, sID, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Stage not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update stage"})
	}
	return c.JSON(updated)
}

func (h *Handler) ReorderStages(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	pIDStr := c.Params("id")
	pID, _ := uuid.Parse(pIDStr)
	var req models.ReorderStagesRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	tx, _ := h.db.Beginx()
	defer tx.Rollback()
	for idx, sid := range req.OrderedIDs {
		_, _ = tx.ExecContext(c.UserContext(), `UPDATE crm_stages SET order_index=$1 WHERE id=$2 AND pipeline_id=$3 AND company_id=$4`, idx+1, sid, pID, companyID)
	}
	_ = tx.Commit()
	return c.JSON(fiber.Map{"message": "Stages reordered"})
}

func (h *Handler) DeleteStage(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	sIDStr := c.Params("stage_id")
	sID, _ := uuid.Parse(sIDStr)

	var cardCount int
	_ = h.db.GetContext(c.UserContext(), &cardCount, `SELECT COUNT(*) FROM crm_cards WHERE stage_id=$1`, sID)
	if cardCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": fmt.Sprintf("Stage has %d cards. Move cards before deleting.", cardCount)})
	}

	_, err := h.db.ExecContext(c.UserContext(), `DELETE FROM crm_stages WHERE id = $1 AND company_id = $2`, sID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete stage"})
	}

	return c.JSON(fiber.Map{"message": "Stage deleted successfully"})
}

// Cards
func (h *Handler) ListCards(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	pipelineID := c.Query("pipeline_id")
	contactID := c.Query("contact_id")
	search := c.Query("search")
	status := c.Query("status")
	page := 1
	limit := 50
	if v := c.Query("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
	}
	if v := c.Query("limit"); v != "" {
		fmt.Sscanf(v, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	q := `SELECT id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, description, value, status, priority, due_date, assignee_id, position, custom_values, created_at, updated_at FROM crm_cards WHERE company_id=$1`
	args := []interface{}{companyID}
	idx := 2
	if pipelineID != "" {
		if pid, err := uuid.Parse(pipelineID); err == nil {
			q += fmt.Sprintf(" AND pipeline_id=$%d", idx)
			args = append(args, pid)
			idx++
		}
	}
	if contactID != "" {
		if cid, err := uuid.Parse(contactID); err == nil {
			q += fmt.Sprintf(" AND contact_id=$%d", idx)
			args = append(args, cid)
			idx++
		}
	}
	if status != "" && status != "all" {
		q += fmt.Sprintf(" AND status=$%d", idx)
		args = append(args, status)
		idx++
	}
	if search != "" {
		q += fmt.Sprintf(" AND (title ILIKE $%d OR description ILIKE $%d)", idx, idx)
		args = append(args, "%"+search+"%")
		idx++
	}
	q += fmt.Sprintf(" ORDER BY position ASC, updated_at DESC LIMIT $%d OFFSET $%d", idx, idx+1)
	args = append(args, limit, offset)

	var cards []models.CRMCard
	if err := h.db.SelectContext(c.UserContext(), &cards, q, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to list cards"})
	}
	for i := range cards {
		var ct *models.Contact
		if cards[i].ContactID != nil {
			var ctc models.Contact
			_ = h.db.GetContext(c.UserContext(), &ctc, `SELECT id, name, phone, email FROM contacts WHERE id=$1`, cards[i].ContactID)
			cards[i].Contact = &ctc
			ct = &ctc
		}
		_ = ct
		if cards[i].AssigneeID != nil {
			var ass models.User
			_ = h.db.GetContext(c.UserContext(), &ass, `SELECT id, name, email FROM users WHERE id=$1`, cards[i].AssigneeID)
			cards[i].Assignee = &ass
		}
		var stageName string
		_ = h.db.GetContext(c.UserContext(), &stageName, `SELECT name FROM crm_stages WHERE id=$1`, cards[i].StageID)
		cards[i].StageName = stageName
		_ = h.db.SelectContext(c.UserContext(), &cards[i].Subtasks, `SELECT id, card_id, company_id, title, is_done, created_at FROM crm_card_subtasks WHERE card_id=$1 ORDER BY created_at ASC`, cards[i].ID)
	}
	return c.JSON(fiber.Map{"cards": cards, "page": page, "limit": limit})
}

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
	// Validate pipeline/stage belong to company and match
	var stagePipelineID uuid.UUID
	if err := h.db.GetContext(c.UserContext(), &stagePipelineID, `SELECT pipeline_id FROM crm_stages WHERE id=$1 AND company_id=$2`, req.StageID, companyID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Stage not found"})
	}
	if stagePipelineID != req.PipelineID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Stage does not belong to pipeline"})
	}
	// Priority validation
	priority := strings.ToLower(req.Priority)
	if priority == "" {
		priority = "medium"
	}
	if priority != "low" && priority != "medium" && priority != "high" && priority != "urgent" {
		priority = "medium"
	}
	// Due date parsing
	var dueDate *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		if t, err := time.Parse("2006-01-02", *req.DueDate); err == nil {
			dueDate = &t
		} else if t, err := time.Parse(time.RFC3339, *req.DueDate); err == nil {
			dueDate = &t
		}
	}
	// Assignee validation
	var assigneeID *uuid.UUID
	if req.AssigneeID != nil {
		var exists int
		if err := h.db.GetContext(c.UserContext(), &exists, `SELECT 1 FROM users WHERE id=$1 AND company_id=$2`, *req.AssigneeID, companyID); err == nil {
			assigneeID = req.AssigneeID
		}
	}
	// Handle inline contact creation
	contactID := req.ContactID
	if contactID == nil && req.ContactName != nil && *req.ContactName != "" {
		phone := ""
		if req.ContactPhone != nil {
			phone = channels.NormalizePhone(*req.ContactPhone)
		}
		cid := uuid.New()
		var emailPtr *string
		if req.ContactEmail != nil && *req.ContactEmail != "" {
			emailPtr = req.ContactEmail
		}
		var phonePtr *string
		if phone != "" {
			phonePtr = &phone
		}
		_, _ = h.db.ExecContext(c.UserContext(), `INSERT INTO contacts (id, company_id, name, phone, email, status) VALUES ($1,$2,$3,$4,$5,'active')`, cid, companyID, *req.ContactName, phonePtr, emailPtr)
		contactID = &cid
	}
	customVals := req.CustomValues
	if len(customVals) == 0 {
		customVals = []byte("{}")
	}
	// Validate required CRM custom fields for pipeline
	var requiredFields []models.CRMCustomField
	_ = h.db.SelectContext(c.UserContext(), &requiredFields, `SELECT key FROM crm_custom_fields WHERE company_id=$1 AND (pipeline_id=$2 OR pipeline_id IS NULL) AND is_required=true`, companyID, req.PipelineID)
	if len(requiredFields) > 0 {
		var cvMap map[string]interface{}
		_ = json.Unmarshal(customVals, &cvMap)
		for _, rf := range requiredFields {
			if cvMap == nil || cvMap[rf.Key] == nil || fmt.Sprintf("%v", cvMap[rf.Key]) == "" {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("Campo obrigatório '%s' não preenchido", rf.Name)})
			}
		}
	}
	// Position auto
	var maxPos int
	_ = h.db.GetContext(c.UserContext(), &maxPos, `SELECT COALESCE(MAX(position),0) FROM crm_cards WHERE stage_id=$1`, req.StageID)
	// Validate conversation belongs to contact if provided
	if req.ConversationID != nil {
		var convContactID uuid.UUID
		_ = h.db.GetContext(c.UserContext(), &convContactID, `SELECT contact_id FROM conversations WHERE id=$1 AND company_id=$2`, *req.ConversationID, companyID)
		_ = convContactID
	}

	cID := uuid.New()
	query := `INSERT INTO crm_cards (id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, description, value, status, priority, due_date, assignee_id, position, custom_values) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, $12, $13, $14) 
		RETURNING id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, description, value, status, priority, due_date, assignee_id, position, custom_values, created_at, updated_at`

	var newCard models.CRMCard
	err := h.db.GetContext(c.UserContext(), &newCard, query, cID, companyID, req.PipelineID, req.StageID, contactID, req.ConversationID, req.Title, req.Description, req.Value, priority, dueDate, assigneeID, maxPos+1, string(customVals))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create CRM card: " + err.Error()})
	}
	if newCard.ContactID != nil {
		var ct models.Contact
		_ = h.db.GetContext(c.UserContext(), &ct, `SELECT id, name, phone, email FROM contacts WHERE id=$1`, *newCard.ContactID)
		newCard.Contact = &ct
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
	query := `SELECT id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, description, value, status, priority, due_date, assignee_id, position, custom_values, created_at, updated_at FROM crm_cards WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &card, query, cardID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Card not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}
	// Subtasks
	_ = h.db.SelectContext(c.UserContext(), &card.Subtasks, `SELECT id, card_id, company_id, title, is_done, created_at FROM crm_card_subtasks WHERE card_id=$1 ORDER BY created_at ASC`, card.ID)
	if card.AssigneeID != nil {
		var ass models.User
		_ = h.db.GetContext(c.UserContext(), &ass, `SELECT id, name, email FROM users WHERE id=$1`, *card.AssigneeID)
		card.Assignee = &ass
	}

	if card.ContactID != nil {
		var contact models.Contact
		_ = h.db.GetContext(c.UserContext(), &contact, `SELECT id, name, phone, email, avatar_url FROM contacts WHERE id = $1`, card.ContactID)
		card.Contact = &contact
		// Enrich custom contact values if any
		var vals map[string]string
		rows, _ := h.db.QueryxContext(c.UserContext(), `SELECT cf.key, cv.value FROM contact_custom_values cv JOIN custom_fields cf ON cf.id=cv.custom_field_id WHERE cv.contact_id=$1`, *card.ContactID)
		if rows != nil {
			defer rows.Close()
			vals = make(map[string]string)
			for rows.Next() {
				var k, v string
				rows.Scan(&k, &v)
				vals[k] = v
			}
		}
		_ = vals
	}
	// Conversation preview
	if card.ConversationID != nil {
		var conv models.Conversation
		_ = h.db.GetContext(c.UserContext(), &conv, `SELECT id, status, last_message_at FROM conversations WHERE id=$1`, *card.ConversationID)
		_ = conv
	}

	return c.JSON(card)
}

func (h *Handler) UpdateCard(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	cardIDStr := c.Params("id")
	cardID, _ := uuid.Parse(cardIDStr)
	var req models.UpdateCRMCardRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	// Build dynamic update
	q := `UPDATE crm_cards SET updated_at=CURRENT_TIMESTAMP`
	args := []interface{}{}
	idx := 1
	if req.Title != nil {
		q += fmt.Sprintf(", title=$%d", idx)
		args = append(args, *req.Title)
		idx++
	}
	if req.Description != nil {
		q += fmt.Sprintf(", description=$%d", idx)
		args = append(args, *req.Description)
		idx++
	}
	if req.Value != nil {
		q += fmt.Sprintf(", value=$%d", idx)
		args = append(args, *req.Value)
		idx++
	}
	if req.Priority != nil {
		p := strings.ToLower(*req.Priority)
		if p == "low" || p == "medium" || p == "high" || p == "urgent" {
			q += fmt.Sprintf(", priority=$%d", idx)
			args = append(args, p)
			idx++
		}
	}
	if req.DueDate != nil {
		if *req.DueDate == "" {
			q += fmt.Sprintf(", due_date=NULL")
		} else {
			var t *time.Time
			if tt, err := time.Parse("2006-01-02", *req.DueDate); err == nil {
				t = &tt
			} else if tt, err := time.Parse(time.RFC3339, *req.DueDate); err == nil {
				t = &tt
			}
			if t != nil {
				q += fmt.Sprintf(", due_date=$%d", idx)
				args = append(args, *t)
				idx++
			}
		}
	}
	if req.AssigneeID != nil {
		q += fmt.Sprintf(", assignee_id=$%d", idx)
		args = append(args, *req.AssigneeID)
		idx++
	}
	if req.Position != nil {
		q += fmt.Sprintf(", position=$%d", idx)
		args = append(args, *req.Position)
		idx++
	}
	if req.StageID != nil {
		// Validate stage pipeline match if card pipeline unchanged
		q += fmt.Sprintf(", stage_id=$%d", idx)
		args = append(args, *req.StageID)
		idx++
	}
	if req.Status != nil {
		q += fmt.Sprintf(", status=$%d", idx)
		args = append(args, strings.ToLower(*req.Status))
		idx++
	}
	if req.CustomValues != nil {
		q += fmt.Sprintf(", custom_values=$%d::jsonb", idx)
		args = append(args, string(req.CustomValues))
		idx++
	}
	if req.ContactID != nil {
		q += fmt.Sprintf(", contact_id=$%d", idx)
		args = append(args, *req.ContactID)
		idx++
	}
	if req.ConversationID != nil {
		q += fmt.Sprintf(", conversation_id=$%d", idx)
		args = append(args, *req.ConversationID)
		idx++
	}
	q += fmt.Sprintf(" WHERE id=$%d AND company_id=$%d RETURNING id, company_id, pipeline_id, stage_id, contact_id, conversation_id, title, description, value, status, priority, due_date, assignee_id, position, custom_values, created_at, updated_at", idx, idx+1)
	args = append(args, cardID, companyID)
	var updated models.CRMCard
	if err := h.db.GetContext(c.UserContext(), &updated, q, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Card not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update card"})
	}
	return c.JSON(updated)
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

	// Validate target stage belongs to same pipeline as the card and fetch current stage
	var cardPipelineID, stagePipelineID uuid.UUID
	var fromStageID uuid.UUID
	var fromStatus string
	_ = h.db.GetContext(c.UserContext(), &cardPipelineID, `SELECT pipeline_id FROM crm_cards WHERE id = $1 AND company_id = $2`, cardID, companyID)
	_ = h.db.GetContext(c.UserContext(), &fromStageID, `SELECT stage_id FROM crm_cards WHERE id=$1`, cardID)
	_ = h.db.GetContext(c.UserContext(), &fromStatus, `SELECT status FROM crm_cards WHERE id=$1`, cardID)
	err = h.db.GetContext(c.UserContext(), &stagePipelineID, `SELECT pipeline_id FROM crm_stages WHERE id = $1 AND company_id = $2`, req.StageID, companyID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Target stage not found"})
	}
	if cardPipelineID != stagePipelineID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Target stage does not belong to the same pipeline as this card"})
	}

	status := req.Status
	if status == "" {
		status = fromStatus
		if status == "" {
			status = "open"
		}
	}

	query := `UPDATE crm_cards SET stage_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4 RETURNING id, pipeline_id, stage_id, title, value, status, custom_values, updated_at`
	var moved models.CRMCard
	err = h.db.GetContext(c.UserContext(), &moved, query, req.StageID, status, cardID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to move card"})
	}
	// History
	userIDStr := c.Locals(tenant.LocalUserIDKey).(string)
	var movedBy *uuid.UUID
	if uid, err := uuid.Parse(userIDStr); err == nil {
		movedBy = &uid
	}
	_, _ = h.db.ExecContext(c.UserContext(), `INSERT INTO crm_card_history (id, company_id, card_id, from_stage_id, to_stage_id, from_status, to_status, moved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, uuid.New(), companyID, cardID, fromStageID, req.StageID, fromStatus, status, movedBy)
	if h.publisher != nil {
		h.publisher.PublishEvent(companyID.String(), "crm.card_moved", map[string]interface{}{"card_id": cardID, "from_stage_id": fromStageID, "to_stage_id": req.StageID, "from_status": fromStatus, "to_status": status})
	}
	if h.wsHub != nil {
		h.wsHub.BroadcastToCompany(companyID.String(), "crm_card_moved", moved)
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

// CRM Custom Fields (per pipeline)
func (h *Handler) ListCRMCustomFields(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	pipelineID := c.Query("pipeline_id")
	q := `SELECT id, company_id, pipeline_id, name, key, field_type, options, is_required, order_index, created_at FROM crm_custom_fields WHERE company_id=$1`
	args := []interface{}{companyID}
	if pipelineID != "" {
		if pid, err := uuid.Parse(pipelineID); err == nil {
			q += ` AND (pipeline_id=$2 OR pipeline_id IS NULL)`
			args = append(args, pid)
		}
	}
	q += ` ORDER BY order_index ASC`
	var fields []models.CRMCustomField
	if err := h.db.SelectContext(c.UserContext(), &fields, q, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to list fields"})
	}
	return c.JSON(fields)
}

func (h *Handler) CreateCRMCustomField(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	var req models.CreateCRMCustomFieldRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	if req.Name == "" || req.FieldType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and field_type required"})
	}
	key := req.Key
	if key == "" {
		key = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(req.Name), " ", "_"))
		key = strings.ReplaceAll(key, "-", "_")
	}
	allowed := map[string]bool{"text": true, "number": true, "date": true, "select": true, "boolean": true, "url": true}
	if !allowed[req.FieldType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid field_type"})
	}
	opts := req.Options
	if len(opts) == 0 {
		opts = []byte("[]")
	}
	orderIdx := req.OrderIndex
	if orderIdx <= 0 {
		var maxIdx int
		_ = h.db.GetContext(c.UserContext(), &maxIdx, `SELECT COALESCE(MAX(order_index),0) FROM crm_custom_fields WHERE company_id=$1`, companyID)
		orderIdx = maxIdx + 1
	}
	id := uuid.New()
	q := `INSERT INTO crm_custom_fields (id, company_id, pipeline_id, name, key, field_type, options, is_required, order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, company_id, pipeline_id, name, key, field_type, options, is_required, order_index, created_at`
	var created models.CRMCustomField
	err := h.db.GetContext(c.UserContext(), &created, q, id, companyID, req.PipelineID, req.Name, key, req.FieldType, string(opts), req.IsRequired, orderIdx)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Field key already exists"})
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *Handler) DeleteCRMCustomField(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	fidStr := c.Params("field_id")
	fid, _ := uuid.Parse(fidStr)
	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM crm_custom_fields WHERE id=$1 AND company_id=$2`, fid, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Field not found"})
	}
	return c.JSON(fiber.Map{"message": "Field deleted"})
}

// Subtasks
func (h *Handler) ListSubtasks(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	cardIDStr := c.Params("id")
	cardID, _ := uuid.Parse(cardIDStr)
	var list []models.CRMSubtask
	_ = h.db.SelectContext(c.UserContext(), &list, `SELECT id, card_id, company_id, title, is_done, created_at FROM crm_card_subtasks WHERE card_id=$1 AND company_id=$2 ORDER BY created_at ASC`, cardID, companyID)
	return c.JSON(list)
}

func (h *Handler) CreateSubtask(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	cardIDStr := c.Params("id")
	cardID, _ := uuid.Parse(cardIDStr)
	var req struct {
		Title string `json:"title"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Title) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title required"})
	}
	// Verify card belongs to company
	var exists int
	if err := h.db.GetContext(c.UserContext(), &exists, `SELECT 1 FROM crm_cards WHERE id=$1 AND company_id=$2`, cardID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Card not found"})
	}
	id := uuid.New()
	_, err := h.db.ExecContext(c.UserContext(), `INSERT INTO crm_card_subtasks (id, card_id, company_id, title, is_done) VALUES ($1,$2,$3,$4,false)`, id, cardID, companyID, req.Title)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create subtask"})
	}
	var created models.CRMSubtask
	_ = h.db.GetContext(c.UserContext(), &created, `SELECT id, card_id, company_id, title, is_done, created_at FROM crm_card_subtasks WHERE id=$1`, id)
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *Handler) ToggleSubtask(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	cardIDStr := c.Params("id")
	subIDStr := c.Params("sub_id")
	cardID, _ := uuid.Parse(cardIDStr)
	subID, _ := uuid.Parse(subIDStr)
	var req struct {
		IsDone *bool `json:"is_done"`
	}
	_ = c.BodyParser(&req)
	// Flip if not provided
	var current bool
	_ = h.db.GetContext(c.UserContext(), &current, `SELECT is_done FROM crm_card_subtasks WHERE id=$1 AND card_id=$2 AND company_id=$3`, subID, cardID, companyID)
	newVal := !current
	if req.IsDone != nil {
		newVal = *req.IsDone
	}
	_, err := h.db.ExecContext(c.UserContext(), `UPDATE crm_card_subtasks SET is_done=$1 WHERE id=$2 AND card_id=$3 AND company_id=$4`, newVal, subID, cardID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update"})
	}
	var updated models.CRMSubtask
	_ = h.db.GetContext(c.UserContext(), &updated, `SELECT id, card_id, company_id, title, is_done, created_at FROM crm_card_subtasks WHERE id=$1`, subID)
	return c.JSON(updated)
}

func (h *Handler) DeleteSubtask(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	cardIDStr := c.Params("id")
	subIDStr := c.Params("sub_id")
	cardID, _ := uuid.Parse(cardIDStr)
	subID, _ := uuid.Parse(subIDStr)
	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM crm_card_subtasks WHERE id=$1 AND card_id=$2 AND company_id=$3`, subID, cardID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Not found"})
	}
	return c.JSON(fiber.Map{"message": "Subtask deleted"})
}
