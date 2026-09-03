-- CRM Robust: custom_values, history, ordering safety

-- 1. Add custom_values JSONB to cards (Kommo/ClickUp style per-card dynamic fields)
ALTER TABLE crm_cards ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE crm_cards ADD COLUMN IF NOT EXISTS description TEXT;

-- Ensure updated_at trigger via manual updates (already using CURRENT_TIMESTAMP in queries)

-- 2. Card movement history / audit trail
CREATE TABLE IF NOT EXISTS crm_card_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES crm_cards(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    to_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    moved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_card_history_card ON crm_card_history(card_id);
CREATE INDEX IF NOT EXISTS idx_crm_card_history_company ON crm_card_history(company_id);

ALTER TABLE crm_card_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='tenant_isolation_crm_card_history' AND tablename='crm_card_history') THEN
        CREATE POLICY tenant_isolation_crm_card_history ON crm_card_history
            USING (
                current_setting('app.current_company_id', true) IS NULL 
                OR current_setting('app.current_company_id', true) = '' 
                OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
            )
            WITH CHECK (
                current_setting('app.current_company_id', true) IS NULL 
                OR current_setting('app.current_company_id', true) = '' 
                OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
            );
    END IF;
END $$;

-- 3. Safety: ensure single default pipeline per company via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uk_crm_pipelines_single_default ON crm_pipelines(company_id) WHERE is_default = true;

-- 4. Improve stage ordering index
CREATE INDEX IF NOT EXISTS idx_crm_stages_order ON crm_stages(pipeline_id, order_index);
