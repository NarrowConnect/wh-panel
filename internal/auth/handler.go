package auth

import (
	"database/sql"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
)

type Handler struct {
	db     *sqlx.DB
	jwtMgr *JWTManager
}

func NewHandler(db *sqlx.DB, jwtMgr *JWTManager) *Handler {
	return &Handler{
		db:     db,
		jwtMgr: jwtMgr,
	}
}

func (h *Handler) RegisterRoutes(router fiber.Router) {
	authGroup := router.Group("/auth")
	authGroup.Post("/login", h.Login)
	authGroup.Post("/refresh", h.RefreshToken)
	authGroup.Post("/logout", h.Logout)
}

func (h *Handler) Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if req.Email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Email and password are required"})
	}

	var user models.User
	var err error

	if req.CompanySlug != "" {
		// Specific company login context
		query := `SELECT u.id, u.company_id, u.name, u.email, u.password_hash, u.role, u.status, u.created_at, u.updated_at 
			FROM users u 
			JOIN companies c ON c.id = u.company_id 
			WHERE u.email = $1 AND c.slug = $2 AND u.status = 'active'`
		err = h.db.GetContext(c.UserContext(), &user, query, req.Email, req.CompanySlug)
	} else {
		// Global lookup
		var users []models.User
		query := `SELECT id, company_id, name, email, password_hash, role, status, created_at, updated_at FROM users WHERE email = $1 AND status = 'active'`
		err = h.db.SelectContext(c.UserContext(), &users, query, req.Email)
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
