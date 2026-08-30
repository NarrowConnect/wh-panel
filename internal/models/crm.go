package models

import (
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

type CreateStageDTO struct {
	Name       string `json:"name" validate:"required"`
	Color      string `json:"color"`
	OrderIndex int    `json:"order_index"`
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
	ID             uuid.UUID  `json:"id" db:"id"`
	CompanyID      uuid.UUID  `json:"company_id" db:"company_id"`
	PipelineID     uuid.UUID  `json:"pipeline_id" db:"pipeline_id"`
	StageID        uuid.UUID  `json:"stage_id" db:"stage_id"`
	ContactID      *uuid.UUID `json:"contact_id" db:"contact_id"`
	ConversationID *uuid.UUID `json:"conversation_id" db:"conversation_id"`
	Title          string     `json:"title" db:"title"`
	Value          float64    `json:"value" db:"value"`
	Status         string     `json:"status" db:"status"` // open, won, lost
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`

	Contact *Contact `json:"contact,omitempty" db:"-"`
}

type CreateCRMCardRequest struct {
	PipelineID     uuid.UUID  `json:"pipeline_id" validate:"required"`
	StageID        uuid.UUID  `json:"stage_id" validate:"required"`
	ContactID      *uuid.UUID `json:"contact_id"`
	ConversationID *uuid.UUID `json:"conversation_id"`
	Title          string     `json:"title" validate:"required"`
	Value          float64    `json:"value"`
}

type MoveCRMCardRequest struct {
	StageID uuid.UUID `json:"stage_id" validate:"required"`
	Status  string    `json:"status"` // open, won, lost
}
