package queues

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
	db      *sqlx.DB
	service *Service
}

func NewHandler(db *sqlx.DB, service *Service) *Handler {
	return &Handler{
		db:      db,
		service: service,
	}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	queues := router.Group("/queues")
	queues.Get("/", h.ListQueues)
	queues.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateQueue)
	queues.Get("/:id", h.GetQueue)
	queues.Put("/:id", tenant.RequireRole("admin", "supervisor"), h.UpdateQueue)
	queues.Delete("/:id", tenant.RequireRole("admin"), h.DeleteQueue)

	// Queue Operators & Roles
	queues.Post("/:id/users", tenant.RequireRole("admin", "supervisor"), h.AddUserToQueue)
	queues.Delete("/:id/users/:user_id", tenant.RequireRole("admin", "supervisor"), h.RemoveUserFromQueue)

	// Queue Triage Rules
	queues.Get("/:id/rules", h.ListQueueRules)
	queues.Post("/:id/rules", tenant.RequireRole("admin", "supervisor"), h.CreateQueueRule)
	queues.Delete("/rules/:rule_id", tenant.RequireRole("admin", "supervisor"), h.DeleteQueueRule)

	// Conversation Routing Trigger
	router.Post("/conversations/:id/route", h.RouteConversation)
}

func (h *Handler) ListQueues(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var list []models.Queue
	query := `SELECT id, company_id, name, description, color, allocation_strategy, is_active, created_at, updated_at FROM queues WHERE company_id = $1 ORDER BY name ASC`
	if err := h.db.SelectContext(c.UserContext(), &list, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch queues"})
	}

	for i := range list {
		var users []models.QueueUserWithRole
		uQuery := `SELECT u.id, u.company_id, u.name, u.email, u.role, u.status, qu.queue_role 
			FROM users u JOIN queue_users qu ON qu.user_id = u.id WHERE qu.queue_id = $1`
		_ = h.db.SelectContext(c.UserContext(), &users, uQuery, list[i].ID)
		list[i].Users = users
	}

	return c.JSON(list)
}

func (h *Handler) GetQueue(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	queueIDStr := c.Params("id")
	queueID, err := uuid.Parse(queueIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid queue ID"})
	}

	var q models.Queue
	query := `SELECT id, company_id, name, description, color, allocation_strategy, is_active, created_at, updated_at FROM queues WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &q, query, queueID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Queue not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	var users []models.QueueUserWithRole
	_ = h.db.SelectContext(c.UserContext(), &users, `SELECT u.id, u.company_id, u.name, u.email, u.role, u.status, qu.queue_role FROM users u JOIN queue_users qu ON qu.user_id = u.id WHERE qu.queue_id = $1`, q.ID)
	q.Users = users

	var rules []models.QueueRule
	_ = h.db.SelectContext(c.UserContext(), &rules, `SELECT id, queue_id, company_id, priority, condition_type, condition_key, condition_operator, condition_value, created_at FROM queue_rules WHERE queue_id = $1 ORDER BY priority ASC`, q.ID)
	q.Rules = rules

	return c.JSON(q)
}

func (h *Handler) CreateQueue(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateQueueRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Queue name is required"})
	}

	strategy := req.AllocationStrategy
	if strategy == "" {
		strategy = "round_robin"
	}
	color := req.Color
	if color == "" {
		color = "#3B82F6"
	}

	qID := uuid.New()
	query := `INSERT INTO queues (id, company_id, name, description, color, allocation_strategy, is_active) 
		VALUES ($1, $2, $3, $4, $5, $6, TRUE) 
		RETURNING id, company_id, name, description, color, allocation_strategy, is_active, created_at, updated_at`

	var newQueue models.Queue
	err := h.db.GetContext(c.UserContext(), &newQueue, query, qID, companyID, req.Name, req.Description, color, strategy)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create queue"})
	}

	return c.Status(fiber.StatusCreated).JSON(newQueue)
}

func (h *Handler) UpdateQueue(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	queueIDStr := c.Params("id")
	queueID, err := uuid.Parse(queueIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid queue ID"})
	}

	var req models.UpdateQueueRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	query := `UPDATE queues SET 
		name = COALESCE(NULLIF($1, ''), name), 
		description = COALESCE($2, description),
		color = COALESCE(NULLIF($3, ''), color),
		allocation_strategy = COALESCE(NULLIF($4, ''), allocation_strategy),
		is_active = COALESCE($5, is_active),
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $6 AND company_id = $7 
		RETURNING id, company_id, name, description, color, allocation_strategy, is_active, created_at, updated_at`

	var updated models.Queue
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Name, req.Description, req.Color, req.AllocationStrategy, req.IsActive, queueID, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Queue not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update queue"})
	}

	return c.JSON(updated)
}

func (h *Handler) DeleteQueue(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	queueIDStr := c.Params("id")
	queueID, err := uuid.Parse(queueIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid queue ID"})
	}

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM queues WHERE id = $1 AND company_id = $2`, queueID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete queue"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Queue not found"})
	}

	return c.JSON(fiber.Map{"message": "Queue deleted successfully"})
}

