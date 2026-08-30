-- External Integrations Table
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'rest_api', -- rest_api, custom_script, n8n_make
    endpoint_url TEXT NOT NULL,
    auth_headers_encrypted TEXT, -- Encrypted JSON string of custom HTTP headers/tokens
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integrations_company ON integrations(company_id);

-- Enable RLS on integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_integrations ON integrations
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

-- Event Webhooks Table (Outbound Event Notification Subscriptions)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- conversation_created, message_received, crm_stage_changed, contact_created
    target_url TEXT NOT NULL,
    secret_token VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_company ON webhooks(company_id);
CREATE INDEX idx_webhooks_event ON webhooks(company_id, event_type);

-- Enable RLS on webhooks
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_webhooks ON webhooks
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
