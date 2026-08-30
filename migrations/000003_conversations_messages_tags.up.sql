-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    queue_id UUID, -- References queues table (created in phase 4)
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, pending, resolved
    unread_count INT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_company_id ON conversations(company_id);
CREATE INDEX idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX idx_conversations_assigned_user ON conversations(assigned_user_id);
CREATE INDEX idx_conversations_status ON conversations(company_id, status);

-- Enable RLS on conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_conversations ON conversations
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

-- Messages Table (Includes is_internal for Whisper notes)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- contact, user, system, bot
    sender_id UUID,
    body TEXT NOT NULL,
    media_url TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = Whisper note (internal operator note, never sent externally)
    status VARCHAR(50) NOT NULL DEFAULT 'sent', -- sent, delivered, read, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_company_id ON messages(company_id);
CREATE INDEX idx_messages_created_at ON messages(conversation_id, created_at DESC);

-- Enable RLS on messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_messages ON messages
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

-- Tags Table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6366F1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_tag_company_name UNIQUE (company_id, name)
);

CREATE INDEX idx_tags_company_id ON tags(company_id);

-- Enable RLS on tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tags ON tags
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

-- Conversation Tags Join Table
CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, tag_id)
);

CREATE INDEX idx_conversation_tags_conversation ON conversation_tags(conversation_id);
