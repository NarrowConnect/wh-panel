package models

import (
	"time"

	"github.com/google/uuid"
)

// Integration represents an external REST API, n8n/Make webhook, or script endpoint
type Integration struct {
	ID                   uuid.UUID `json:"id" db:"id"`
	CompanyID            uuid.UUID `json:"company_id" db:"company_id"`
	Name                 string    `json:"name" db:"name"`
	Type                 string    `json:"type" db:"type"` // rest_api, custom_script, n8n_make
	EndpointURL          string    `json:"endpoint_url" db:"endpoint_url"`
	AuthHeadersEncrypted string    `json:"-" db:"auth_headers_encrypted"`
	CreatedAt            time.Time `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time `json:"updated_at" db:"updated_at"`
}

type CreateIntegrationRequest struct {
	Name        string                 `json:"name" validate:"required"`
	Type        string                 `json:"type"` // rest_api, custom_script, n8n_make
	EndpointURL string                 `json:"endpoint_url" validate:"required,url"`
	AuthHeaders map[string]interface{} `json:"auth_headers"`
}

// WebhookSubscription represents an outbound event notification webhook
type WebhookSubscription struct {
	ID          uuid.UUID `json:"id" db:"id"`
	CompanyID   uuid.UUID `json:"company_id" db:"company_id"`
	Name        string    `json:"name" db:"name"`
	EventType   string    `json:"event_type" db:"event_type"` // conversation_created, message_received, crm_stage_changed, contact_created
	TargetURL   string    `json:"target_url" db:"target_url"`
	SecretToken *string   `json:"secret_token" db:"secret_token"`
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type CreateWebhookSubscriptionRequest struct {
	Name        string  `json:"name" validate:"required"`
	EventType   string  `json:"event_type" validate:"required"`
	TargetURL   string  `json:"target_url" validate:"required,url"`
	SecretToken *string `json:"secret_token"`
}

type TransformScriptTestRequest struct {
	Script  string      `json:"script" validate:"required"`
	Payload interface{} `json:"payload" validate:"required"`
}
