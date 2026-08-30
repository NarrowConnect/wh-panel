-- Queues Table
CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
    allocation_strategy VARCHAR(50) NOT NULL DEFAULT 'round_robin', -- round_robin, least_busy, manual
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queues_company_id ON queues(company_id);

-- Enable RLS on queues
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_queues ON queues
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

-- Queue Users Join Table (Operators assigned to a queue with specific queue roles)
CREATE TABLE IF NOT EXISTS queue_users (
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    queue_role VARCHAR(50) NOT NULL DEFAULT 'operator', -- leader, supervisor, operator
    PRIMARY KEY (queue_id, user_id)
);

CREATE INDEX idx_queue_users_queue ON queue_users(queue_id);
CREATE INDEX idx_queue_users_user ON queue_users(user_id);

-- Enable RLS on queue_users
ALTER TABLE queue_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_queue_users ON queue_users
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

-- Queue Rules Table for Automatic Routing & Triage
CREATE TABLE IF NOT EXISTS queue_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    priority INT NOT NULL DEFAULT 1,
    condition_type VARCHAR(50) NOT NULL, -- tag, channel, custom_field, lead_type
    condition_key VARCHAR(100),
    condition_operator VARCHAR(50) NOT NULL DEFAULT 'equals', -- equals, contains, in
    condition_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_rules_company ON queue_rules(company_id);
CREATE INDEX idx_queue_rules_queue ON queue_rules(queue_id);

-- Enable RLS on queue_rules
ALTER TABLE queue_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_queue_rules ON queue_rules
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
