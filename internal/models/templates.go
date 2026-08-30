package models

import (
	"time"

	"github.com/google/uuid"
)

// Template represents a message template (WhatsApp Meta approved or local quick reply)
type Template struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	CompanyID      uuid.UUID  `json:"company_id" db:"company_id"`
	ChannelID      *uuid.UUID `json:"channel_id" db:"channel_id"`
	Name           string     `json:"name" db:"name"`
	Category       string     `json:"category" db:"category"` // MARKETING, UTILITY, AUTHENTICATION
	Language       string     `json:"language" db:"language"` // pt_BR, en_US, es_ES
	ComponentsJSON string     `json:"components_json" db:"components_json"`
	Status         string     `json:"status" db:"status"`     // draft, pending, approved, rejected
	MetaTemplateID *string    `json:"meta_template_id" db:"meta_template_id"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

type TemplateComponent struct {
	Type   string                   `json:"type"` // HEADER, BODY, FOOTER, BUTTONS
	Format string                   `json:"format,omitempty"` // TEXT, MEDIA, IMAGE
	Text   string                   `json:"text,omitempty"`
	Buttons []map[string]interface{} `json:"buttons,omitempty"`
}

type CreateTemplateRequest struct {
	ChannelID  *uuid.UUID          `json:"channel_id"`
	Name       string              `json:"name" validate:"required"`
	Category   string              `json:"category"` // MARKETING, UTILITY, AUTHENTICATION
	Language   string              `json:"language"` // pt_BR
	Components []TemplateComponent `json:"components" validate:"required"`
	SubmitMeta bool                `json:"submit_meta"` // If true, immediately submits to Meta API Graph
}
