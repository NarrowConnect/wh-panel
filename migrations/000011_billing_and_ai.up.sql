-- Billing Plans Table
CREATE TABLE IF NOT EXISTS billing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    max_users INT NOT NULL DEFAULT 5,
    max_contacts INT NOT NULL DEFAULT 1000,
    max_channels INT NOT NULL DEFAULT 2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default SaaS Plans
INSERT INTO billing_plans (name, slug, price_monthly, max_users, max_contacts, max_channels) VALUES
    ('Starter', 'starter', 99.00, 3, 1000, 2),
    ('Pro', 'pro', 299.00, 10, 10000, 5),
    ('Enterprise', 'enterprise', 799.00, 50, 100000, 20)
ON CONFLICT (slug) DO NOTHING;

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, past_due, canceled
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_company_subscription UNIQUE (company_id)
);

CREATE INDEX idx_subscriptions_company ON subscriptions(company_id);

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_subscriptions ON subscriptions
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

-- AI Providers Config Table (Stores OpenAI/Anthropic/DeepSeek API keys per tenant)
CREATE TABLE IF NOT EXISTS ai_providers_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- openai, anthropic, deepseek
    api_key_encrypted TEXT NOT NULL,
    model_name VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_company_ai_provider UNIQUE (company_id, provider)
);

CREATE INDEX idx_ai_providers_company ON ai_providers_config(company_id);

-- Enable RLS on ai_providers_config
ALTER TABLE ai_providers_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_providers ON ai_providers_config
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
