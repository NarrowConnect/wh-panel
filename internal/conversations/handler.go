package conversations

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/internal/websocket"
	"wh-panel/pkg/redis"
)

type Handler struct {
	db          *sqlx.DB
	redisClient *redis.Client
	wsHub       *websocket.Hub
}

func NewHandler(db *sqlx.DB, redisClient *redis.Client, wsHub *websocket.Hub) *Handler {
	return &Handler{
		db:          db,
		redisClient: redisClient,
		wsHub:       wsHub,
	}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	// Conversations Routes
	convs := router.Group("/conversations")
	convs.Get("/", h.ListConversations)
	convs.Post("/", h.CreateConversation)
	convs.Get("/:id", h.GetConversation360)
	convs.Get("/:id/messages", h.GetMessages)
	convs.Post("/:id/messages", h.SendMessage)
	convs.Patch("/:id/status", h.UpdateStatus)
	convs.Patch("/:id/assign", h.AssignUser)

	// Tags Routes
	convs.Post("/:id/tags", h.AttachTag)
	convs.Delete("/:id/tags/:tag_id", h.DetachTag)

	tags := router.Group("/tags")
	tags.Get("/", h.ListTags)
	tags.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateTag)
	tags.Delete("/:id", tenant.RequireRole("admin"), h.DeleteTag)
}

// ListConversations retrieves threads filtered by status, assigned user, or search
func (h *Handler) ListConversations(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	statusFilter := c.Query("status", "open") // open, pending, resolved, all
	assignedTo := c.Query("assigned_to")     // me, unassigned, or user_id
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	userIDStr := c.Locals(tenant.LocalUserIDKey).(string)

	query := `SELECT c.id, c.company_id, c.contact_id, c.channel_id, c.assigned_user_id, c.queue_id, c.status, c.unread_count, c.last_message_at, c.created_at, c.updated_at
		FROM conversations c
		WHERE c.company_id = $1`

	args := []interface{}{companyID}
	paramIdx := 2

	if statusFilter != "all" && statusFilter != "" {
		query += fmt.Sprintf(" AND c.status = $%d", paramIdx)
		args = append(args, statusFilter)
		paramIdx++
	}

	if assignedTo == "me" {
		query += fmt.Sprintf(" AND c.assigned_user_id = $%d", paramIdx)
		args = append(args, userIDStr)
		paramIdx++
	} else if assignedTo == "unassigned" {
		query += " AND c.assigned_user_id IS NULL"
	} else if assignedTo != "" {
		query += fmt.Sprintf(" AND c.assigned_user_id = $%d", paramIdx)
		args = append(args, assignedTo)
		paramIdx++
	}

	query += fmt.Sprintf(" ORDER BY c.last_message_at DESC LIMIT $%d OFFSET $%d", paramIdx, paramIdx+1)
	args = append(args, limit, offset)

	var convs []models.Conversation
	if err := h.db.SelectContext(c.UserContext(), &convs, query, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch conversations"})
	}

	for i := range convs {
		var contact models.Contact
		_ = h.db.GetContext(c.UserContext(), &contact, `SELECT id, name, phone, email, avatar_url, status FROM contacts WHERE id = $1`, convs[i].ContactID)
		convs[i].Contact = &contact

		if convs[i].AssignedUserID != nil {
			var u models.User
			_ = h.db.GetContext(c.UserContext(), &u, `SELECT id, name, email, role FROM users WHERE id = $1`, convs[i].AssignedUserID)
			convs[i].AssignedUser = &u
		}
	}

	return c.JSON(fiber.Map{
		"conversations": convs,
		"page":          page,
		"limit":         limit,
	})
}

// CreateConversation starts a new conversation with a contact
func (h *Handler) CreateConversation(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	type CreateRequest struct {
		ContactID uuid.UUID  `json:"contact_id" validate:"required"`
		ChannelID *uuid.UUID `json:"channel_id"`
	}

	var req CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var existing models.Conversation
	err := h.db.GetContext(c.UserContext(), &existing, `SELECT id, status FROM conversations WHERE company_id = $1 AND contact_id = $2 AND status != 'resolved' LIMIT 1`, companyID, req.ContactID)
	if err == nil {
		return c.JSON(existing)
	}

	convID := uuid.New()
	userIDStr := c.Locals(tenant.LocalUserIDKey).(string)
	userID, _ := uuid.Parse(userIDStr)

	insertQuery := `INSERT INTO conversations (id, company_id, contact_id, channel_id, assigned_user_id, status)
		VALUES ($1, $2, $3, $4, $5, 'open')
		RETURNING id, company_id, contact_id, channel_id, assigned_user_id, queue_id, status, unread_count, last_message_at, created_at, updated_at`

	var newConv models.Conversation
	err = h.db.GetContext(c.UserContext(), &newConv, insertQuery, convID, companyID, req.ContactID, req.ChannelID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create conversation"})
	}

	h.wsHub.BroadcastToCompany(companyID.String(), "conversation_created", newConv)
	return c.Status(fiber.StatusCreated).JSON(newConv)
}

