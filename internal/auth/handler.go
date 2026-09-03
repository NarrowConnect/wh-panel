package auth

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/pkg/redis"
)

type Handler struct {
	db          *sqlx.DB
	jwtMgr      *JWTManager
	redisClient *redis.Client
}

func NewHandler(db *sqlx.DB, jwtMgr *JWTManager) *Handler {
	return &Handler{
		db:     db,
		jwtMgr: jwtMgr,
	}
}

func NewHandlerWithRedis(db *sqlx.DB, jwtMgr *JWTManager, rc *redis.Client) *Handler {
	return &Handler{db: db, jwtMgr: jwtMgr, redisClient: rc}
}

func (h *Handler) RegisterRoutes(router fiber.Router) {
	authGroup := router.Group("/auth")
	authGroup.Post("/login", RateLimitLogin(h.redisClient), h.Login)
	authGroup.Post("/register", RateLimitLogin(h.redisClient), h.Register)
	authGroup.Post("/refresh", h.RefreshToken)
	authGroup.Post("/logout", h.Logout)
}

func (h *Handler) Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	companySlug := strings.ToLower(strings.TrimSpace(req.CompanySlug))

	if email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Email and password are required"})
	}

	var user models.User
	var err error

	if companySlug != "" {
		// Specific company login context
		query := `SELECT u.id, u.company_id, u.name, u.email, u.password_hash, u.role, u.status, u.created_at, u.updated_at 
			FROM users u 
			JOIN companies c ON c.id = u.company_id 
			WHERE LOWER(u.email) = $1 AND LOWER(c.slug) = $2 AND u.status = 'active'`
		err = h.db.GetContext(c.UserContext(), &user, query, email, companySlug)
	} else {
		// Global lookup
		var users []models.User
		query := `SELECT id, company_id, name, email, password_hash, role, status, created_at, updated_at FROM users WHERE LOWER(email) = $1 AND status = 'active'`
		err = h.db.SelectContext(c.UserContext(), &users, query, email)
		if err == nil {
			if len(users) == 0 {
				err = sql.ErrNoRows
			} else if len(users) > 1 {
				return c.Status(fiber.StatusMultipleChoices).JSON(fiber.Map{
					"error": "Email registered in multiple companies. Please provide company_slug.",
				})
			} else {
				user = users[0]
			}
		}
	}

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	if !h.jwtMgr.CheckPassword(req.Password, user.PasswordHash) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	var company models.Company
	compQuery := `SELECT id, name, slug, plan, status, created_at, updated_at FROM companies WHERE id = $1`
	if err := h.db.GetContext(c.UserContext(), &company, compQuery, user.CompanyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Company record not found"})
	}

	accessToken, refreshToken, expiresIn, err := h.jwtMgr.GenerateTokens(user.ID, user.CompanyID, user.Email, user.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate authentication tokens"})
	}

	return c.JSON(models.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    expiresIn,
		User:         user,
		Company:      company,
	})
}

func (h *Handler) RefreshToken(c *fiber.Ctx) error {
	var req models.RefreshTokenRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	claims, err := h.jwtMgr.ValidateToken(c.UserContext(), req.RefreshToken)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired refresh token"})
	}

	var user models.User
	query := `SELECT id, company_id, name, email, password_hash, role, status FROM users WHERE id = $1 AND status = 'active'`
	if err := h.db.GetContext(c.UserContext(), &user, query, claims.UserID); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "User inactive or not found"})
	}

	newAccessToken, _, expiresIn, err := h.jwtMgr.GenerateTokens(user.ID, user.CompanyID, user.Email, user.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate access token"})
	}

	return c.JSON(models.RefreshTokenResponse{
		AccessToken: newAccessToken,
		ExpiresIn:   expiresIn,
	})
}

func (h *Handler) Logout(c *fiber.Ctx) error {
	tokenID, ok := c.Locals("token_id").(string)
	if !ok || tokenID == "" {
		return c.JSON(fiber.Map{"message": "Logged out successfully"})
	}

	// Revoke current token in Redis with exact TTL
	_ = h.jwtMgr.RevokeToken(c.UserContext(), tokenID, time.Now().Add(24*time.Hour))
	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}

func (h *Handler) GetMe(c *fiber.Ctx) error {
	userIDStr, ok := c.Locals("user_id").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	userID, _ := uuid.Parse(userIDStr)

	var user models.User
	query := `SELECT id, company_id, name, email, role, status, created_at, updated_at FROM users WHERE id = $1`
	if err := h.db.GetContext(c.UserContext(), &user, query, userID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User profile not found"})
	}

	var company models.Company
	compQuery := `SELECT id, name, slug, plan, status, created_at, updated_at FROM companies WHERE id = $1`
	_ = h.db.GetContext(c.UserContext(), &company, compQuery, user.CompanyID)

	return c.JSON(fiber.Map{
		"user":    user,
		"company": company,
	})
}

func (h *Handler) Register(c *fiber.Ctx) error {
	var req models.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	companyName := strings.TrimSpace(req.CompanyName)
	if companyName == "" {
		companyName = strings.TrimSpace(req.Name)
	}
	companySlug := strings.ToLower(strings.TrimSpace(req.CompanySlug))
	if companySlug == "" {
		companySlug = strings.ToLower(strings.TrimSpace(req.Slug))
	}
	adminName := strings.TrimSpace(req.AdminName)
	if adminName == "" {
		adminName = strings.TrimSpace(req.Name)
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		email = strings.ToLower(strings.TrimSpace(req.AdminEmail))
	}

	if companyName == "" || companySlug == "" || email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Company name, slug, email, and password are required",
		})
	}

	if adminName == "" {
		adminName = "Administrador"
	}

	if !isStrongPassword(req.Password) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Senha fraca: minimo 8 caracteres com maiuscula, minuscula e numero"})
	}

	tx, err := h.db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start database transaction"})
	}
	defer tx.Rollback()

	// Check if company slug is already taken
	var existingCount int
	_ = tx.GetContext(c.UserContext(), &existingCount, `SELECT COUNT(*) FROM companies WHERE LOWER(slug) = $1`, companySlug)
	if existingCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Company slug is already taken. Please choose another."})
	}

	// 1. Create Company
	companyID := uuid.New()
	plan := req.Plan
	if plan == "" {
		plan = "enterprise"
	}

	compQuery := `INSERT INTO companies (id, name, slug, plan, status) 
		VALUES ($1, $2, $3, $4, 'active') 
		RETURNING id, name, slug, plan, status, created_at, updated_at`

	var company models.Company
	err = tx.GetContext(c.UserContext(), &company, compQuery, companyID, companyName, companySlug, plan)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create company record"})
	}

	// 2. Hash Password and Create Admin User
	hash, err := h.jwtMgr.HashPassword(req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	userID := uuid.New()
	userQuery := `INSERT INTO users (id, company_id, name, email, password_hash, role, status) 
		VALUES ($1, $2, $3, $4, $5, 'admin', 'active') 
		RETURNING id, company_id, name, email, role, status, created_at, updated_at`

	var user models.User
	err = tx.GetContext(c.UserContext(), &user, userQuery, userID, companyID, adminName, email, hash)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create user record"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	// 3. Generate Tokens
	accessToken, refreshToken, expiresIn, err := h.jwtMgr.GenerateTokens(user.ID, company.ID, user.Email, user.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate authentication tokens"})
	}

	return c.Status(fiber.StatusCreated).JSON(models.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    expiresIn,
		User:         user,
		Company:      company,
	})
}

