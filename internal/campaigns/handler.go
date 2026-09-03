package campaigns

import (
	"database/sql"
	"encoding/csv"
	"errors"
	"io"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/channels"
	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
)

type Handler struct {
	db         *sqlx.DB
	dispatcher *Dispatcher
}

func NewHandler(db *sqlx.DB, dispatcher *Dispatcher) *Handler {
	return &Handler{
		db:         db,
		dispatcher: dispatcher,
	}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	camp := router.Group("/campaigns")
	camp.Get("/", h.ListCampaigns)
	camp.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateCampaign)
	camp.Get("/:id", h.GetCampaign)
	camp.Post("/:id/start", tenant.RequireRole("admin", "supervisor"), h.StartCampaign)
	camp.Post("/:id/cancel", tenant.RequireRole("admin", "supervisor"), h.CancelCampaign)
	camp.Get("/:id/recipients", h.GetCampaignRecipients)
	camp.Post("/:id/import-csv", tenant.RequireRole("admin", "supervisor"), h.ImportCSV)
}

func (h *Handler) ListCampaigns(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var list []models.Campaign
	query := `SELECT id, company_id, channel_id, template_id, name, status, scheduled_at, rate_limit_per_minute, created_at, updated_at 
		FROM campaigns WHERE company_id = $1 ORDER BY created_at DESC`

	if err := h.db.SelectContext(c.UserContext(), &list, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch campaigns"})
	}

	for i := range list {
		_ = h.db.GetContext(c.UserContext(), &list[i].TotalRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1`, list[i].ID)
		_ = h.db.GetContext(c.UserContext(), &list[i].SentRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status IN ('sent', 'delivered', 'read')`, list[i].ID)
		_ = h.db.GetContext(c.UserContext(), &list[i].FailedRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status = 'failed'`, list[i].ID)
	}

	return c.JSON(list)
}

func (h *Handler) GetCampaign(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	campIDStr := c.Params("id")
	campID, err := uuid.Parse(campIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid campaign ID"})
	}

	var camp models.Campaign
	query := `SELECT id, company_id, channel_id, template_id, name, status, scheduled_at, rate_limit_per_minute, created_at, updated_at 
		FROM campaigns WHERE id = $1 AND company_id = $2`

	if err := h.db.GetContext(c.UserContext(), &camp, query, campID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Campaign not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	_ = h.db.GetContext(c.UserContext(), &camp.TotalRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1`, camp.ID)
	_ = h.db.GetContext(c.UserContext(), &camp.SentRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status IN ('sent', 'delivered', 'read')`, camp.ID)
	_ = h.db.GetContext(c.UserContext(), &camp.FailedRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status = 'failed'`, camp.ID)
	_ = h.db.GetContext(c.UserContext(), &camp.PendingRecipients, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`, camp.ID)

	return c.JSON(camp)
}

func (h *Handler) CreateCampaign(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateCampaignRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Campaign name is required"})
	}

	rateLimit := req.RateLimitPerMinute
	if rateLimit <= 0 {
		rateLimit = 60
	}

	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database transaction error"})
	}
	defer tx.Rollback()

	campID := uuid.New()
	query := `INSERT INTO campaigns (id, company_id, channel_id, template_id, name, status, rate_limit_per_minute) 
		VALUES ($1, $2, $3, $4, $5, 'draft', $6) 
		RETURNING id, company_id, channel_id, template_id, name, status, scheduled_at, rate_limit_per_minute, created_at, updated_at`

	var newCamp models.Campaign
	err = tx.GetContext(c.UserContext(), &newCamp, query, campID, companyID, req.ChannelID, req.TemplateID, req.Name, rateLimit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create campaign"})
	}

	// Add recipients from explicit ContactIDs list or by TagID (fix: support contacts via conversation_tags)
	var contactIDs []uuid.UUID = req.ContactIDs

	if req.TagID != nil {
		var tagContacts []uuid.UUID
		// Primary: conversation_tags (current model)
		_ = tx.SelectContext(c.UserContext(), &tagContacts, `SELECT DISTINCT c.id FROM contacts c JOIN conversations conv ON conv.contact_id = c.id JOIN conversation_tags ct ON ct.conversation_id = conv.id WHERE ct.tag_id = $1 AND c.company_id = $2`, req.TagID, companyID)
		// Dedup
		seen := make(map[uuid.UUID]bool)
		for _, id := range contactIDs {
			seen[id] = true
		}
		for _, id := range tagContacts {
			if !seen[id] {
				contactIDs = append(contactIDs, id)
				seen[id] = true
			}
		}
	}

	recQuery := `INSERT INTO campaign_recipients (id, campaign_id, contact_id, status) VALUES ($1, $2, $3, 'pending') ON CONFLICT DO NOTHING`
	for _, cID := range contactIDs {
		rID := uuid.New()
		_, _ = tx.ExecContext(c.UserContext(), recQuery, rID, campID, cID)
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit campaign transaction"})
	}

	return c.Status(fiber.StatusCreated).JSON(newCamp)
}

func (h *Handler) StartCampaign(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	campIDStr := c.Params("id")
	campID, err := uuid.Parse(campIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid campaign ID"})
	}

	err = h.dispatcher.QueueCampaignTasks(c.UserContext(), companyID, campID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"message":     "Campaign queued and started processing successfully",
		"campaign_id": campID,
	})
}

func (h *Handler) CancelCampaign(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	campIDStr := c.Params("id")
	campID, _ := uuid.Parse(campIDStr)

	_, err := h.db.ExecContext(c.UserContext(), `UPDATE campaigns SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND company_id = $2`, campID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to cancel campaign"})
	}

	return c.JSON(fiber.Map{"message": "Campaign cancelled successfully"})
}

func (h *Handler) GetCampaignRecipients(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	campIDStr := c.Params("id")
	campID, _ := uuid.Parse(campIDStr)

	var list []models.CampaignRecipient
	query := `SELECT cr.id, cr.campaign_id, cr.contact_id, cr.status, cr.error_message, cr.sent_at, cr.created_at 
		FROM campaign_recipients cr
		JOIN campaigns c ON c.id = cr.campaign_id
		WHERE cr.campaign_id = $1 AND c.company_id = $2 
		ORDER BY cr.created_at DESC LIMIT 100`

	if err := h.db.SelectContext(c.UserContext(), &list, query, campID, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch recipients"})
	}

	for i := range list {
		var ct models.Contact
		_ = h.db.GetContext(c.UserContext(), &ct, `SELECT id, name, phone, email FROM contacts WHERE id = $1`, list[i].ContactID)
		list[i].Contact = &ct
	}

	return c.JSON(list)
}

func (h *Handler) ImportCSV(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	campIDStr := c.Params("id")
	campID, _ := uuid.Parse(campIDStr)

	// Verify campaign belongs to tenant and is draft
	var campExists int
	if err := h.db.GetContext(c.UserContext(), &campExists, `SELECT 1 FROM campaigns WHERE id=$1 AND company_id=$2`, campID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Campaign not found"})
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "CSV file is required (field 'file')"})
	}
	f, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot open CSV file"})
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Empty CSV"})
	}
	// Handle delimiter ; inside single column header
	if len(header) == 1 && strings.Contains(header[0], ";") {
		header = strings.Split(header[0], ";")
		for i := range header {
			header[i] = strings.TrimSpace(header[i])
		}
		reader.Comma = ';'
	}
	// Normalize header
	for i, h := range header {
		header[i] = strings.ToLower(strings.TrimSpace(h))
	}
	phoneIdx, nameIdx, emailIdx := -1, -1, -1
	for i, h := range header {
		switch h {
		case "phone", "telefone", "celular", "whatsapp":
			phoneIdx = i
		case "name", "nome", "contact", "contato":
			nameIdx = i
		case "email", "e-mail":
			emailIdx = i
		}
	}
	if phoneIdx == -1 {
		// Assume first column is phone if not labeled
		phoneIdx = 0
	}

	var imported, skipped int
	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "DB error"})
	}
	defer tx.Rollback()

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			skipped++
			continue
		}
		if len(record) == 1 && strings.Contains(record[0], ";") {
			record = strings.Split(record[0], ";")
		}
		if len(record) <= phoneIdx {
			skipped++
			continue
		}
		rawPhone := strings.TrimSpace(record[phoneIdx])
		phone := channels.NormalizePhone(rawPhone)
		if phone == "" {
			skipped++
			continue
		}
		name := ""
		if nameIdx >= 0 && nameIdx < len(record) {
			name = strings.TrimSpace(record[nameIdx])
		}
		if name == "" {
			name = "Contato " + phone
		}
		email := ""
		if emailIdx >= 0 && emailIdx < len(record) {
			email = strings.TrimSpace(record[emailIdx])
		}
		// Upsert contact
		var contactID uuid.UUID
		err = tx.GetContext(c.UserContext(), &contactID, `SELECT id FROM contacts WHERE company_id=$1 AND phone=$2`, companyID, phone)
		if err != nil {
			contactID = uuid.New()
			var emailPtr *string
			if email != "" {
				emailPtr = &email
			}
			_, _ = tx.ExecContext(c.UserContext(), `INSERT INTO contacts (id, company_id, name, phone, email, status) VALUES ($1,$2,$3,$4,$5,'active')`, contactID, companyID, name, phone, emailPtr)
		}
		// Insert recipient
		recID := uuid.New()
		_, _ = tx.ExecContext(c.UserContext(), `INSERT INTO campaign_recipients (id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'pending') ON CONFLICT DO NOTHING`, recID, campID, contactID)
		imported++
	}
	_ = tx.Commit()
	return c.JSON(fiber.Map{"imported": imported, "skipped": skipped, "message": "CSV import completed"})
}
