-- Flow runtime: persistent waits, error reporting and one active bot per conversation.
ALTER TABLE flow_executions ADD COLUMN IF NOT EXISTS resume_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE flow_executions ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE flow_executions ADD COLUMN IF NOT EXISTS trigger_event VARCHAR(50);

-- Executions stuck in states the engine no longer uses would block the unique
-- index below; close them.
UPDATE flow_executions SET status = 'completed', updated_at = CURRENT_TIMESTAMP
WHERE status IN ('waiting', 'error');

-- The scheduler picks due waits by (status, resume_at).
CREATE INDEX IF NOT EXISTS idx_flow_executions_due
    ON flow_executions (status, resume_at)
    WHERE status IN ('waiting_input', 'waiting_delay');

CREATE INDEX IF NOT EXISTS idx_flow_executions_flow
    ON flow_executions (flow_id, created_at DESC);

-- Two inbound messages arriving together must not start two bots on the same
-- conversation: inserts use ON CONFLICT DO NOTHING against this index.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_flow_executions_active_conversation') THEN
        -- Keep only the newest active execution per conversation before indexing.
        UPDATE flow_executions f SET status = 'cancelled', last_error = 'Encerrada: outra automação ativa na mesma conversa'
        WHERE status IN ('running', 'waiting_input', 'waiting_delay')
          AND EXISTS (
              SELECT 1 FROM flow_executions g
              WHERE g.conversation_id = f.conversation_id
                AND g.status IN ('running', 'waiting_input', 'waiting_delay')
                AND g.created_at > f.created_at
          );
        CREATE UNIQUE INDEX uq_flow_executions_active_conversation
            ON flow_executions (conversation_id)
            WHERE status IN ('running', 'waiting_input', 'waiting_delay');
    END IF;
END $$;