// Queue Operators & Roles Management
func (h *Handler) AddUserToQueue(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	queueIDStr := c.Params("id")
	queueID, _ := uuid.Parse(queueIDStr)

	var req models.AssignQueueUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	queueRole := req.QueueRole
	if queueRole == "" {
		queueRole = "operator"
	}

	query := `INSERT INTO queue_users (queue_id, user_id, company_id, queue_role) VALUES ($1, $2, $3, $4)
		ON CONFLICT (queue_id, user_id) DO UPDATE SET queue_role = EXCLUDED.queue_role`
	_, err := h.db.ExecContext(c.UserContext(), query, queueID, req.UserID, companyID, queueRole)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to assign operator to queue"})
	}

	return c.JSON(fiber.Map{"message": "Operator assigned to queue successfully", "queue_role": queueRole})
}

func (h *Handler) RemoveUserFromQueue(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	queueIDStr := c.Params("id")
	queueID, _ := uuid.Parse(queueIDStr)

	userIDStr := c.Params("user_id")
	userID, _ := uuid.Parse(userIDStr)

	query := `DELETE FROM queue_users WHERE queue_id = $1 AND user_id = $2 AND company_id = $3`
	_, err := h.db.ExecContext(c.UserContext(), query, queueID, userID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to remove operator from queue"})
	}

	return c.JSON(fiber.Map{"message": "Operator removed from queue successfully"})
}

// Queue Rules Management
func (h *Handler) ListQueueRules(c *fiber.Ctx) error {
	queueIDStr := c.Params("id")
	queueID, _ := uuid.Parse(queueIDStr)

	var rules []models.QueueRule
	query := `SELECT id, queue_id, company_id, priority, condition_type, condition_key, condition_operator, condition_value, created_at FROM queue_rules WHERE queue_id = $1 ORDER BY priority ASC`
	if err := h.db.SelectContext(c.UserContext(), &rules, query, queueID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch rules"})
	}

	return c.JSON(rules)
}

func (h *Handler) CreateQueueRule(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	queueIDStr := c.Params("id")
	queueID, _ := uuid.Parse(queueIDStr)

	var req models.CreateQueueRuleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	priority := req.Priority
	if priority <= 0 {
		priority = 1
	}

	op := req.ConditionOperator
	if op == "" {
		op = "equals"
	}

	ruleID := uuid.New()
	query := `INSERT INTO queue_rules (id, queue_id, company_id, priority, condition_type, condition_key, condition_operator, condition_value)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, queue_id, company_id, priority, condition_type, condition_key, condition_operator, condition_value, created_at`

	var newRule models.QueueRule
	err := h.db.GetContext(c.UserContext(), &newRule, query, ruleID, queueID, companyID, priority, req.ConditionType, req.ConditionKey, op, req.ConditionValue)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create queue rule"})
	}

	return c.Status(fiber.StatusCreated).JSON(newRule)
}

func (h *Handler) DeleteQueueRule(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	ruleIDStr := c.Params("rule_id")
	ruleID, _ := uuid.Parse(ruleIDStr)

	_, err := h.db.ExecContext(c.UserContext(), `DELETE FROM queue_rules WHERE id = $1 AND company_id = $2`, ruleID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete rule"})
	}

	return c.JSON(fiber.Map{"message": "Queue rule deleted successfully"})
}

// RouteConversation executes automatic triage and operator distribution
func (h *Handler) RouteConversation(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	convIDStr := c.Params("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid conversation ID"})
	}

	matchedQueueID, assignedUserID, err := h.service.EvaluateAndRouteConversation(c.UserContext(), companyID, convID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"message":          "Conversation routed successfully",
		"matched_queue_id": matchedQueueID,
		"assigned_user_id": assignedUserID,
	})
}
