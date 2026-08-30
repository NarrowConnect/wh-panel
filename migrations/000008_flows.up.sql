-- Flows Table (Visual Flow Automations)
CREATE TABLE IF NOT EXISTS flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, active, inactive
    definition_json JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flows_company ON flows(company_id);
CREATE INDEX idx_flows_status ON flows(company_id, status);

-- Enable RLS on flows
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_flows ON flows
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

-- Flow Executions Table (Tracks running flow instances for conversations)
CREATE TABLE IF NOT EXISTS flow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    current_node_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- running, waiting, completed, failed
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flow_executions_company ON flow_executions(company_id);
CREATE INDEX idx_flow_executions_conv ON flow_executions(conversation_id);

-- Enable RLS on flow_executions
ALTER TABLE flow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_flow_executions ON flow_executions
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
