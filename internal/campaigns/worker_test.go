package campaigns

import (
	"context"
	"io"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/meta"
)

type testTransport func(*http.Request) (*http.Response, error)

func (f testTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCampaignRejectsMissingRuntimeParameters(t *testing.T) {
	for _, raw := range []string{`[{"type":"BODY","text":"Olá {{1}}"}]`, `[{"type":"BODY","text":"Olá"},{"type":"HEADER","format":"IMAGE"}]`, `[{"type":"BODY","text":"Olá"},{"type":"BUTTONS","buttons":[{"type":"URL","url":"https://example.com/{{1}}"}]}]`} {
		if validateCampaignComponents(raw) == nil {
			t.Fatalf("unsupported template accepted: %s", raw)
		}
	}
	if err := validateCampaignComponents(`[{"type":"BODY","text":"Olá"}]`); err != nil {
		t.Fatal(err)
	}
}

func TestCampaignOnlyMarksSentAfterMetaAcceptance(t *testing.T) {
	for _, success := range []bool{true, false} {
		t.Run(map[bool]string{true: "accepted", false: "rejected"}[success], func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			company, campaign, recipient := uuid.New(), uuid.New(), uuid.New()
			secret := "test-secret"
			encrypted, err := crypto.EncryptAES(`{"access_token":"channel-token","phone_number_id":"444"}`, secret)
			if err != nil {
				t.Fatal(err)
			}
			d := NewDispatcher(sqlx.NewDb(db, "sqlmock"), nil)
			d.ConfigureMeta(meta.NewClient(meta.Config{}), secret)
			old := http.DefaultTransport
			defer func() { http.DefaultTransport = old }()
			calls := 0
			http.DefaultTransport = testTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.URL.Path != "/v26.0/444/messages" || r.Header.Get("Authorization") != "Bearer channel-token" {
					t.Fatal("wrong channel")
				}
				status, body := 200, `{"messages":[{"id":"wamid.test"}]}`
				if !success {
					status = 400
					body = `{"error":{"code":131026}}`
				}
				return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
			})
			mock.ExpectBegin()
			mock.ExpectQuery(`SELECT pg_try_advisory_xact_lock`).WithArgs(campaign.String()).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
			mock.ExpectQuery(`SELECT EXISTS`).WithArgs(campaign).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			mock.ExpectQuery(regexp.QuoteMeta(campaignConfigQuery)).WithArgs(campaign, company).WillReturnRows(sqlmock.NewRows([]string{"credentials_encrypted", "name", "language", "components_json", "rate_limit_per_minute"}).AddRow(encrypted, "hello", "pt_BR", `[{"type":"BODY","text":"Olá"}]`, 600))
			mock.ExpectQuery(`SELECT r.id,COALESCE`).WithArgs(campaign, company).WillReturnRows(sqlmock.NewRows([]string{"id", "phone"}).AddRow(recipient, "+55 (11) 99999-9999"))
			mock.ExpectQuery(`SELECT status FROM campaigns`).WithArgs(campaign, company).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("processing"))
			mock.ExpectExec(`UPDATE campaign_recipients SET status='processing'`).WithArgs(recipient).WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit()
			if success {
				mock.ExpectExec(`UPDATE campaign_recipients SET status='sent'`).WithArgs(recipient).WillReturnResult(sqlmock.NewResult(0, 1))
			} else {
				mock.ExpectExec(`UPDATE campaign_recipients SET status='failed'`).WithArgs(sqlmock.AnyArg(), recipient).WillReturnResult(sqlmock.NewResult(0, 1))
			}
			if err := d.dispatchRecipient(context.Background(), company, campaign); err != nil {
				t.Fatal(err)
			}
			if calls != 1 {
				t.Fatalf("expected one real request, got %d", calls)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
