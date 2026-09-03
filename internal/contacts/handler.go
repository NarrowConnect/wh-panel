package contacts

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/channels"
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
	// Contacts Routes
	contacts := router.Group("/contacts")
	contacts.Get("/", h.ListContacts)
	contacts.Post("/", h.CreateContact)
	contacts.Post("/merge", tenant.RequireRole("admin", "supervisor"), h.MergeContacts)
	contacts.Get("/:id", h.GetContact)
	contacts.Put("/:id", h.UpdateContact)
	contacts.Delete("/:id", tenant.RequireRole("admin"), h.DeleteContact)

	// Custom Fields Metadata Routes
	fields := router.Group("/custom-fields")
	fields.Get("/", h.ListCustomFields)
	fields.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateCustomField)
	fields.Delete("/:id", tenant.RequireRole("admin"), h.DeleteCustomField)
}

// ListContacts retrieves paginated contacts with optional search filter (name, phone, email)
func (h *Handler) ListContacts(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	search := c.Query("search")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var list []models.Contact
	var total int

	if search != "" {
		searchPattern := "%" + search + "%"
		countQuery := `SELECT COUNT(*) FROM contacts WHERE company_id = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`
		_ = h.db.GetContext(c.UserContext(), &total, countQuery, companyID, searchPattern)

		query := `SELECT id, company_id, name, phone, email, avatar_url, status, notes, created_at, updated_at 
			FROM contacts WHERE company_id = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
			ORDER BY created_at DESC LIMIT $3 OFFSET $4`
		if err := h.db.SelectContext(c.UserContext(), &list, query, companyID, searchPattern, limit, offset); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch contacts"})
		}
	} else {
		countQuery := `SELECT COUNT(*) FROM contacts WHERE company_id = $1`
		_ = h.db.GetContext(c.UserContext(), &total, countQuery, companyID)

		query := `SELECT id, company_id, name, phone, email, avatar_url, status, notes, created_at, updated_at 
			FROM contacts WHERE company_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		if err := h.db.SelectContext(c.UserContext(), &list, query, companyID, limit, offset); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch contacts"})
		}
	}

	for i := range list {
		customValues := make(map[string]string)
		customQuery := `SELECT cf.key, cv.value 
			FROM contact_custom_values cv
			JOIN custom_fields cf ON cf.id = cv.custom_field_id
			WHERE cv.contact_id = $1 AND cf.company_id = $2`
		rows, err := h.db.QueryxContext(c.UserContext(), customQuery, list[i].ID, companyID)
		if err == nil {
			for rows.Next() {
				var key, val string
				if err := rows.Scan(&key, &val); err == nil {
					customValues[key] = val
				}
			}
			rows.Close()
		}
		list[i].CustomValues = customValues
	}

	return c.JSON(fiber.Map{
		"contacts": list,
		"total":    total,
		"page":     page,
		"limit":    limit,
	})
}

// GetContact fetches contact details along with custom field values
func (h *Handler) GetContact(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	contactIDStr := c.Params("id")
	contactID, err := uuid.Parse(contactIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid contact ID"})
	}

	var contact models.Contact
	query := `SELECT id, company_id, name, phone, email, avatar_url, status, notes, created_at, updated_at FROM contacts WHERE id = $1 AND company_id = $2`
	if err := h.db.GetContext(c.UserContext(), &contact, query, contactID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Contact not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	// Fetch custom field values
	customValues := make(map[string]string)
	customQuery := `SELECT cf.key, cv.value 
		FROM contact_custom_values cv
		JOIN custom_fields cf ON cf.id = cv.custom_field_id
		WHERE cv.contact_id = $1 AND cf.company_id = $2`

	rows, err := h.db.QueryxContext(c.UserContext(), customQuery, contactID, companyID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key, val string
			if err := rows.Scan(&key, &val); err == nil {
				customValues[key] = val
			}
		}
	}
	contact.CustomValues = customValues

	return c.JSON(contact)
}

// CreateContact adds a new contact manually with phone normalization
func (h *Handler) CreateContact(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateContactRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Contact name is required"})
	}

	var normalizedPhone *string
	if req.Phone != nil && *req.Phone != "" {
		norm := channels.NormalizePhone(*req.Phone)
		normalizedPhone = &norm
	}

	contactID := uuid.New()
	query := `INSERT INTO contacts (id, company_id, name, phone, email, avatar_url, status, notes) 
		VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) 
		RETURNING id, company_id, name, phone, email, avatar_url, status, notes, created_at, updated_at`

	var newContact models.Contact
	err := h.db.GetContext(c.UserContext(), &newContact, query, contactID, companyID, req.Name, normalizedPhone, req.Email, req.AvatarURL, req.Notes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create contact"})
	}

	// Save custom field values if provided
	if len(req.CustomValues) > 0 {
		h.saveCustomValues(c.UserContext(), companyID, newContact.ID, req.CustomValues)
	}

	return c.Status(fiber.StatusCreated).JSON(newContact)
}

// UpdateContact edits an existing contact
func (h *Handler) UpdateContact(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	contactIDStr := c.Params("id")
	contactID, err := uuid.Parse(contactIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid contact ID"})
	}

	var req models.UpdateContactRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	var normalizedPhone *string
	if req.Phone != nil && *req.Phone != "" {
		norm := channels.NormalizePhone(*req.Phone)
		normalizedPhone = &norm
	}

	query := `UPDATE contacts SET 
		name = COALESCE(NULLIF($1, ''), name), 
		phone = COALESCE($2, phone),
		email = COALESCE($3, email),
		avatar_url = COALESCE($4, avatar_url),
		status = COALESCE(NULLIF($5, ''), status),
		notes = COALESCE($6, notes),
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $7 AND company_id = $8 
		RETURNING id, company_id, name, phone, email, avatar_url, status, notes, created_at, updated_at`

	var updated models.Contact
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Name, normalizedPhone, req.Email, req.AvatarURL, req.Status, req.Notes, contactID, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Contact not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update contact"})
	}

	if len(req.CustomValues) > 0 {
		h.saveCustomValues(c.UserContext(), companyID, updated.ID, req.CustomValues)
	}

	return c.JSON(updated)
}

// DeleteContact removes a contact
func (h *Handler) DeleteContact(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	contactIDStr := c.Params("id")
	contactID, err := uuid.Parse(contactIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid contact ID"})
	}

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM contacts WHERE id = $1 AND company_id = $2`, contactID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete contact"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Contact not found"})
	}

	return c.JSON(fiber.Map{"message": "Contact deleted successfully"})
}

