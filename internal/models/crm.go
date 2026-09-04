package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// CRMPipeline represents a sales/support funnel
type CRMPipeline struct {
	ID        uuid.UUID  `json:"id" db:"id"`
	CompanyID uuid.UUID  `json:"company_id" db:"company_id"`
	Name      string     `json:"name" db:"name"`
	IsDefault bool       `json:"is_default" db:"is_default"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`

	Stages []CRMStage `json:"stages,omitempty" db:"-"`
}

type CreateCRMPipelineRequest struct {
	Name      string            `json:"name" validate:"required"`
	IsDefault bool              `json:"is_default"`
	Stages    []CreateStageDTO `json:"stages"`
}

type UpdateCRMPipelineRequest struct {
	Name      *string `json:"name"`
	IsDefault *bool   `json:"is_default"`
}

type CreateStageDTO struct {
	Name       string `json:"name" validate:"required"`
	Color      string `json:"color"`
	OrderIndex int    `json:"order_index"`
}

type UpdateCRMStageRequest struct {
	Name       *string `json:"name"`
	Color      *string `json:"color"`
	OrderIndex *int    `json:"order_index"`
}

// CRMStage represents a column in the Kanban board
type CRMStage struct {
	ID         uuid.UUID `json:"id" db:"id"`
	PipelineID uuid.UUID `json:"pipeline_id" db:"pipeline_id"`
	CompanyID  uuid.UUID `json:"company_id" db:"company_id"`
	Name       string    `json:"name" db:"name"`
	Color      string    `json:"color" db:"color"`
	OrderIndex int       `json:"order_index" db:"order_index"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`

	Cards []CRMCard `json:"cards,omitempty" db:"-"`
}

// CRMCard represents a deal/lead card on the Kanban board
type CRMCard struct {
	ID             uuid.UUID       `json:"id" db:"id"`
	CompanyID      uuid.UUID       `json:"company_id" db:"company_id"`
	PipelineID     uuid.UUID       `json:"pipeline_id" db:"pipeline_id"`
	StageID        uuid.UUID       `json:"stage_id" db:"stage_id"`
	ContactID      *uuid.UUID      `json:"contact_id" db:"contact_id"`
	ConversationID *uuid.UUID      `json:"conversation_id" db:"conversation_id"`
	Title          string          `json:"title" db:"title"`
	Description    *string         `json:"description,omitempty" db:"description"`
	Value          float64         `json:"value" db:"value"`
	Status         string          `json:"status" db:"status"` // open, won, lost
	Priority       string          `json:"priority" db:"priority"` // low, medium, high, urgent
	DueDate        *time.Time      `json:"due_date,omitempty" db:"due_date"`
	AssigneeID     *uuid.UUID      `json:"assignee_id,omitempty" db:"assignee_id"`
	Position       int             `json:"position" db:"position"`
	CustomValues   json.RawMessage `json:"custom_values,omitempty" db:"custom_values"`
	CreatedAt      time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at" db:"updated_at"`

	Contact   *Contact  `json:"contact,omitempty" db:"-"`
	Assignee  *User     `json:"assignee,omitempty" db:"-"`
	StageName string    `json:"stage_name,omitempty" db:"-"`
	Subtasks  []CRMSubtask `json:"subtasks,omitempty" db:"-"`
}

type CRMSubtask struct {
	ID        uuid.UUID `json:"id" db:"id"`
	CardID    uuid.UUID `json:"card_id" db:"card_id"`
	CompanyID uuid.UUID `json:"company_id" db:"company_id"`
	Title     string    `json:"title" db:"title"`
	IsDone    bool      `json:"is_done" db:"is_done"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type CRMCustomField struct {
	ID         uuid.UUID       `json:"id" db:"id"`
	CompanyID  uuid.UUID       `json:"company_id" db:"company_id"`
	PipelineID *uuid.UUID      `json:"pipeline_id,omitempty" db:"pipeline_id"`
	Name       string          `json:"name" db:"name"`
	Key        string          `json:"key" db:"key"`
	FieldType  string          `json:"field_type" db:"field_type"`
	Options    json.RawMessage `json:"options" db:"options"`
	IsRequired bool            `json:"is_required" db:"is_required"`
	OrderIndex int             `json:"order_index" db:"order_index"`
	CreatedAt  time.Time       `json:"created_at" db:"created_at"`
}

type CreateCRMCardRequest struct {
	PipelineID     uuid.UUID       `json:"pipeline_id" validate:"required"`
	StageID        uuid.UUID       `json:"stage_id" validate:"required"`
	ContactID      *uuid.UUID      `json:"contact_id"`
	ConversationID *uuid.UUID      `json:"conversation_id"`
	Title          string          `json:"title" validate:"required"`
	Description    *string         `json:"description"`
	Value          float64         `json:"value"`
	Priority       string          `json:"priority"`
	DueDate        *string         `json:"due_date"` // YYYY-MM-DD
	AssigneeID     *uuid.UUID      `json:"assignee_id"`
	CustomValues   json.RawMessage `json:"custom_values"`
	// Convenience: create contact inline if contact_id not provided
	ContactName  *string `json:"contact_name"`
	ContactPhone *string `json:"contact_phone"`
	ContactEmail *string `json:"contact_email"`
}

type UpdateCRMCardRequest struct {
	Title          *string         `json:"title"`
	Description    *string         `json:"description"`
	Value          *float64        `json:"value"`
	Priority       *string         `json:"priority"`
	DueDate        *string         `json:"due_date"`
	AssigneeID     *uuid.UUID      `json:"assignee_id"`
	Position       *int            `json:"position"`
	StageID        *uuid.UUID      `json:"stage_id"`
	ContactID      *uuid.UUID      `json:"contact_id"`
	ConversationID *uuid.UUID      `json:"conversation_id"`
	Status         *string         `json:"status"`
	CustomValues   json.RawMessage `json:"custom_values"`
}

type CreateCRMCustomFieldRequest struct {
	PipelineID *uuid.UUID      `json:"pipeline_id"`
	Name       string          `json:"name" validate:"required"`
	Key        string          `json:"key"`
	FieldType  string          `json:"field_type" validate:"required"` // text, number, date, select, boolean, url
	Options    json.RawMessage `json:"options"`
	IsRequired bool            `json:"is_required"`
	OrderIndex int             `json:"order_index"`
}

type MoveCRMCardRequest struct {
	StageID uuid.UUID `json:"stage_id" validate:"required"`
	Status  string    `json:"status"` // open, won, lost
}

type ReorderStagesRequest struct {
	OrderedIDs []uuid.UUID `json:"ordered_ids" validate:"required"`
}
