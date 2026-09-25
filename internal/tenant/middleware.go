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

		// Row Level Security: every query of this request runs on one connection
		// scoped to the caller's company (see pkg/postgres/tenant.go). Fail
		// closed: without a scoped connection the request does not proceed.
		if db != nil {
			tc, err := postgres.Wrap(db).BindTenant(c.UserContext(), claims.CompanyID.String())
			if err != nil {
				log.Printf("[TenantMiddleware] could not scope database connection: %v", err)
				return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
					"error": "Banco de dados indisponível. Tente novamente em instantes.",
				})
			}
			defer tc.Release()
			c.SetUserContext(postgres.WithTenantConn(c.UserContext(), tc))
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
