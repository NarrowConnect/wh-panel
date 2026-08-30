-- Templates Table
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'UTILITY', -- MARKETING, UTILITY, AUTHENTICATION
    language VARCHAR(20) NOT NULL DEFAULT 'pt_BR',
    components_json JSONB NOT NULL DEFAULT '[]'::jsonb, -- Header, Body, Footer, Buttons
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, pending, approved, rejected
    meta_template_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_templates_company_name UNIQUE (company_id, name, language)
);

CREATE INDEX idx_templates_company_id ON templates(company_id);
CREATE INDEX idx_templates_status ON templates(company_id, status);

-- Enable RLS on templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_templates ON templates
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