// MergeContacts merges a secondary contact into a primary contact (POST /contacts/merge)
func (h *Handler) MergeContacts(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.MergeContactsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.PrimaryContactID == req.SecondaryContactID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Primary and secondary contact IDs must be different"})
	}

	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}
	defer tx.Rollback()

	// 1. Verify primary contact exists
	var primary models.Contact
	if err := tx.GetContext(c.UserContext(), &primary, `SELECT id, name, phone, email, notes FROM contacts WHERE id = $1 AND company_id = $2`, req.PrimaryContactID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Primary contact not found"})
	}

	// 2. Verify secondary contact exists
	var secondary models.Contact
	if err := tx.GetContext(c.UserContext(), &secondary, `SELECT id, name, phone, email, notes FROM contacts WHERE id = $1 AND company_id = $2`, req.SecondaryContactID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Secondary contact not found"})
	}

	// 3. Move custom field values from secondary to primary if not set in primary
	moveValuesQuery := `UPDATE contact_custom_values SET contact_id = $1 WHERE contact_id = $2 ON CONFLICT DO NOTHING`
	_, _ = tx.ExecContext(c.UserContext(), moveValuesQuery, primary.ID, secondary.ID)

	// 4. Update primary with missing phone/email from secondary
	if primary.Phone == nil && secondary.Phone != nil {
		_, _ = tx.ExecContext(c.UserContext(), `UPDATE contacts SET phone = $1 WHERE id = $2`, secondary.Phone, primary.ID)
	}
	if primary.Email == nil && secondary.Email != nil {
		_, _ = tx.ExecContext(c.UserContext(), `UPDATE contacts SET email = $1 WHERE id = $2`, secondary.Email, primary.ID)
	}

	// 5. Deactivate secondary contact
	_, _ = tx.ExecContext(c.UserContext(), `UPDATE contacts SET status = 'merged', notes = COALESCE(notes, '') || ' [Merged into ' || $1::text || ']' WHERE id = $2`, primary.ID, secondary.ID)

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to merge contacts"})
	}

	return c.JSON(fiber.Map{
		"message":            "Contacts merged successfully",
		"primary_contact_id": primary.ID,
	})
}

