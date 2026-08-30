package models

import (
	"time"

	"github.com/google/uuid"
)

// QueueUserWithRole represents a user assigned to a queue with a specific queue role
type QueueUserWithRole struct {
	User
	QueueRole string `json:"queue_role" db:"queue_role"` // leader, supervisor, operator
}

// Queue represents an operator department/team (e.g. Sales, Support)
type Queue struct {
	ID                 uuid.UUID `json:"id" db:"id"`
	CompanyID          uuid.UUID `json:"company_id" db:"company_id"`
	Name               string    `json:"name" db:"name"`
	Description        *string   `json:"description" db:"description"`
	Color              string    `json:"color" db:"color"`
	AllocationStrategy string    `json:"allocation_strategy" db:"allocation_strategy"` // round_robin, least_busy, manual
	IsActive           bool      `json:"is_active" db:"is_active"`
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`

	Users []QueueUserWithRole `json:"users,omitempty" db:"-"`
	Rules []QueueRule         `json:"rules,omitempty" db:"-"`
}

type CreateQueueRequest struct {
	Name               string  `json:"name" validate:"required"`
	Description        *string `json:"description"`
	Color              string  `json:"color"`
	AllocationStrategy string  `json:"allocation_strategy"` // round_robin, least_busy, manual
}

type UpdateQueueRequest struct {
	Name               string  `json:"name"`
	Description        *string `json:"description"`
	Color              string  `json:"color"`
	AllocationStrategy string  `json:"allocation_strategy"`
	IsActive           *bool   `json:"is_active"`
}

type QueueRule struct {
	ID                uuid.UUID `json:"id" db:"id"`
	QueueID           uuid.UUID `json:"queue_id" db:"queue_id"`
	CompanyID         uuid.UUID `json:"company_id" db:"company_id"`
	Priority          int       `json:"priority" db:"priority"`
	ConditionType     string    `json:"condition_type" db:"condition_type"` // tag, channel, custom_field, lead_type
	ConditionKey      *string   `json:"condition_key" db:"condition_key"`
	ConditionOperator string    `json:"condition_operator" db:"condition_operator"` // equals, contains, in
	ConditionValue    string    `json:"condition_value" db:"condition_value"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
}

type CreateQueueRuleRequest struct {
	Priority          int     `json:"priority"`
	ConditionType     string  `json:"condition_type" validate:"required"`
	ConditionKey      *string `json:"condition_key"`
	ConditionOperator string  `json:"condition_operator"` // equals, contains, in
	ConditionValue    string  `json:"condition_value" validate:"required"`
}

type AssignQueueUserRequest struct {
	UserID    uuid.UUID `json:"user_id" validate:"required"`
	QueueRole string    `json:"queue_role"` // leader, supervisor, operator
}
