package billing

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
)

// PlanLimitsChecker provides methods to verify tenant is within plan limits before allowing resource creation
type PlanLimitsChecker struct {
	db *sqlx.DB
}

func NewPlanLimitsChecker(db *sqlx.DB) *PlanLimitsChecker {
	return &PlanLimitsChecker{db: db}
}

// CheckUserLimit returns true if the company can add more users based on their subscription plan
func (p *PlanLimitsChecker) CheckUserLimit(ctx context.Context, companyID uuid.UUID) (bool, int, int) {
	plan := p.getActivePlan(ctx, companyID)
	if plan == nil {
		return true, 0, 0 // No plan = no restrictions (free tier fallback)
	}

	var currentCount int
	_ = p.db.GetContext(ctx, &currentCount, `SELECT COUNT(*) FROM users WHERE company_id = $1 AND status = 'active'`, companyID)

	return currentCount < plan.MaxUsers, currentCount, plan.MaxUsers
}

// CheckContactLimit returns true if the company can add more contacts
func (p *PlanLimitsChecker) CheckContactLimit(ctx context.Context, companyID uuid.UUID) (bool, int, int) {
	plan := p.getActivePlan(ctx, companyID)
	if plan == nil {
		return true, 0, 0
	}

	var currentCount int
	_ = p.db.GetContext(ctx, &currentCount, `SELECT COUNT(*) FROM contacts WHERE company_id = $1 AND status = 'active'`, companyID)

	return currentCount < plan.MaxContacts, currentCount, plan.MaxContacts
}

// CheckChannelLimit returns true if the company can add more channels
func (p *PlanLimitsChecker) CheckChannelLimit(ctx context.Context, companyID uuid.UUID) (bool, int, int) {
	plan := p.getActivePlan(ctx, companyID)
	if plan == nil {
		return true, 0, 0
	}

	var currentCount int
	_ = p.db.GetContext(ctx, &currentCount, `SELECT COUNT(*) FROM channels WHERE company_id = $1 AND status = 'active'`, companyID)

	return currentCount < plan.MaxChannels, currentCount, plan.MaxChannels
}

func (p *PlanLimitsChecker) getActivePlan(ctx context.Context, companyID uuid.UUID) *models.BillingPlan {
	var sub models.Subscription
	err := p.db.GetContext(ctx, &sub, `SELECT plan_id FROM subscriptions WHERE company_id = $1 AND status = 'active'`, companyID)
	if err != nil {
		if err == sql.ErrNoRows {
			// Fallback to starter plan
			var starterPlan models.BillingPlan
			err = p.db.GetContext(ctx, &starterPlan, `SELECT id, name, slug, max_users, max_contacts, max_channels FROM billing_plans WHERE slug = 'starter' LIMIT 1`)
			if err == nil {
				return &starterPlan
			}
		}
		return nil
	}

	var plan models.BillingPlan
	err = p.db.GetContext(ctx, &plan, `SELECT id, name, slug, max_users, max_contacts, max_channels FROM billing_plans WHERE id = $1`, sub.PlanID)
	if err != nil {
		return nil
	}
	return &plan
}