// GetConversation360 fetches complete 360-degree view (Contact metadata, CRM, Tags, Channel)
func (h *Handler) GetConversation360(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	convIDStr := c.Params("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid conversation ID"})
	}

	var conv models.Conversation
	query := `SELECT id, company_id, contact_id, channel_id, assigned_user_id, queue_id, status, unread_count, last_message_at, created_at, updated_at 
		FROM conversations WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &conv, query, convID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Conversation not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	var contact models.Contact
	_ = h.db.GetContext(c.UserContext(), &contact, `SELECT id, company_id, name, phone, email, avatar_url, status, notes, created_at FROM contacts WHERE id = $1`, conv.ContactID)

	customValues := make(map[string]string)
	rows, err := h.db.QueryxContext(c.UserContext(), `SELECT cf.key, cv.value FROM contact_custom_values cv JOIN custom_fields cf ON cf.id = cv.custom_field_id WHERE cv.contact_id = $1`, conv.ContactID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				customValues[k] = v
			}
		}
	}
	contact.CustomValues = customValues
	conv.Contact = &contact

	if conv.AssignedUserID != nil {
		var u models.User
		_ = h.db.GetContext(c.UserContext(), &u, `SELECT id, name, email, role FROM users WHERE id = $1`, conv.AssignedUserID)
		conv.AssignedUser = &u
	}

	var tags []models.Tag
	tagQuery := `SELECT t.id, t.company_id, t.name, t.color, t.created_at FROM tags t JOIN conversation_tags ct ON ct.tag_id = t.id WHERE ct.conversation_id = $1`
	_ = h.db.SelectContext(c.UserContext(), &tags, tagQuery, conv.ID)
	conv.Tags = tags

	return c.JSON(conv)
}

// GetMessages lists messages for a conversation thread and resets unread_count
func (h *Handler) GetMessages(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	convIDStr := c.Params("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid conversation ID"})
	}

	var messages []models.Message
	query := `SELECT id, conversation_id, company_id, sender_type, sender_id, body, media_url, is_internal, status, created_at 
		FROM messages WHERE conversation_id = $1 AND company_id = $2 
		ORDER BY created_at ASC`

	if err := h.db.SelectContext(c.UserContext(), &messages, query, convID, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch messages"})
	}

	// Reset unread count when messages are viewed
	_, _ = h.db.ExecContext(c.UserContext(), `UPDATE conversations SET unread_count = 0 WHERE id = $1`, convID)

	return c.JSON(fiber.Map{
		"messages": messages,
		"total":    len(messages),
	})
}

// SendMessage sends an outgoing message or posts an internal Whisper note, with auto first_response_at calculation
func (h *Handler) SendMessage(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	convIDStr := c.Params("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid conversation ID"})
	}

	var req models.CreateMessageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Body == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Message body is required"})
	}

	userIDStr := c.Locals(tenant.LocalUserIDKey).(string)
	userID, _ := uuid.Parse(userIDStr)

	msgID := uuid.New()
	query := `INSERT INTO messages (id, conversation_id, company_id, sender_type, sender_id, body, media_url, is_internal, status) 
		VALUES ($1, $2, $3, 'user', $4, $5, $6, $7, 'sent') 
		RETURNING id, conversation_id, company_id, sender_type, sender_id, body, media_url, is_internal, status, created_at`

	var newMsg models.Message
	err = h.db.GetContext(c.UserContext(), &newMsg, query, msgID, convID, companyID, userID, req.Body, req.MediaURL, req.IsInternal)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save message"})
	}

	// Update conversation last_message_at and auto-set first_response_at if user response
	if !req.IsInternal {
		updateConvQuery := `UPDATE conversations SET 
			last_message_at = CURRENT_TIMESTAMP, 
			first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
			updated_at = CURRENT_TIMESTAMP 
			WHERE id = $1`
		_, _ = h.db.ExecContext(c.UserContext(), updateConvQuery, convID)
	} else {
		_, _ = h.db.ExecContext(c.UserContext(), `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, convID)
	}

	// Push non-internal messages to Redis 50-message context window (for AI/SDR)
	if !req.IsInternal && h.redisClient != nil {
		msgBytes, _ := json.Marshal(newMsg)
		_ = h.redisClient.PushConversationMessage(c.UserContext(), companyIDStr, convIDStr, string(msgBytes))
	}

	// Broadcast event via WebSocket to all connected operators in tenant
	h.wsHub.BroadcastToCompany(companyIDStr, "new_message", newMsg)

	return c.Status(fiber.StatusCreated).JSON(newMsg)
}

