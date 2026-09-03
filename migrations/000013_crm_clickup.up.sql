-- Sprint1: ClickUp-style CRM control

-- Custom fields por pipeline (desacopla de contacts)
CREATE TABLE IF NOT EXISTS crm_custom_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pipeline_id UUID REFERENCES crm_pipelines(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL DEFAULT 'text', -- text, number, date, select, boolean, url
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_crm_field_pipeline_key UNIQUE (pipeline_id, key),
    CONSTRAINT uk_crm_field_company_key UNIQUE (company_id, key) -- fallback when pipeline_id is null
);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_pipeline ON crm_custom_fields(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_company ON crm_custom_fields(company_id);
ALTER TABLE crm_custom_fields ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='tenant_isolation_crm_custom_fields') THEN
  CREATE POLICY tenant_isolation_crm_custom_fields ON crm_custom_fields USING (current_setting('app.current_company_id',true) IS NULL OR current_setting('app.current_company_id',true)='' OR company_id = NULLIF(current_setting('app.current_company_id',true),'')::uuid) WITH CHECK (current_setting('app.current_company_id',true) IS NULL OR current_setting('app.current_company_id',true)='' OR company_id = NULLIF(current_setting('app.current_company_id',true),'')::uuid);
 END IF;
END $$;

-- Card rich fields
ALTER TABLE crm_cards ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium'; -- low, medium, high, urgent
ALTER TABLE crm_cards ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE crm_cards ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE crm_cards ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_crm_cards_assignee ON crm_cards(assignee_id);
CREATE INDEX IF NOT EXISTS idx_crm_cards_due ON crm_cards(due_date);

-- Subtasks / checklist (ClickUp)
CREATE TABLE IF NOT EXISTS crm_card_subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id UUID NOT NULL REFERENCES crm_cards(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_subtasks_card ON crm_card_subtasks(card_id);
ALTER TABLE crm_card_subtasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='tenant_isolation_crm_subtasks') THEN
  CREATE POLICY tenant_isolation_crm_subtasks ON crm_card_subtasks USING (current_setting('app.current_company_id',true) IS NULL OR current_setting('app.current_company_id',true)='' OR company_id = NULLIF(current_setting('app.current_company_id',true),'')::uuid) WITH CHECK (current_setting('app.current_company_id',true) IS NULL OR current_setting('app.current_company_id',true)='' OR company_id = NULLIF(current_setting('app.current_company_id',true),'')::uuid);
 END IF;
END $$;

-- Tags de card (opcional, reuse tags table via join crm_card_tags)
CREATE TABLE IF NOT EXISTS crm_card_tags (
    card_id UUID NOT NULL REFERENCES crm_cards(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
);
