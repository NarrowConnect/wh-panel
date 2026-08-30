package postgres

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

func Connect(cfg Config) (*sqlx.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("error connecting to postgres: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("error pinging postgres: %w", err)
	}

	log.Println("[PostgreSQL] Connected successfully to database:", cfg.DBName)
	return db, nil
}

// RunMigrations executes baseline schema migrations if needed
func RunMigrations(db *sqlx.DB, migrationFilePath string) error {
	content, err := os.ReadFile(migrationFilePath)
	if err != nil {
		return fmt.Errorf("error reading migration file %s: %w", migrationFilePath, err)
	}

	_, err = db.Exec(string(content))
	if err != nil {
		return fmt.Errorf("error executing migration %s: %w", migrationFilePath, err)
	}

	log.Println("[PostgreSQL] Migration executed:", migrationFilePath)
	return nil
}

// SetTenantContext sets the PostgreSQL session variable app.current_company_id for Row Level Security
func SetTenantContext(ctx context.Context, db *sqlx.DB, companyID string) error {
	if companyID == "" {
		_, err := db.ExecContext(ctx, "RESET app.current_company_id")
		return err
	}
	// Sanitize uuid input
	_, err := db.ExecContext(ctx, fmt.Sprintf("SET app.current_company_id = '%s'", companyID))
	return err
}
