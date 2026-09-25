package conversations

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"wh-panel/internal/models"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/meta"
)

type outboundTransport func(*http.Request) (*http.Response, error)

func (f outboundTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestOutboundMetaUsesValidContextAndEnforcesWindow(t *testing.T) {
	for _, window := range []string{"open", "expired", "missing"} {
		t.Run(window, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			company, conv, channel, msg := uuid.New(), uuid.New(), uuid.New(), uuid.New()
			secret := "test-secret"
			encrypted, err := crypto.EncryptAES(`{"phone_number_id":"444","access_token":"token"}`, secret)
			if err != nil {
				t.Fatal(err)
			}
			h := NewHandler(sqlx.NewDb(db, "sqlmock"), nil, nil, meta.NewClient(meta.Config{}), nil, secret)
			mock.ExpectQuery(`SELECT phone FROM contacts.*conv.company_id=\$2 AND c.company_id=\$2`).WithArgs(conv, company).WillReturnRows(sqlmock.NewRows([]string{"phone"}).AddRow("+55 (11) 99999-9999"))
			mock.ExpectQuery(`SELECT id, type, credentials_encrypted, config_json FROM channels WHERE company_id=\$2`).WithArgs(conv, company).WillReturnRows(sqlmock.NewRows([]string{"id", "type", "credentials_encrypted", "config_json"}).AddRow(channel, "whatsapp_meta", encrypted, "{}"))
			rows := sqlmock.NewRows([]string{"created_at"})
			if window == "open" {
				rows.AddRow(time.Now().Add(-time.Hour))
			}
			if window == "expired" {
				rows.AddRow(time.Now().Add(-25 * time.Hour))
			}
			mock.ExpectQuery(`SELECT created_at FROM messages`).WithArgs(conv).WillReturnRows(rows)
			expectedStatus := "failed"
			if window == "open" {
				expectedStatus = "sent"
			}
			mock.ExpectExec(`UPDATE messages SET status=\$1 WHERE id=\$2 AND company_id=\$3`).WithArgs(expectedStatus, msg, company).WillReturnResult(sqlmock.NewResult(0, 1))
			old := http.DefaultTransport
			defer func() { http.DefaultTransport = old }()
			calls := 0
			http.DefaultTransport = outboundTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.Context() == nil {
					t.Fatal("nil context")
				}
				b, _ := io.ReadAll(r.Body)
				if !strings.Contains(string(b), `"to":"5511999999999"`) {
					t.Fatal("phone not normalized")
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"messages":[{"id":"wamid.test"}]}`)), Header: make(http.Header)}, nil
			})
			h.dispatchOutbound(company, conv, models.Message{ID: msg, Body: "Olá"})
			if (window == "open" && calls != 1) || (window != "open" && calls != 0) {
				t.Fatalf("unexpected number of sends: %d", calls)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
