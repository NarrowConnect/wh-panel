package models

import (
	"time"

	"github.com/google/uuid"
)

// Campaign represents a mass broadcast message campaign
type Campaign struct {
	ID                 uuid.UUID  `json:"id" db:"id"`
	CompanyID          uuid.UUID  `json:"company_id" db:"company_id"`
	ChannelID          *uuid.UUID `json:"channel_id" db:"channel_id"`
	TemplateID         *uuid.UUID `json:"template_id" db:"template_id"`
	Name               string     `json:"name" db:"name"`
	Status             string     `json:"status" db:"status"` // draft, scheduled, processing, completed, cancelled
	ScheduledAt        *time.Time `json:"scheduled_at" db:"scheduled_at"`
	RateLimitPerMinute int        `json:"rate_limit_per_minute" db:"rate_limit_per_minute"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`

	// Progress stats
	TotalRecipients     int `json:"total_recipients,omitempty" db:"-"`
	SentRecipients      int `json:"sent_recipients,omitempty" db:"-"`
	FailedRecipients    int `json:"failed_recipients,omitempty" db:"-"`
	PendingRecipients   int `json:"pending_recipients,omitempty" db:"-"`
}

type CampaignRecipient struct {
	ID           uuid.UUID  `json:"id" db:"id"`
	CampaignID   uuid.UUID  `json:"campaign_id" db:"campaign_id"`
	ContactID    uuid.UUID  `json:"contact_id" db:"contact_id"`
	Status       string     `json:"status" db:"status"` // pending, sent, delivered, read, failed
	ErrorMessage *string    `json:"error_message" db:"error_message"`
	SentAt       *time.Time `json:"sent_at" db:"sent_at"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`

	Contact *Contact `json:"contact,omitempty" db:"-"`
}

type CreateCampaignRequest struct {
	ChannelID          *uuid.UUID  `json:"channel_id"`
	TemplateID         *uuid.UUID  `json:"template_id"`
	Name               string      `json:"name" validate:"required"`
	RateLimitPerMinute int         `json:"rate_limit_per_minute"`
	ContactIDs         []uuid.UUID `json:"contact_ids"`
	TagID              *uuid.UUID  `json:"tag_id"` // Select contacts by Tag
}
