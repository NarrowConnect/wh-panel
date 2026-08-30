package tenant

import (
	"database/sql"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/auth"
	"wh-panel/internal/models"
)

type Handler struct {
	db     *sqlx.DB
	jwtMgr *auth.JWTManager
}

func NewHandler(db *sqlx.DB, jwtMgr *auth.JWTManager) *Handler {
	return &Handler{
		db:     db,
		jwtMgr: jwtMgr,
	}
}

func (h *Handler) RegisterPublicRoutes(router fiber.Router) {
	router.Post("/companies", h.CreateCompany)
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	comp := router.Group("/companies/me")
	comp.Get("/", h.GetMyCompany)
	comp.Get("/users", h.ListCompanyUsers)
	comp.Post("/users", RequireRole("admin"), h.CreateCompanyUser)
	comp.Put("/users/:id", RequireRole("admin"), h.UpdateCompanyUser)
	comp.Delete("/users/:id", RequireRole("admin"), h.DeactivateCompanyUser)
}

// CreateCompany registers a new Tenant along with an initial Admin user
func (h *Handler) CreateCompany(c *fiber.Ctx) error {
	var req models.CreateCompanyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" || req.Slug == "" || req.AdminEmail == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name, slug, admin_email, and password are required"})
	}

	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start database transaction"})
	}
	defer tx.Rollback()

	// 1. Create Company
	companyID := uuid.New()
	plan := req.Plan
	if plan == "" {
		plan = "free"
	}

	compQuery := `INSERT INTO companies (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, 'active') RETURNING id, name, slug, plan, status, created_at, updated_at`
	var company models.Company
	err = tx.GetContext(c.UserContext(), &company, compQuery, companyID, req.Name, req.Slug, plan)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Company with this slug already exists"})
	}

	// 2. Hash Password & Create Admin User
	hash, err := h.jwtMgr.HashPassword(req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Error processing password"})
	}

	userID := uuid.New()
	adminName := req.AdminName
	if adminName == "" {
		adminName = "Admin " + req.Name
	}

	userQuery := `INSERT INTO users (id, company_id, name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5, 'admin', 'active') RETURNING id, company_id, name, email, role, status, created_at, updated_at`
	var adminUser models.User
	err = tx.GetContext(c.UserContext(), &adminUser, userQuery, userID, companyID, adminName, req.AdminEmail, hash)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email already in use for this company"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	accessToken, refreshToken, expiresIn, _ := h.jwtMgr.GenerateTokens(adminUser.ID, company.ID, adminUser.Email, adminUser.Role)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":       "Company registered successfully",
		"company":       company,
		"admin_user":    adminUser,
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"expires_in":    expiresIn,
	})
}

// GetMyCompany fetches the authenticated company details
func (h *Handler) GetMyCompany(c *fiber.Ctx) error {
	companyIDStr := c.Locals(LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var company models.Company
	query := `SELECT id, name, slug, plan, status, created_at, updated_at FROM companies WHERE id = $1`
	if err := h.db.GetContext(c.UserContext(), &company, query, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Company not found"})
	}

	return c.JSON(company)
}

// ListCompanyUsers retrieves all users for the current company
func (h *Handler) ListCompanyUsers(c *fiber.Ctx) error {
	companyIDStr := c.Locals(LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var users []models.User
	query := `SELECT id, company_id, name, email, role, status, created_at, updated_at FROM users WHERE company_id = $1 ORDER BY created_at DESC`
	if err := h.db.SelectContext(c.UserContext(), &users, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	return c.JSON(fiber.Map{
		"users": users,
		"total": len(users),
	})
}

// CreateCompanyUser adds a new operator or supervisor to the company
func (h *Handler) CreateCompanyUser(c *fiber.Ctx) error {
	companyIDStr := c.Locals(LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name, email, and password are required"})
	}

	role := req.Role
	if role == "" {
		role = "attendant"
	}

	hash, err := h.jwtMgr.HashPassword(req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Error processing password"})
	}

	userID := uuid.New()
	query := `INSERT INTO users (id, company_id, name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id, company_id, name, email, role, status, created_at, updated_at`

	var newUser models.User
	if err := h.db.GetContext(c.UserContext(), &newUser, query, userID, companyID, req.Name, req.Email, hash, role); err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email already exists in this company"})
	}

	return c.Status(fiber.StatusCreated).JSON(newUser)
}

// UpdateCompanyUser updates user role, status or name
func (h *Handler) UpdateCompanyUser(c *fiber.Ctx) error {
	companyIDStr := c.Locals(LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	targetUserIDStr := c.Params("id")
	targetUserID, err := uuid.Parse(targetUserIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var req models.UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	query := `UPDATE users SET 
		name = COALESCE(NULLIF($1, ''), name), 
		role = COALESCE(NULLIF($2, ''), role), 
		status = COALESCE(NULLIF($3, ''), status),
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $4 AND company_id = $5 
		RETURNING id, company_id, name, email, role, status, created_at, updated_at`

	var updatedUser models.User
	if err := h.db.GetContext(c.UserContext(), &updatedUser, query, req.Name, req.Role, req.Status, targetUserID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user"})
	}

	return c.JSON(updatedUser)
}

// DeactivateCompanyUser deactivates a user (status = 'inactive')
func (h *Handler) DeactivateCompanyUser(c *fiber.Ctx) error {
	companyIDStr := c.Locals(LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	targetUserIDStr := c.Params("id")
	targetUserID, err := uuid.Parse(targetUserIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	query := `UPDATE users SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND company_id = $2`
	res, err := h.db.ExecContext(c.UserContext(), query, targetUserID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to deactivate user"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(fiber.Map{"message": "User deactivated successfully"})
}
