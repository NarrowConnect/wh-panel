package channels

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/fiber/v2"
	"github.com/jmoiron/sqlx"
	"wh-panel/pkg/meta"
)

func TestMetaWebhooksRejectUnsignedRequests(t *testing.T) {
	h := NewHandler(nil, "", meta.NewClient(meta.Config{AppSecret: "secret"}), nil)
	app := fiber.New()
	h.RegisterPublicRoutes(app)
	for _, path := range []string{"/webhooks/meta", "/webhooks/meta/any-channel", "/webhooks/whatsapp_meta/not-a-uuid"} {
		req := httptest.NewRequest("POST", path, strings.NewReader(`{"phone":"5511999999999"}`))
		req.Header.Set("Content-Type", "application/json")
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 401 {
			t.Fatalf("%s: expected 401, got %d", path, res.StatusCode)
		}
	}
}

func TestUnknownMetaPhoneCannotFallBackToAnotherTenant(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewHandler(sqlx.NewDb(db, "sqlmock"), "", nil, nil)
	mock.ExpectQuery(`SELECT MIN\(company_id::text\)::uuid.*HAVING COUNT\(DISTINCT company_id\)=1`).WithArgs("999").WillReturnRows(sqlmock.NewRows([]string{"company_id"}))
	var payload map[string]interface{}
	json.Unmarshal([]byte(`{"entry":[{"id":"222","changes":[{"value":{"metadata":{"phone_number_id":"999"},"contacts":[{"wa_id":"5511999999999"}]}}]}]}`), &payload)
	h.processMetaEvent(context.Background(), payload)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTemplateWebhookScopesExactIDLanguageAndWaba(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewHandler(sqlx.NewDb(db, "sqlmock"), "", meta.NewClient(meta.Config{AppSecret: "secret"}), nil)
	app := fiber.New()
	h.RegisterPublicRoutes(app)
	mock.ExpectExec(`UPDATE templates t.*t.meta_template_id=\$2 AND t.language=\$3.*ch.company_id=t.company_id.*waba_id.*\$4`).WithArgs("approved", "9007199254740993", "pt_BR", "222").WillReturnResult(sqlmock.NewResult(0, 1))
	body := `{"entry":[{"id":"222","changes":[{"field":"message_template_status_update","value":{"message_template_id":9007199254740993,"message_template_name":"hello_world","message_template_language":"pt_BR","event":"APPROVED"}}]}]}`
	mac := hmac.New(sha256.New, []byte("secret"))
	mac.Write([]byte(body))
	req := httptest.NewRequest("POST", "/webhooks/meta", strings.NewReader(body))
	req.Header.Set("X-Hub-Signature-256", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
