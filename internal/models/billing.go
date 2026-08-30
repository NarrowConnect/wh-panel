package models

import (
	"time"

	"github.com/google/uuid"
)

// BillingPlan represents a SaaS pricing tier
type BillingPlan struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Slug         string    `json:"slug" db:"slug"`
	PriceMonthly float64   `json:"price_monthly" db:"price_monthly"`
	MaxUsers     int       `json:"max_users" db:"max_users"`
	MaxContacts  int       `json:"max_contacts" db:"max_contacts"`
	MaxChannels  int       `json:"max_channels" db:"max_channels"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// Subscription tracks tenant active SaaS plan
type Subscription struct {
	ID                uuid.UUID `json:"id" db:"id"`
	CompanyID         uuid.UUID `json:"company_id" db:"company_id"`
	PlanID            uuid.UUID `json:"plan_id" db:"plan_id"`
	Status            string    `json:"status" db:"status"` // active, past_due, canceled
	CurrentPeriodEnd  time.Time `json:"current_period_end" db:"current_period_end"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`

	Plan *BillingPlan `json:"plan,omitempty" db:"-"`
}

type UpdateSubscriptionRequest struct {
	PlanID uuid.UUID `json:"plan_id" validate:"required"`
}

// AIProviderConfig represents encrypted API credentials for AI SDR / Chatbot motors
type AIProviderConfig struct {
	ID               uuid.UUID `json:"id" db:"id"`
	CompanyID        uuid.UUID `json:"company_id" db:"company_id"`
	Provider         string    `json:"provider" db:"provider"` // openai, anthropic, deepseek
	APIKeyEncrypted  string    `json:"-" db:"api_key_encrypted"`
	ModelName        string    `json:"model_name" db:"model_name"`
	IsActive         bool      `json:"is_active" db:"is_active"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" db:"updated_at"`
}

type SaveAIProviderRequest struct {
	Provider  string `json:"provider" validate:"required"` // openai, anthropic, deepseek
	APIKey    string `json:"api_key" validate:"required"`
	ModelName string `json:"model_name"` // gpt-4o-mini, claude-3-5-sonnet, deepseek-chat
}
