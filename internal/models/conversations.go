package models

import (
	"time"

	"github.com/google/uuid"
)

// Conversation represents a chat thread between a Contact and a Tenant
type Conversation struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	CompanyID      uuid.UUID  `json:"company_id" db:"company_id"`
	ContactID      uuid.UUID  `json:"contact_id" db:"contact_id"`
	ChannelID      *uuid.UUID `json:"channel_id" db:"channel_id"`
	AssignedUserID *uuid.UUID `json:"assigned_user_id" db:"assigned_user_id"`
	QueueID        *uuid.UUID `json:"queue_id" db:"queue_id"`
	Status         string     `json:"status" db:"status"` // open, pending, resolved
	UnreadCount    int        `json:"unread_count" db:"unread_count"`
	LastMessageAt  time.Time  `json:"last_message_at" db:"last_message_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`

	// Enriched fields for API responses
	Contact      *Contact `json:"contact,omitempty" db:"-"`
	AssignedUser *User    `json:"assigned_user,omitempty" db:"-"`
	Channel      *Channel `json:"channel,omitempty" db:"-"`
	Tags         []Tag    `json:"tags,omitempty" db:"-"`
}

// Message represents a single chat bubble (user reply, contact incoming, bot or internal whisper)
type Message struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	ConversationID uuid.UUID  `json:"conversation_id" db:"conversation_id"`
	CompanyID      uuid.UUID  `json:"company_id" db:"company_id"`
	SenderType     string     `json:"sender_type" db:"sender_type"` // contact, user, system, bot
	SenderID       *uuid.UUID `json:"sender_id" db:"sender_id"`
	Body           string     `json:"body" db:"body"`
	MediaURL       *string    `json:"media_url" db:"media_url"`
	IsInternal     bool       `json:"is_internal" db:"is_internal"` // Whisper note flag
	Status         string     `json:"status" db:"status"`           // sent, delivered, read, failed
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
}

type CreateMessageRequest struct {
	Body       string  `json:"body" validate:"required"`
	MediaURL   *string `json:"media_url"`
	IsInternal bool    `json:"is_internal"` // Set to true for Whisper internal notes
}

type UpdateConversationStatusRequest struct {
	Status string `json:"status" validate:"required"` // open, pending, resolved
}

type AssignConversationRequest struct {
	UserID *uuid.UUID `json:"user_id"`
}

// Tag for categorizing conversations
type Tag struct {
	ID        uuid.UUID `json:"id" db:"id"`
	CompanyID uuid.UUID `json:"company_id" db:"company_id"`
	Name      string    `json:"name" db:"name"`
	Color     string    `json:"color" db:"color"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type CreateTagRequest struct {
	Name  string `json:"name" validate:"required"`
	Color string `json:"color"`
}

type AttachTagRequest struct {
	TagID uuid.UUID `json:"tag_id" validate:"required"`
}

// WSEvent represents a real-time WebSocket event payload
type WSEvent struct {
	Event     string      `json:"event"` // new_message, status_changed, assigned_changed, tag_attached, tag_detached
	CompanyID string      `json:"company_id"`
	Data      interface{} `json:"data"`
}
