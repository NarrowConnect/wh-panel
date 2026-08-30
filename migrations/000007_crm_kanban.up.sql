-- CRM Pipelines Table
CREATE TABLE IF NOT EXISTS crm_pipelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crm_pipelines_company ON crm_pipelines(company_id);

-- Enable RLS on crm_pipelines
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_crm_pipelines ON crm_pipelines
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

-- CRM Stages Table
CREATE TABLE IF NOT EXISTS crm_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6366F1',
    order_index INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crm_stages_pipeline ON crm_stages(pipeline_id);

-- Enable RLS on crm_stages
ALTER TABLE crm_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_crm_stages ON crm_stages
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

-- CRM Cards Table (Kanban Items linked to Contact & Conversation)
CREATE TABLE IF NOT EXISTS crm_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES crm_stages(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, won, lost
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crm_cards_company ON crm_cards(company_id);
CREATE INDEX idx_crm_cards_stage ON crm_cards(stage_id);
CREATE INDEX idx_crm_cards_contact ON crm_cards(contact_id);

-- Enable RLS on crm_cards
ALTER TABLE crm_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_crm_cards ON crm_cards
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
