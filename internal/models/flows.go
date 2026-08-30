package models

import (
	"time"

	"github.com/google/uuid"
)

// Flow represents an automation canvas definition
type Flow struct {
	ID             uuid.UUID `json:"id" db:"id"`
	CompanyID      uuid.UUID `json:"company_id" db:"company_id"`
	Name           string    `json:"name" db:"name"`
	Description    *string   `json:"description" db:"description"`
	Status         string    `json:"status" db:"status"` // draft, active, inactive
	DefinitionJSON string    `json:"definition_json" db:"definition_json"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type FlowNode struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"` // send_message, condition, wait, transfer_queue, collect_data, end
	Data     map[string]interface{} `json:"data"`
	Position map[string]float64     `json:"position,omitempty"`
}

type FlowEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label,omitempty"`
}

type FlowDefinition struct {
	Nodes []FlowNode `json:"nodes"`
	Edges []FlowEdge `json:"edges"`
}

type CreateFlowRequest struct {
	Name        string         `json:"name" validate:"required"`
	Description *string        `json:"description"`
	Definition  FlowDefinition `json:"definition"`
}

type UpdateFlowRequest struct {
	Name        string          `json:"name"`
	Description *string         `json:"description"`
	Status      string          `json:"status"` // draft, active, inactive
	Definition  *FlowDefinition `json:"definition"`
}

// FlowExecution tracks an active running instance of a flow on a conversation
type FlowExecution struct {
	ID             uuid.UUID `json:"id" db:"id"`
	FlowID         uuid.UUID `json:"flow_id" db:"flow_id"`
	CompanyID      uuid.UUID `json:"company_id" db:"company_id"`
	ConversationID uuid.UUID `json:"conversation_id" db:"conversation_id"`
	ContactID      uuid.UUID `json:"contact_id" db:"contact_id"`
	CurrentNodeID  string    `json:"current_node_id" db:"current_node_id"`
	Status         string    `json:"status" db:"status"` // running, waiting, completed, failed
	ContextJSON    string    `json:"context_json" db:"context_json"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type TriggerFlowExecutionRequest struct {
	ConversationID uuid.UUID `json:"conversation_id" validate:"required"`
}
