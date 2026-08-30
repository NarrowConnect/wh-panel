package redis

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type Config struct {
	Host     string
	Port     string
	Password string
}

type Client struct {
	rdb *redis.Client
}

func Connect(cfg Config) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("error connecting to redis: %w", err)
	}

	log.Println("[Redis] Connected successfully to Redis server")
	return &Client{rdb: rdb}, nil
}

func (c *Client) Raw() *redis.Client {
	return c.rdb
}

// JWT Token Blacklist management
func (c *Client) BlacklistToken(ctx context.Context, tokenID string, expiration time.Duration) error {
	key := fmt.Sprintf("jwt:blacklist:%s", tokenID)
	return c.rdb.Set(ctx, key, "revoked", expiration).Err()
}

func (c *Client) IsTokenBlacklisted(ctx context.Context, tokenID string) (bool, error) {
	key := fmt.Sprintf("jwt:blacklist:%s", tokenID)
	exists, err := c.rdb.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return exists > 0, nil
}

// Conversation Context Window (Recent 50 Messages for IA/SDR)
func (c *Client) PushConversationMessage(ctx context.Context, companyID, conversationID, messageJSON string) error {
	key := fmt.Sprintf("tenant:%s:conversation:%s:recent", companyID, conversationID)
	pipe := c.rdb.Pipeline()
	pipe.LPush(ctx, key, messageJSON)
	pipe.LTrim(ctx, key, 0, 49) // Keep last 50 messages
	pipe.Expire(ctx, key, 7*24*time.Hour) // Keep context active for 7 days
	_, err := pipe.Exec(ctx)
	return err
}

func (c *Client) GetRecentConversationMessages(ctx context.Context, companyID, conversationID string) ([]string, error) {
	key := fmt.Sprintf("tenant:%s:conversation:%s:recent", companyID, conversationID)
	return c.rdb.LRange(ctx, key, 0, -1).Result()
}
