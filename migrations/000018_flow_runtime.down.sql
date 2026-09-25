DROP INDEX IF EXISTS uq_flow_executions_active_conversation;
DROP INDEX IF EXISTS idx_flow_executions_flow;
DROP INDEX IF EXISTS idx_flow_executions_due;
ALTER TABLE flow_executions DROP COLUMN IF EXISTS trigger_event;
ALTER TABLE flow_executions DROP COLUMN IF EXISTS last_error;
ALTER TABLE flow_executions DROP COLUMN IF EXISTS resume_at;
