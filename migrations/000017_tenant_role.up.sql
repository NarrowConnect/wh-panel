-- Restricted role used by tenant-scoped connections.
--
-- Superusers bypass Row Level Security even with FORCE, and the default Docker
-- setup connects as a superuser. Each authenticated request therefore runs
-- `SET ROLE wh_tenant` on its reserved connection (pkg/postgres/tenant.go):
-- a NOLOGIN, non-superuser role with plain table privileges, so the tenant
-- policies apply. The connection switches back with RESET ROLE before it
-- returns to the pool.
--
-- Hosts where the app user cannot create roles skip this block with a notice;
-- the API then detects the role is unavailable and relies on FORCE ROW LEVEL
-- SECURITY (000016), which covers non-superuser owners.
--
-- Idempotent: re-run on every start, which also grants access to tables
-- created by later migrations.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wh_tenant') THEN
        CREATE ROLE wh_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;

    EXECUTE 'GRANT USAGE ON SCHEMA public TO wh_tenant';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wh_tenant';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wh_tenant';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wh_tenant';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO wh_tenant';
    EXECUTE format('GRANT wh_tenant TO %I', current_user);
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'wh_tenant role not configured (%). RLS relies on FORCE ROW LEVEL SECURITY only.', SQLERRM;
END $$;
