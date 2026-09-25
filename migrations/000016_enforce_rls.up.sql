-- Enforce Row Level Security for every tenant table.
--
-- The API connects as the owner of these tables, and owners bypass RLS unless
-- FORCE is set, so the policies from earlier migrations never applied. Each
-- authenticated request now runs on a connection with app.current_company_id
-- set (pkg/postgres/tenant.go); with FORCE the database itself rejects rows
-- of other companies even if a query forgets its company_id filter.
--
-- Webhooks, workers and signup run without the setting, which the policies
-- treat as unrestricted; they keep their explicit company_id filters.
--
-- Idempotent: every table with a company_id column gets RLS enabled, forced,
-- and the standard tenant policy when it does not have one yet.
DO $$
DECLARE
    t record;
    policy_name text;
BEGIN
    FOR t IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb
          ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.column_name = 'company_id'
          AND tb.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);

        policy_name := 'tenant_isolation_' || t.table_name;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t.table_name AND policyname = policy_name
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (
                    current_setting(''app.current_company_id'', true) IS NULL
                    OR current_setting(''app.current_company_id'', true) = ''''
                    OR company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid
                )',
                policy_name, t.table_name
            );
        END IF;
    END LOOP;
END $$;
