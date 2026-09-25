package postgres

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// Runs against a migrated database (start the API once against it), e.g.
// WH_TEST_DATABASE_URL="postgres://wh_user:wh_password@localhost:55432/wh_panel_db?sslmode=disable"
func openTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	url := os.Getenv("WH_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("WH_TEST_DATABASE_URL not set")
	}
	db, err := sqlx.Connect("postgres", url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	// One connection: the connection released by a tenant request is the one
	// the next query gets, so leaks would show up.
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return db
}

func TestTenantIsolation(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	t.Log(ConfigureTenantRole(ctx, db))
	if !tenantRoleEnabled.Load() {
		var super bool
		_ = db.GetContext(ctx, &super, `SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)
		if super {
			t.Fatal("database user is a superuser and role wh_tenant is unavailable: RLS would not apply")
		}
	}

	companyA, companyB := uuid.New(), uuid.New()
	contactA, contactB := uuid.New(), uuid.New()
	for _, c := range []uuid.UUID{companyA, companyB} {
		if _, err := db.ExecContext(ctx, `INSERT INTO companies (id, name, slug) VALUES ($1, 'rls test', $2)`, c, "rls-"+c.String()); err != nil {
			t.Fatalf("create company: %v", err)
		}
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(context.Background(), `DELETE FROM contacts WHERE company_id IN ($1, $2)`, companyA, companyB)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM companies WHERE id IN ($1, $2)`, companyA, companyB)
	})
	if _, err := db.ExecContext(ctx, `INSERT INTO contacts (id, company_id, name) VALUES ($1, $2, 'A'), ($3, $4, 'B')`, contactA, companyA, contactB, companyB); err != nil {
		t.Fatalf("create contacts: %v", err)
	}

	w := Wrap(db)
	tc, err := w.BindTenant(ctx, companyA.String())
	if err != nil {
		t.Fatalf("bind tenant: %v", err)
	}
	tctx := WithTenantConn(ctx, tc)

	// No company_id filter on purpose: the database must apply it.
	var visible int
	if err := w.GetContext(tctx, &visible, `SELECT COUNT(*) FROM contacts WHERE id IN ($1, $2)`, contactA, contactB); err != nil {
		t.Fatalf("select: %v", err)
	}
	if visible != 1 {
		t.Errorf("company A sees %d of the two contacts, want 1", visible)
	}

	res, err := w.ExecContext(tctx, `UPDATE contacts SET name = 'hijacked' WHERE id = $1`, contactB)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if n, _ := res.RowsAffected(); n != 0 {
		t.Errorf("company A updated %d rows of company B", n)
	}

	if _, err := w.ExecContext(tctx, `INSERT INTO contacts (id, company_id, name) VALUES ($1, $2, 'planted')`, uuid.New(), companyB); err == nil {
		t.Error("company A inserted a contact into company B")
	}

	// Transactions opened with the request context stay on the scoped connection.
	tx, err := w.BeginTxx(tctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	var inTx int
	if err := tx.GetContext(tctx, &inTx, `SELECT COUNT(*) FROM contacts WHERE id IN ($1, $2)`, contactA, contactB); err != nil {
		t.Fatalf("select in tx: %v", err)
	}
	_ = tx.Rollback()
	if inTx != 1 {
		t.Errorf("transaction sees %d contacts, want 1", inTx)
	}

	tc.Release()

	// The same physical connection is back in the pool without tenant or role.
	var st struct {
		Setting string `db:"setting"`
		Role    string `db:"role"`
	}
	if err := db.GetContext(ctx, &st, `SELECT COALESCE(current_setting('app.current_company_id', true), '') AS setting, current_user AS role`); err != nil {
		t.Fatalf("pool check: %v", err)
	}
	if st.Setting != "" || st.Role == TenantRole {
		t.Errorf("connection returned to the pool still scoped: setting=%q role=%q", st.Setting, st.Role)
	}
	var both int
	if err := db.GetContext(ctx, &both, `SELECT COUNT(*) FROM contacts WHERE id IN ($1, $2)`, contactA, contactB); err != nil {
		t.Fatalf("unscoped select: %v", err)
	}
	if both != 2 {
		t.Errorf("unscoped work (webhooks, workers) sees %d contacts, want 2", both)
	}
}