// UpdateStatus changes conversation state (open, pending, resolved) with auto resolved_at timestamp
func (h *Handler) UpdateStatus(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	convIDStr := c.Params("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid conversation ID"})
	}

	var req models.UpdateConversationStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	query := `UPDATE conversations SET 
		status = $1, 
		resolved_at = CASE WHEN $1 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,
		updated_at = CURRENT_TIMESTAMP 
		WHERE id = $2 AND company_id = $3 
		RETURNING id, status, updated_at`

	var updated models.Conversation
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Status, convID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update status"})
	}

	h.wsHub.BroadcastToCompany(companyIDStr, "status_changed", updated)
	return c.JSON(updated)
}

// AssignUser assigns or transfers a conversation to another operator
func (h *Handler) AssignUser(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	convIDStr := c.Params("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid conversation ID"})
	}

	var req models.AssignConversationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	query := `UPDATE conversations SET assigned_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3 RETURNING id, assigned_user_id, updated_at`
	var updated models.Conversation
	err = h.db.GetContext(c.UserContext(), &updated, query, req.UserID, convID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to assign user"})
	}

	h.wsHub.BroadcastToCompany(companyIDStr, "assigned_changed", updated)
	return c.JSON(updated)
}

// Tags CRUD
func (h *Handler) ListTags(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var tags []models.Tag
	query := `SELECT id, company_id, name, color, created_at FROM tags WHERE company_id = $1 ORDER BY name ASC`
	if err := h.db.SelectContext(c.UserContext(), &tags, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch tags"})
	}

	return c.JSON(tags)
}

func (h *Handler) CreateTag(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateTagRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Tag name is required"})
	}

	color := req.Color
	if color == "" {
		color = "#6366F1"
	}

	tagID := uuid.New()
	query := `INSERT INTO tags (id, company_id, name, color) VALUES ($1, $2, $3, $4) RETURNING id, company_id, name, color, created_at`

	var newTag models.Tag
	err := h.db.GetContext(c.UserContext(), &newTag, query, tagID, companyID, req.Name, color)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Tag name already exists"})
	}

	return c.Status(fiber.StatusCreated).JSON(newTag)
}

func (h *Handler) DeleteTag(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tagIDStr := c.Params("id")
	tagID, err := uuid.Parse(tagIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid tag ID"})
	}

	_, err = h.db.ExecContext(c.UserContext(), `DELETE FROM tags WHERE id = $1 AND company_id = $2`, tagID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete tag"})
	}

	return c.JSON(fiber.Map{"message": "Tag deleted successfully"})
}

func (h *Handler) AttachTag(c *fiber.Ctx) error {
	convIDStr := c.Params("id")
	convID, _ := uuid.Parse(convIDStr)

	var req models.AttachTagRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	query := `INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`
	_, err := h.db.ExecContext(c.UserContext(), query, convID, req.TagID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to attach tag"})
	}

	return c.JSON(fiber.Map{"message": "Tag attached successfully"})
}

func (h *Handler) DetachTag(c *fiber.Ctx) error {
	convIDStr := c.Params("id")
	convID, _ := uuid.Parse(convIDStr)

	tagIDStr := c.Params("tag_id")
	tagID, _ := uuid.Parse(tagIDStr)

	query := `DELETE FROM conversation_tags WHERE conversation_id = $1 AND tag_id = $2`
	_, err := h.db.ExecContext(c.UserContext(), query, convID, tagID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to detach tag"})
	}

	return c.JSON(fiber.Map{"message": "Tag detached successfully"})
}
