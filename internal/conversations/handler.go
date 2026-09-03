package conversations

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/internal/websocket"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/meta"
	"wh-panel/pkg/redis"
	"wh-panel/pkg/waha"
)

type eventPublisher interface {
	PublishEvent(companyID string, eventType string, payload interface{})
}

type Handler struct {
	db          *sqlx.DB
	redisClient *redis.Client
	wsHub       *websocket.Hub
	metaClient  *meta.Client
	wahaClient  *waha.Client
	jwtSecret   string
	publisher   eventPublisher
}

func NewHandler(db *sqlx.DB, redisClient *redis.Client, wsHub *websocket.Hub, metaClient *meta.Client, wahaClient *waha.Client, jwtSecret string) *Handler {
	return &Handler{
		db:          db,
		redisClient: redisClient,
		wsHub:       wsHub,
		metaClient:  metaClient,
		wahaClient:  wahaClient,
		jwtSecret:   jwtSecret,
	}
}

func (h *Handler) SetPublisher(p eventPublisher) {
	h.publisher = p
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	// Upload endpoint (mídia)
	router.Post("/uploads", h.UploadMedia)

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

// ListConversations retrieves threads filtered by status, assigned user, queue, channel or search
func (h *Handler) ListConversations(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	statusFilter := c.Query("status", "open") // open, pending, resolved, all
	assignedTo := c.Query("assigned_to")
	if assignedTo == "" {
		assignedTo = c.Query("assigned_user_id") // alias for frontend compat
	}
	queueIDFilter := c.Query("queue_id")
	channelIDFilter := c.Query("channel_id")
	searchFilter := c.Query("search")
	if searchFilter == "" {
		searchFilter = c.Query("q")
	}
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

	// Join contacts when search is used for performance
	needsContactJoin := searchFilter != ""
	baseTable := "conversations c"
	if needsContactJoin {
		baseTable = "conversations c JOIN contacts co ON co.id = c.contact_id"
	}
	query := fmt.Sprintf(`SELECT c.id, c.company_id, c.contact_id, c.channel_id, c.assigned_user_id, c.queue_id, c.status, c.unread_count, c.last_message_at, c.created_at, c.updated_at
		FROM %s
		WHERE c.company_id = $1`, baseTable)

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
	} else if assignedTo != "" && assignedTo != "all" {
		query += fmt.Sprintf(" AND c.assigned_user_id = $%d", paramIdx)
		args = append(args, assignedTo)
		paramIdx++
	}

	if queueIDFilter != "" {
		if qID, err := uuid.Parse(queueIDFilter); err == nil {
			query += fmt.Sprintf(" AND c.queue_id = $%d", paramIdx)
			args = append(args, qID)
			paramIdx++
		}
	}
	if channelIDFilter != "" {
		if chID, err := uuid.Parse(channelIDFilter); err == nil {
			query += fmt.Sprintf(" AND c.channel_id = $%d", paramIdx)
			args = append(args, chID)
			paramIdx++
		}
	}
	if searchFilter != "" {
		query += fmt.Sprintf(" AND (co.name ILIKE $%d OR co.phone ILIKE $%d OR co.email ILIKE $%d)", paramIdx, paramIdx, paramIdx)
		args = append(args, "%"+searchFilter+"%")
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

	// Reset unread count when messages are viewed (scoped to tenant)
	_, _ = h.db.ExecContext(c.UserContext(), `UPDATE conversations SET unread_count = 0 WHERE id = $1 AND company_id = $2`, convID, companyID)

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

	// Verify conversation belongs to tenant before inserting (prevents IDOR)
	var exists int
	if err := h.db.GetContext(c.UserContext(), &exists, `SELECT 1 FROM conversations WHERE id = $1 AND company_id = $2`, convID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Conversation not found"})
	}

	msgID := uuid.New()
	query := `INSERT INTO messages (id, conversation_id, company_id, sender_type, sender_id, body, media_url, is_internal, status) 
		VALUES ($1, $2, $3, 'user', $4, $5, $6, $7, 'sent') 
		RETURNING id, conversation_id, company_id, sender_type, sender_id, body, media_url, is_internal, status, created_at`

	var newMsg models.Message
	err = h.db.GetContext(c.UserContext(), &newMsg, query, msgID, convID, companyID, userID, req.Body, req.MediaURL, req.IsInternal)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save message"})
	}

	// Update conversation last_message_at and auto-set first_response_at if user response (scoped to tenant)
	if !req.IsInternal {
		updateConvQuery := `UPDATE conversations SET 
			last_message_at = CURRENT_TIMESTAMP, 
			first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
			updated_at = CURRENT_TIMESTAMP 
			WHERE id = $1 AND company_id = $2`
		_, _ = h.db.ExecContext(c.UserContext(), updateConvQuery, convID, companyID)
	} else {
		_, _ = h.db.ExecContext(c.UserContext(), `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND company_id = $2`, convID, companyID)
	}

	// Dispatch to external provider if not internal (Chatwoot-like outbound)
	if !req.IsInternal {
		go h.dispatchOutbound(companyID, convID, newMsg)
	}

	// Push non-internal messages to Redis 50-message context window (for AI/SDR)
	if !req.IsInternal && h.redisClient != nil {
		msgBytes, _ := json.Marshal(newMsg)
		_ = h.redisClient.PushConversationMessage(c.UserContext(), companyIDStr, convIDStr, string(msgBytes))
	}

	// Broadcast event via WebSocket to all connected operators in tenant
	h.wsHub.BroadcastToCompany(companyIDStr, "new_message", newMsg)
	if h.publisher != nil {
		h.publisher.PublishEvent(companyIDStr, "message.sent", newMsg)
	}

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
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	convIDStr := c.Params("id")
	convID, _ := uuid.Parse(convIDStr)

	// Verify conversation ownership
	var convExists int
	if err := h.db.GetContext(c.UserContext(), &convExists, `SELECT 1 FROM conversations WHERE id=$1 AND company_id=$2`, convID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Conversation not found"})
	}

	var req struct {
		TagID *uuid.UUID `json:"tag_id"`
		Name  string     `json:"name"`
		Color string     `json:"color"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var tagID uuid.UUID
	if req.TagID != nil && *req.TagID != uuid.Nil {
		// Validate tag belongs to tenant
		if err := h.db.GetContext(c.UserContext(), &tagID, `SELECT id FROM tags WHERE id=$1 AND company_id=$2`, *req.TagID, companyID); err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Tag not found"})
		}
	} else if req.Name != "" {
		name := req.Name
		// Get-or-create by name
		err := h.db.GetContext(c.UserContext(), &tagID, `SELECT id FROM tags WHERE company_id=$1 AND LOWER(name)=LOWER($2)`, companyID, name)
		if err != nil {
			tagID = uuid.New()
			color := req.Color
			if color == "" {
				color = "#6366F1"
			}
			_, err = h.db.ExecContext(c.UserContext(), `INSERT INTO tags (id, company_id, name, color) VALUES ($1,$2,$3,$4)`, tagID, companyID, name, color)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create tag"})
			}
		}
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tag_id or name is required"})
	}

	query := `INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`
	_, err := h.db.ExecContext(c.UserContext(), query, convID, tagID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to attach tag"})
	}

	return c.JSON(fiber.Map{"message": "Tag attached successfully", "tag_id": tagID})
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

func (h *Handler) dispatchOutbound(companyID, conversationID uuid.UUID, msg models.Message) {
	// Lookup conversation's channel and contact
	var ch struct {
		ID                   uuid.UUID `db:"id"`
		Type                 string    `db:"type"`
		CredentialsEncrypted string    `db:"credentials_encrypted"`
		ConfigJSON           string    `db:"config_json"`
	}
	var contactPhone *string
	_ = h.db.Get(&contactPhone, `SELECT phone FROM contacts c JOIN conversations conv ON conv.contact_id = c.id WHERE conv.id = $1`, conversationID)
	if contactPhone == nil || *contactPhone == "" {
		return
	}
	err := h.db.Get(&ch, `SELECT id, type, credentials_encrypted, config_json FROM channels WHERE id = (SELECT channel_id FROM conversations WHERE id = $1)`, conversationID)
	if err != nil {
		// Fallback: try active channel for company
		err = h.db.Get(&ch, `SELECT id, type, credentials_encrypted, config_json FROM channels WHERE company_id = $1 AND status='active' ORDER BY created_at DESC LIMIT 1`, companyID)
		if err != nil {
			log.Printf("[Outbound] No channel found for conversation %s: %v", conversationID, err)
			return
		}
	}
	// Dispatch based on channel type
	switch ch.Type {
	case "whatsapp_meta", "whatsapp_official":
		if h.metaClient == nil {
			return
		}
		var creds map[string]string
		if ch.CredentialsEncrypted != "" {
			plain, err := crypto.DecryptAES(ch.CredentialsEncrypted, h.jwtSecret)
			if err == nil {
				_ = json.Unmarshal([]byte(plain), &creds)
			}
		}
		phoneNumberID := creds["phone_number_id"]
		accessToken := creds["access_token"]
		// Try config_json fallback
		if phoneNumberID == "" {
			var cfg map[string]interface{}
			if err := json.Unmarshal([]byte(ch.ConfigJSON), &cfg); err == nil {
				if v, ok := cfg["phone_number_id"].(string); ok {
					phoneNumberID = v
				}
			}
		}
		if phoneNumberID == "" {
			log.Printf("[Outbound][Meta] missing phone_number_id for channel %s", ch.ID)
			_, _ = h.db.Exec(`UPDATE messages SET status='failed' WHERE id=$1`, msg.ID)
			return
		}
		// 24h window check (spec 3.5): Meta requires template outside window
		var lastInbound sql.NullTime
		_ = h.db.Get(&lastInbound, `SELECT created_at FROM messages WHERE conversation_id=$1 AND sender_type='contact' ORDER BY created_at DESC LIMIT 1`, conversationID)
		if lastInbound.Valid && time.Since(lastInbound.Time) > 24*time.Hour {
			log.Printf("[Outbound][Meta] outside 24h window for conv %s (last inbound %v) - free text blocked, requires template", conversationID, lastInbound.Time)
			_, _ = h.db.Exec(`UPDATE messages SET status='failed' WHERE id=$1`, msg.ID)
			return
		}
		to := *contactPhone
		// Normalize to digits only for Meta (E.164 without +)
		resp, err := h.metaClient.SendTextMessage(nil, phoneNumberID, accessToken, to, msg.Body)
		if err != nil {
			log.Printf("[Outbound][Meta] send failed conv %s: %v", conversationID, err)
			_, _ = h.db.Exec(`UPDATE messages SET status='failed' WHERE id=$1`, msg.ID)
			return
		}
		log.Printf("[Outbound][Meta] sent msg %s to %s: %v", msg.ID, to, resp)
		_, _ = h.db.Exec(`UPDATE messages SET status='sent' WHERE id=$1`, msg.ID)
	case "whatsapp_qr":
		if h.wahaClient == nil {
			return
		}
		var cfg map[string]interface{}
		_ = json.Unmarshal([]byte(ch.ConfigJSON), &cfg)
		sessionName, _ := cfg["session_name"].(string)
		if sessionName == "" {
			log.Printf("[Outbound][WAHA] missing session_name for channel %s", ch.ID)
			_, _ = h.db.Exec(`UPDATE messages SET status='failed' WHERE id=$1`, msg.ID)
			return
		}
		_, err := h.wahaClient.SendTextMessage(nil, sessionName, *contactPhone, msg.Body)
		if err != nil {
			log.Printf("[Outbound][WAHA] send failed conv %s: %v", conversationID, err)
			_, _ = h.db.Exec(`UPDATE messages SET status='failed' WHERE id=$1`, msg.ID)
			return
		}
		_, _ = h.db.Exec(`UPDATE messages SET status='sent' WHERE id=$1`, msg.ID)
	default:
		log.Printf("[Outbound] channel type %s not dispatchable (msg %s stored locally)", ch.Type, msg.ID)
	}
}

func (h *Handler) UploadMedia(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Arquivo 'file' é obrigatório"})
	}
	// 10MB limit
	if file.Size > 10<<20 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Arquivo maior que 10MB"})
	}
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".pdf": true, ".mp3": true, ".mp4": true, ".ogg": true, ".oga": true}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowed[ext] {
		ext = ".bin"
	}
	if err := os.MkdirAll("uploads", 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Falha ao criar diretório de uploads"})
	}
	filename := uuid.New().String() + ext
	dst := filepath.Join("uploads", filename)
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Falha ao abrir arquivo"})
	}
	defer src.Close()
	out, err := os.Create(dst)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Falha ao salvar arquivo"})
	}
	defer out.Close()
	if _, err := io.Copy(out, src); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Falha ao gravar arquivo"})
	}
	url := "/uploads/" + filename
	return c.JSON(fiber.Map{"url": url, "filename": filename, "size": file.Size})
}
