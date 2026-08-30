package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
)

type EventPublisher struct {
	db *sqlx.DB
}

func NewEventPublisher(db *sqlx.DB) *EventPublisher {
	return &EventPublisher{db: db}
}

// PublishEvent sends HTTP POST webhooks asynchronously to all registered endpoints for a given event_type
func (p *EventPublisher) PublishEvent(companyID string, eventType string, payload interface{}) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var subs []models.WebhookSubscription
		query := `SELECT id, company_id, name, event_type, target_url, secret_token 
			FROM webhooks WHERE company_id = $1 AND event_type = $2 AND is_active = TRUE`

		err := p.db.SelectContext(ctx, &subs, query, companyID, eventType)
		if err != nil || len(subs) == 0 {
			return
		}

		bodyBytes, err := json.Marshal(map[string]interface{}{
			"event":      eventType,
			"company_id": companyID,
			"timestamp":  time.Now().Format(time.RFC3339),
			"data":       payload,
		})
		if err != nil {
			return
		}

		client := &http.Client{Timeout: 5 * time.Second}

		for _, sub := range subs {
			req, err := http.NewRequestWithContext(ctx, "POST", sub.TargetURL, bytes.NewBuffer(bodyBytes))
			if err != nil {
				continue
			}

			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("User-Agent", "WH-Panel-Outbound-Webhook/1.0")
			if sub.SecretToken != nil && *sub.SecretToken != "" {
				req.Header.Set("X-Webhook-Secret", *sub.SecretToken)
			}

			resp, err := client.Do(req)
			if err != nil {
				log.Printf("[EventWebhook] Error sending event %s to %s: %v", eventType, sub.TargetURL, err)
				continue
			}
			_ = resp.Body.Close()
			log.Printf("[EventWebhook] Delivered event %s to %s (status %d)", eventType, sub.TargetURL, resp.StatusCode)
		}
	}()
}
