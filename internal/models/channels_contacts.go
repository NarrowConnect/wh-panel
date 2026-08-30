package models

import (
	"time"

	"github.com/google/uuid"
)

// Channel represents an integrated communication channel (WhatsApp, Instagram, Webchat, etc.)
type Channel struct {
	ID                   uuid.UUID `json:"id" db:"id"`
	CompanyID            uuid.UUID `json:"company_id" db:"company_id"`
	Type                 string    `json:"type" db:"type"` // whatsapp_official, whatsapp_unofficial, instagram, facebook, x, linkedin, webchat
	Name                 string    `json:"name" db:"name"`
	Status               string    `json:"status" db:"status"` // active, inactive, disconnected
	CredentialsEncrypted string    `json:"-" db:"credentials_encrypted"`
	ConfigJSON           string    `json:"config_json" db:"config_json"`
	CreatedAt            time.Time `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time `json:"updated_at" db:"updated_at"`
}

type CreateChannelRequest struct {
	Type        string                 `json:"type" validate:"required"`
	Name        string                 `json:"name" validate:"required"`
	Credentials map[string]interface{} `json:"credentials" validate:"required"`
	Config      map[string]interface{} `json:"config"`
}

type UpdateChannelRequest struct {
	Name        string                 `json:"name"`
	Status      string                 `json:"status"`
	Credentials map[string]interface{} `json:"credentials"`
	Config      map[string]interface{} `json:"config"`
}

// Contact represents a customer/lead saved in the CRM
type Contact struct {
	ID        uuid.UUID `json:"id" db:"id"`
	CompanyID uuid.UUID `json:"company_id" db:"company_id"`
	Name      string    `json:"name" db:"name"`
	Phone     *string   `json:"phone" db:"phone"`
	Email     *string   `json:"email" db:"email"`
	AvatarURL *string   `json:"avatar_url" db:"avatar_url"`
	Status    string    `json:"status" db:"status"`
	Notes     *string   `json:"notes" db:"notes"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`

	// Custom fields loaded dynamically
	CustomValues map[string]string `json:"custom_values,omitempty" db:"-"`
}

type CreateContactRequest struct {
	Name         string            `json:"name" validate:"required"`
	Phone        *string           `json:"phone"`
	Email        *string           `json:"email"`
	AvatarURL    *string           `json:"avatar_url"`
	Notes        *string           `json:"notes"`
	CustomValues map[string]string `json:"custom_values"`
}

type UpdateContactRequest struct {
	Name         string            `json:"name"`
	Phone        *string           `json:"phone"`
	Email        *string           `json:"email"`
	AvatarURL    *string           `json:"avatar_url"`
	Status       string            `json:"status"`
	Notes        *string           `json:"notes"`
	CustomValues map[string]string `json:"custom_values"`
}

type MergeContactsRequest struct {
	PrimaryContactID   uuid.UUID `json:"primary_contact_id" validate:"required"`
	SecondaryContactID uuid.UUID `json:"secondary_contact_id" validate:"required"`
}

// CustomField defines dynamic properties configurable per company
type CustomField struct {
	ID        uuid.UUID `json:"id" db:"id"`
	CompanyID uuid.UUID `json:"company_id" db:"company_id"`
	Name      string    `json:"name" db:"name"`
	Key       string    `json:"key" db:"key"`
	FieldType string    `json:"field_type" db:"field_type"` // text, number, date, select, boolean
	Options   string    `json:"options" db:"options"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type CreateCustomFieldRequest struct {
	Name      string   `json:"name" validate:"required"`
	Key       string   `json:"key" validate:"required"`
	FieldType string   `json:"field_type" validate:"required"`
	Options   []string `json:"options"`
}
