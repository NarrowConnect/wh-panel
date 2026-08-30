package campaigns

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/pkg/redis"
)

type Dispatcher struct {
	db          *sqlx.DB
	redisClient *redis.Client
}

func NewDispatcher(db *sqlx.DB, redisClient *redis.Client) *Dispatcher {
	return &Dispatcher{
		db:          db,
		redisClient: redisClient,
	}
}

type CampaignTaskPayload struct {
	CampaignID  string `json:"campaign_id"`
	CompanyID   string `json:"company_id"`
	RecipientID string `json:"recipient_id"`
	ContactID   string `json:"contact_id"`
}

// QueueCampaignTasks pushes recipients to Redis Stream for throttled processing
func (d *Dispatcher) QueueCampaignTasks(ctx context.Context, companyID, campaignID uuid.UUID) error {
	// Verify campaign belongs to company and is in draft status
	var currentStatus string
	err := d.db.GetContext(ctx, &currentStatus, `SELECT status FROM campaigns WHERE id = $1 AND company_id = $2`, campaignID, companyID)
	if err != nil {
		return err
	}
	if currentStatus != "draft" && currentStatus != "scheduled" {
		return nil // Can only start draft or scheduled campaigns
	}

	var recipientIDs []string
	query := `SELECT id::text FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`
	err = d.db.SelectContext(ctx, &recipientIDs, query, campaignID)
	if err != nil || len(recipientIDs) == 0 {
		return nil
	}

	// Update campaign status to 'processing'
	_, _ = d.db.ExecContext(ctx, `UPDATE campaigns SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, campaignID)

	if d.redisClient != nil {
		streamKey := "campaigns:stream:queue"
		for _, recID := range recipientIDs {
			payload, _ := json.Marshal(CampaignTaskPayload{
				CampaignID:  campaignID.String(),
				CompanyID:   companyID.String(),
				RecipientID: recID,
			})

			_ = d.redisClient.Raw().XAdd(ctx, &redis.XAddArgs{
				Stream: streamKey,
				Values: map[string]interface{}{"payload": string(payload)},
			}).Err()
		}
		log.Printf("[CampaignDispatcher] Queued %d messages to Redis Stream for campaign %s", len(recipientIDs), campaignID)
	} else {
		// Fallback: direct background processing with rate limiting
		go d.processDirect(campaignID, recipientIDs)
	}

	return nil
}

func (d *Dispatcher) processDirect(campaignID uuid.UUID, recipientIDs []string) {
	// Fetch rate limit config for this campaign
	var rateLimit int
	_ = d.db.Get(&rateLimit, `SELECT rate_limit_per_minute FROM campaigns WHERE id = $1`, campaignID)
	if rateLimit <= 0 {
		rateLimit = 60
	}

	delay := time.Minute / time.Duration(rateLimit) // e.g. 60/min = 1 msg per second

	for _, recID := range recipientIDs {
		// Check if campaign was cancelled
		var status string
		_ = d.db.Get(&status, `SELECT status FROM campaigns WHERE id = $1`, campaignID)
		if status == "cancelled" {
			log.Printf("[CampaignDispatcher] Campaign %s was cancelled, stopping.", campaignID)
			return
		}

		time.Sleep(delay)
		now := time.Now()
		_, _ = d.db.Exec(`UPDATE campaign_recipients SET status = 'sent', sent_at = $1 WHERE id = $2`, now, recID)
	}
	_, _ = d.db.Exec(`UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, campaignID)
	log.Printf("[CampaignDispatcher] Completed campaign %s", campaignID)
}

// StartStreamWorker listens to Redis Stream and processes messages with rate limiting
func (d *Dispatcher) StartStreamWorker(ctx context.Context) {
	if d.redisClient == nil {
		return
	}

	streamKey := "campaigns:stream:queue"
	log.Println("[CampaignWorker] Starting Redis Stream Consumer Worker...")

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
				entries, err := d.redisClient.Raw().XRead(ctx, &redis.XReadArgs{
					Streams: []string{streamKey, "0"},
					Count:   10,
					Block:   2 * time.Second,
				}).Result()

				if err == nil && len(entries) > 0 {
					for _, stream := range entries {
						for _, message := range stream.Messages {
							payloadStr, ok := message.Values["payload"].(string)
							if ok {
								var task CampaignTaskPayload
								if err := json.Unmarshal([]byte(payloadStr), &task); err == nil {
									d.dispatchRecipientMessage(ctx, task)
								}
							}
							// Acknowledge and remove processed message
							_ = d.redisClient.Raw().XDel(ctx, streamKey, message.ID).Err()
						}
					}
				}
				time.Sleep(500 * time.Millisecond)
			}
		}
	}()
}

func (d *Dispatcher) dispatchRecipientMessage(ctx context.Context, task CampaignTaskPayload) {
	// Check if campaign was cancelled before sending
	var status string
	_ = d.db.GetContext(ctx, &status, `SELECT status FROM campaigns WHERE id = $1`, task.CampaignID)
	if status == "cancelled" {
		return
	}

	now := time.Now()
	_, _ = d.db.ExecContext(ctx, `UPDATE campaign_recipients SET status = 'sent', sent_at = $1 WHERE id = $2`, now, task.RecipientID)

	// Check if all recipients for campaign are processed
	var pendingCount int
	_ = d.db.GetContext(ctx, &pendingCount, `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`, task.CampaignID)
	if pendingCount == 0 {
		_, _ = d.db.ExecContext(ctx, `UPDATE campaigns SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, task.CampaignID)
		log.Printf("[CampaignWorker] Campaign %s completely processed", task.CampaignID)
	}
}
