-- Add response time and sentiment metrics columns to conversations and messages
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(3,2) DEFAULT 0.00; -- Range -1.00 to +1.00

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) DEFAULT 'neutral'; -- positive, neutral, negative
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(3,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_conversations_first_response ON conversations(company_id, first_response_at);
CREATE INDEX IF NOT EXISTS idx_conversations_resolved_at ON conversations(company_id, resolved_at);
