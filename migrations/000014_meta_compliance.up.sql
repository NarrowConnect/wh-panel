-- Meta App Review / Business Verification compliance tracking
CREATE TABLE IF NOT EXISTS meta_compliance_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_key VARCHAR(100) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'permission', -- permission, verification
    status VARCHAR(30) NOT NULL DEFAULT 'not_started', -- not_started, in_review, approved, rejected
    use_case_text TEXT NOT NULL DEFAULT '',
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_meta_compliance_company_key UNIQUE (company_id, item_key)
);

CREATE INDEX idx_meta_compliance_company_id ON meta_compliance_items(company_id);

ALTER TABLE meta_compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_meta_compliance_items ON meta_compliance_items
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
