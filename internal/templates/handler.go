package templates

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"regexp"

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
	tmpl := router.Group("/templates")
	tmpl.Get("/", h.ListTemplates)
	tmpl.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateTemplate)
	tmpl.Get("/:id", h.GetTemplate)
	tmpl.Put("/:id", tenant.RequireRole("admin", "supervisor"), h.UpdateTemplate)
	tmpl.Delete("/:id", tenant.RequireRole("admin"), h.DeleteTemplate)
	tmpl.Post("/:id/submit-meta", tenant.RequireRole("admin", "supervisor"), h.SubmitToMeta)
}

func (h *Handler) ListTemplates(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	statusFilter := c.Query("status")

	var list []models.Template
	var err error

	if statusFilter != "" {
		query := `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at 
			FROM templates WHERE company_id = $1 AND status = $2 ORDER BY created_at DESC`
		err = h.db.SelectContext(c.UserContext(), &list, query, companyID, statusFilter)
	} else {
		query := `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at 
			FROM templates WHERE company_id = $1 ORDER BY created_at DESC`
		err = h.db.SelectContext(c.UserContext(), &list, query, companyID)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch templates"})
	}

	return c.JSON(list)
}

func (h *Handler) GetTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	var t models.Template
	query := `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at 
		FROM templates WHERE id = $1 AND company_id = $2`

	if err := h.db.GetContext(c.UserContext(), &t, query, tmplID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	// Extract variable placeholders from components_json
	t.Variables = extractTemplateVariables(t.ComponentsJSON)

	return c.JSON(t)
}

func (h *Handler) CreateTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" || len(req.Components) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Template name and components are required"})
	}

	// Validate template name (Meta requires lowercase with underscores only)
	if !regexp.MustCompile(`^[a-z0-9_]+$`).MatchString(req.Name) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Template name must contain only lowercase letters, numbers, and underscores (Meta requirement)",
		})
	}

	category := req.Category
	if category == "" {
		category = "UTILITY"
	}

	lang := req.Language
	if lang == "" {
		lang = "pt_BR"
	}

	compBytes, _ := json.Marshal(req.Components)

	status := "draft"
	if req.SubmitMeta {
		status = "pending"
	}

	tmplID := uuid.New()
	query := `INSERT INTO templates (id, company_id, channel_id, name, category, language, components_json, status) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
		RETURNING id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at`

	var newTmpl models.Template
	err := h.db.GetContext(c.UserContext(), &newTmpl, query, tmplID, companyID, req.ChannelID, req.Name, category, lang, string(compBytes), status)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Template with this name and language already exists"})
	}

	if req.SubmitMeta {
		log.Printf("[MetaTemplates] Mock submitting template %s (%s) to Meta Graph API...", newTmpl.Name, newTmpl.ID)
		// In production, would call Meta Graph API here
		// For now simulates submission with pending status (real webhook callback updates to approved/rejected)
		metaID := "meta_tmpl_" + uuid.New().String()[:8]
		_, _ = h.db.ExecContext(c.UserContext(), `UPDATE templates SET meta_template_id = $1, status = 'pending' WHERE id = $2`, metaID, newTmpl.ID)
		newTmpl.MetaTemplateID = &metaID
		newTmpl.Status = "pending"
	}

	return c.Status(fiber.StatusCreated).JSON(newTmpl)
}

func (h *Handler) UpdateTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	// Verify template exists and is editable (only draft templates can be edited)
	var currentStatus string
	err = h.db.GetContext(c.UserContext(), &currentStatus, `SELECT status FROM templates WHERE id = $1 AND company_id = $2`, tmplID, companyID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}
	if currentStatus == "approved" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Cannot edit an approved template. Create a new version instead."})
	}

	var req models.CreateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	compBytes, _ := json.Marshal(req.Components)

	query := `UPDATE templates SET 
		name = COALESCE(NULLIF($1, ''), name),
		category = COALESCE(NULLIF($2, ''), category),
		language = COALESCE(NULLIF($3, ''), language),
		components_json = CASE WHEN $4 != '[]' AND $4 != 'null' THEN $4::jsonb ELSE components_json END,
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $5 AND company_id = $6
		RETURNING id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at`

	var updated models.Template
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Name, req.Category, req.Language, string(compBytes), tmplID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update template"})
	}

	return c.JSON(updated)
}

func (h *Handler) DeleteTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM templates WHERE id = $1 AND company_id = $2`, tmplID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete template"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}

	return c.JSON(fiber.Map{"message": "Template deleted successfully"})
}

func (h *Handler) SubmitToMeta(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	var t models.Template
	if err := h.db.GetContext(c.UserContext(), &t, `SELECT id, name, status FROM templates WHERE id = $1 AND company_id = $2`, tmplID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}

	if t.Status == "approved" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Template is already approved by Meta"})
	}

	// In production: call Meta Graph API POST /{phone-number-id}/message_templates
	// For now: simulate submission with pending status
	metaID := "meta_tmpl_" + uuid.New().String()[:8]
	query := `UPDATE templates SET meta_template_id = $1, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3 RETURNING id, status, meta_template_id, updated_at`

	var updated models.Template
	_ = h.db.GetContext(c.UserContext(), &updated, query, metaID, tmplID, companyID)

	return c.JSON(fiber.Map{
		"message":          "Template submitted to Meta Graph API for review",
		"meta_template_id": metaID,
		"status":           "pending",
	})
}

// extractTemplateVariables parses {{variable}} placeholders from components JSON
func extractTemplateVariables(componentsJSON string) []string {
	re := regexp.MustCompile(`\{\{(\w+(?:\.\w+)*)\}\}`)
	matches := re.FindAllStringSubmatch(componentsJSON, -1)
	seen := make(map[string]bool)
	var vars []string
	for _, m := range matches {
		if len(m) > 1 && !seen[m[1]] {
			vars = append(vars, m[1])
			seen[m[1]] = true
		}
	}
	return vars
}
