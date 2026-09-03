DROP TABLE IF EXISTS crm_card_history;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS custom_values;
ALTER TABLE crm_cards DROP COLUMN IF EXISTS description;
DROP INDEX IF EXISTS uk_crm_pipelines_single_default;
