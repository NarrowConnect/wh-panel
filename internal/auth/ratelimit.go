package auth

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"wh-panel/pkg/redis"
)

var memStore sync.Map // ip -> []time.Time (fallback)

type hit struct {
	count int
	reset time.Time
}

var memHits sync.Map // key -> hit

func RateLimitLogin(redisClient *redis.Client) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ip := c.IP()
		key := "ratelimit:login:" + ip
		limit := 10
		window := 60 * time.Second

		if redisClient != nil && redisClient.Raw() != nil {
			ctx := c.UserContext()
			// Use Redis INCR + EXPIRE trick
			val, err := redisClient.Raw().Incr(ctx, key).Result()
			if err == nil {
				if val == 1 {
					_ = redisClient.Raw().Expire(ctx, key, window).Err()
				}
				if val > int64(limit) {
					return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "Muitas tentativas. Tente novamente em 1 minuto."})
				}
			}
		} else {
			// Memory fallback
			now := time.Now()
			v, _ := memHits.LoadOrStore(key, &hit{count: 0, reset: now.Add(window)})
			h := v.(*hit)
			if now.After(h.reset) {
				h.count = 0
				h.reset = now.Add(window)
			}
			h.count++
			if h.count > limit {
				return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "Muitas tentativas. Tente novamente em 1 minuto."})
			}
		}
		return c.Next()
	}
}

func isStrongPassword(pw string) bool {
	if len(pw) < 8 {
		return false
	}
	hasUpper := false
	hasLower := false
	hasDigit := false
	for _, c := range pw {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		}
	}
	return hasUpper && hasLower && hasDigit
}
