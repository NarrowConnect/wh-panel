package templates

import (
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"wh-panel/internal/tenant"
	"wh-panel/pkg/meta"
)

func TestSubmitWithoutCredentialsDoesNotFabricatePendingTemplate(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	company, id, channel := uuid.New(), uuid.New(), uuid.New()
	h := NewHandlerWithMeta(sqlx.NewDb(db, "sqlmock"), meta.NewClient(meta.Config{}), "secret")
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error { c.Locals(tenant.LocalCompanyIDKey, company.String()); return c.Next() })
	app.Post("/:id", h.SubmitToMeta)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, channel_id, name, category, language, components_json, status FROM templates WHERE id = $1 AND company_id = $2`)).WithArgs(id, company).WillReturnRows(sqlmock.NewRows([]string{"id", "channel_id", "name", "category", "language", "components_json", "status"}).AddRow(id, channel, "hello", "UTILITY", "pt_BR", `[{"type":"BODY","text":"Olá, tudo bem?"}]`, "draft"))
	mock.ExpectQuery(`SELECT credentials_encrypted, config_json FROM channels`).WithArgs(channel, company).WillReturnRows(sqlmock.NewRows([]string{"credentials_encrypted", "config_json"}).AddRow("", "{}"))
	res, err := app.Test(httptest.NewRequest("POST", "/"+id.String(), nil))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 502 {
		t.Fatalf("expected error, got %d", res.StatusCode)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
