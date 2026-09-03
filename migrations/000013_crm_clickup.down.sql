DROP TABLE IF EXISTS crm_card_tags;
DROP TABLE IF EXISTS crm_card_subtasks;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS position;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS assignee_id;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS due_date;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS priority;
DROP TABLE IF EXISTS crm_custom_fields;
