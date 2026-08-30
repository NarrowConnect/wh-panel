package tenant

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/auth"
	"wh-panel/pkg/postgres"
)

const (
	LocalCompanyIDKey = "company_id"
	LocalUserIDKey    = "user_id"
	LocalUserEmailKey = "user_email"
	LocalUserRoleKey  = "user_role"
	LocalTokenIDKey   = "token_id"
)

func AuthAndTenantMiddleware(jwtMgr *auth.JWTManager, db *sqlx.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing authorization token",
			})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization header format. Use 'Bearer <token>'",
			})
		}

		tokenStr := parts[1]
		claims, err := jwtMgr.ValidateToken(c.UserContext(), tokenStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		// Inject tenant & user context into Fiber Locals
		c.Locals(LocalCompanyIDKey, claims.CompanyID.String())
		c.Locals(LocalUserIDKey, claims.UserID.String())
		c.Locals(LocalUserEmailKey, claims.Email)
		c.Locals(LocalUserRoleKey, claims.Role)
		c.Locals(LocalTokenIDKey, claims.TokenID)

		// Set PostgreSQL Row Level Security (RLS) variable app.current_company_id
		if db != nil {
			if err := postgres.SetTenantContext(c.UserContext(), db, claims.CompanyID.String()); err != nil {
				log.Printf("[TenantMiddleware] Error setting postgres RLS tenant context: %v", err)
			}
		}

		return c.Next()
	}
}

// RequireRole enforces role-based authorization (e.g. admin, supervisor)
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole, ok := c.Locals(LocalUserRoleKey).(string)
		if !ok || userRole == "" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Role not found in token context",
			})
		}

		// Admin has access to everything
		if userRole == "admin" {
			return c.Next()
		}

		for _, r := range roles {
			if r == userRole {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Insufficient permissions for this operation",
		})
	}
}
