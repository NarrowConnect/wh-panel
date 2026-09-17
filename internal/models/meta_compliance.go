package models

import (
	"time"

	"github.com/google/uuid"
)

// MetaComplianceItem tracks the setup/checklist state of one Meta App Review
// permission or Business Verification step for a company. It is a self-tracked
// checklist — Meta does not expose a simple public API for per-permission App
// Review status, so `status`/`checked` reflect what the company has recorded,
// not something WH Panel verifies automatically against Meta.
type MetaComplianceItem struct {
	ID          uuid.UUID `json:"id" db:"id"`
	CompanyID   uuid.UUID `json:"company_id" db:"company_id"`
	ItemKey     string    `json:"item_key" db:"item_key"`
	Category    string    `json:"category" db:"category"` // permission, verification
	Status      string    `json:"status" db:"status"`     // not_started, in_review, approved, rejected
	UseCaseText string    `json:"use_case_text" db:"use_case_text"`
	Checked     bool      `json:"checked" db:"checked"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// UpdateMetaComplianceItemRequest is the payload to upsert one checklist item.
type UpdateMetaComplianceItemRequest struct {
	Status      *string `json:"status"`
	UseCaseText *string `json:"use_case_text"`
	Checked     *bool   `json:"checked"`
}