// Custom Fields Handlers
func (h *Handler) ListCustomFields(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var fields []models.CustomField
	query := `SELECT id, company_id, name, key, field_type, options, created_at FROM custom_fields WHERE company_id = $1 ORDER BY name ASC`
	if err := h.db.SelectContext(c.UserContext(), &fields, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch custom fields"})
	}

	return c.JSON(fields)
}

func (h *Handler) CreateCustomField(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateCustomFieldRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" || req.Key == "" || req.FieldType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name, key, and field_type are required"})
	}

	optsBytes, _ := json.Marshal(req.Options)
	if len(optsBytes) == 0 {
		optsBytes = []byte("[]")
	}

	fieldID := uuid.New()
	query := `INSERT INTO custom_fields (id, company_id, name, key, field_type, options) 
		VALUES ($1, $2, $3, $4, $5, $6) 
		RETURNING id, company_id, name, key, field_type, options, created_at`

	var newField models.CustomField
	err := h.db.GetContext(c.UserContext(), &newField, query, fieldID, companyID, req.Name, req.Key, req.FieldType, string(optsBytes))
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Custom field key already exists for this company"})
	}

	return c.Status(fiber.StatusCreated).JSON(newField)
}

func (h *Handler) DeleteCustomField(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	fieldIDStr := c.Params("id")
	fieldID, err := uuid.Parse(fieldIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid field ID"})
	}

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM custom_fields WHERE id = $1 AND company_id = $2`, fieldID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete custom field"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Custom field not found"})
	}

	return c.JSON(fiber.Map{"message": "Custom field deleted successfully"})
}

func (h *Handler) saveCustomValues(ctx context.Context, companyID, contactID uuid.UUID, customValues map[string]string) {
	for key, val := range customValues {
		var field struct {
			ID        uuid.UUID `db:"id"`
			FieldType string    `db:"field_type"`
		}
		err := h.db.GetContext(ctx, &field, `SELECT id, field_type FROM custom_fields WHERE company_id = $1 AND key = $2`, companyID, key)
		if err == nil {
			if !validateCustomValueType(val, field.FieldType) {
				continue // Skip storing invalid data format
			}
			upsertQuery := `INSERT INTO contact_custom_values (id, contact_id, custom_field_id, value) 
				VALUES ($1, $2, $3, $4) 
				ON CONFLICT (contact_id, custom_field_id) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`
			_, _ = h.db.ExecContext(ctx, upsertQuery, uuid.New(), contactID, field.ID, val)
		}
	}
}

func validateCustomValueType(value, fieldType string) bool {
	if value == "" {
		return true
	}
	switch fieldType {
	case "number":
		_, err := strconv.ParseFloat(value, 64)
		return err == nil
	case "date":
		_, err := time.Parse("2006-01-02", value)
		if err != nil {
			_, err = time.Parse(time.RFC3339, value)
		}
		return err == nil
	case "boolean":
		return regexp.MustCompile(`^(true|false|1|0)$`).MatchString(value)
	}
	return true
}
