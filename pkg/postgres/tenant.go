package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"log"
	"sync/atomic"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// Row Level Security on a connection pool
//
// The RLS policies compare company_id with the session setting
// app.current_company_id. A session setting lives on one physical connection,
// so setting it through the pool would land on an arbitrary connection. Instead
// each authenticated request reserves one connection (BindTenant), sets the
// company on it, and every query made with that request's context runs there.
// Release clears the setting before the connection returns to the pool and
// discards the connection if it cannot be cleared.
//
// Work without a tenant (webhooks, workers, auth) runs on the pool with the
// setting empty, which the policies treat as "no restriction"; those paths keep
// their explicit company_id filters.

type tenantConnKey struct{}

// TenantRole is the restricted role created by migration 000017.
const TenantRole = "wh_tenant"

// tenantRoleEnabled is set once at startup by ConfigureTenantRole.
var tenantRoleEnabled atomic.Bool

// ConfigureTenantRole checks whether the connected user can switch to the
// restricted tenant role. Superusers bypass RLS, so without the role the
// policies only hold when the app user is a plain (non-superuser) owner.
// It returns a human-readable description of the mode in effect.
func ConfigureTenantRole(ctx context.Context, db *sqlx.DB) string {
	var st struct {
		Super   bool `db:"super"`
		HasRole bool `db:"has_role"`
	}
	err := db.GetContext(ctx, &st, `SELECT
		(SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super,
		EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
			AND pg_has_role(current_user, (SELECT oid FROM pg_roles WHERE rolname = $1), 'MEMBER') AS has_role`, TenantRole)
	if err != nil {
		tenantRoleEnabled.Store(false)
		return fmt.Sprintf("RLS mode unknown (%v)", err)
	}
	tenantRoleEnabled.Store(st.HasRole)
	switch {
	case st.HasRole:
		return "RLS enforced: tenant requests run as role " + TenantRole
	case st.Super:
		return "WARNING: RLS NOT enforced: the database user is a superuser and role " + TenantRole + " is unavailable; isolation relies on company_id filters"
	default:
		return "RLS enforced through FORCE ROW LEVEL SECURITY (non-superuser owner)"
	}
}

// DB wraps *sqlx.DB so the context-aware query methods use the request's
// tenant connection when there is one. Methods without a context, and
// Beginx, still go straight to the pool.
type DB struct {
	*sqlx.DB
}

// Wrap adapts a pool for tenant-aware use. Wrapping is cheap and stateless.
func Wrap(db *sqlx.DB) *DB {
	if db == nil {
		return nil
	}
	return &DB{DB: db}
}

// TenantConn is a pooled connection bound to one company for one request.
type TenantConn struct {
	conn *sqlx.Conn
}

// BindTenant reserves a connection and scopes it to companyID.
func (d *DB) BindTenant(ctx context.Context, companyID string) (*TenantConn, error) {
	if companyID == "" {
		return nil, errors.New("tenant: empty company id")
	}
	conn, err := d.DB.Connx(ctx)
	if err != nil {
		return nil, fmt.Errorf("tenant: reserve connection: %w", err)
	}
	if _, err := conn.ExecContext(ctx, `SELECT set_config('app.current_company_id', $1, false)`, companyID); err != nil {
		discard(conn)
		return nil, fmt.Errorf("tenant: set company: %w", err)
	}
	if tenantRoleEnabled.Load() {
		if _, err := conn.ExecContext(ctx, "SET ROLE "+pq.QuoteIdentifier(TenantRole)); err != nil {
			discard(conn)
			return nil, fmt.Errorf("tenant: switch role: %w", err)
		}
	}
	return &TenantConn{conn: conn}, nil
}

// Release clears the tenant and returns the connection to the pool. It uses a
// fresh context because the request context may already be cancelled.
func (t *TenantConn) Release() {
	if t == nil || t.conn == nil {
		return
	}
	ctx := context.Background()
	_, err := t.conn.ExecContext(ctx, "RESET ROLE")
	if err == nil {
		_, err = t.conn.ExecContext(ctx, `SELECT set_config('app.current_company_id', '', false)`)
	}
	if err != nil {
		log.Printf("[postgres] could not clear tenant on connection, discarding it: %v", err)
		discard(t.conn)
		t.conn = nil
		return
	}
	_ = t.conn.Close()
	t.conn = nil
}

// discard makes database/sql drop the connection instead of pooling it, so a
// connection with an unknown tenant setting is never reused.
func discard(conn *sqlx.Conn) {
	_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	_ = conn.Close()
}

// WithTenantConn attaches the tenant connection to a context.
func WithTenantConn(ctx context.Context, t *TenantConn) context.Context {
	return context.WithValue(ctx, tenantConnKey{}, t)
}

// queryExecer is what both *sqlx.DB and *sqlx.Conn provide.
type queryExecer interface {
	sqlx.QueryerContext
	sqlx.ExecerContext
}

func (d *DB) ext(ctx context.Context) queryExecer {
	if t, ok := ctx.Value(tenantConnKey{}).(*TenantConn); ok && t != nil && t.conn != nil {
		return t.conn
	}
	return d.DB
}

func (d *DB) GetContext(ctx context.Context, dest any, query string, args ...any) error {
	return sqlx.GetContext(ctx, d.ext(ctx), dest, query, args...)
}

func (d *DB) SelectContext(ctx context.Context, dest any, query string, args ...any) error {
	return sqlx.SelectContext(ctx, d.ext(ctx), dest, query, args...)
}

func (d *DB) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return d.ext(ctx).ExecContext(ctx, query, args...)
}

func (d *DB) QueryxContext(ctx context.Context, query string, args ...any) (*sqlx.Rows, error) {
	return d.ext(ctx).QueryxContext(ctx, query, args...)
}

func (d *DB) QueryRowxContext(ctx context.Context, query string, args ...any) *sqlx.Row {
	return d.ext(ctx).QueryRowxContext(ctx, query, args...)
}

// BeginTxx starts the transaction on the tenant connection when the context
// has one, so the transaction is covered by RLS and does not take a second
// connection from the pool.
func (d *DB) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	if t, ok := ctx.Value(tenantConnKey{}).(*TenantConn); ok && t != nil && t.conn != nil {
		return t.conn.BeginTxx(ctx, opts)
	}
	return d.DB.BeginTxx(ctx, opts)
}
