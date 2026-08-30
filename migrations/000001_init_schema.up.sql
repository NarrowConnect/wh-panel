-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Roles
INSERT INTO roles (name, description, permissions) VALUES
    ('admin', 'Administrador da Empresa', '["*"]'::jsonb),
    ('supervisor', 'Supervisor de Atendimento', '["conversations.*", "reports.*", "users.read", "contacts.*"]'::jsonb),
    ('attendant', 'Atendente / Operador', '["conversations.read", "conversations.reply", "contacts.read"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'attendant',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_email_company UNIQUE (email, company_id)
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);

-- Enable Row Level Security (RLS) on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create RLS Policy for Tenant Isolation
-- Allows access if app.current_company_id matches company_id OR if app.current_company_id is empty/bypass mode
CREATE POLICY tenant_isolation_users ON users
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
