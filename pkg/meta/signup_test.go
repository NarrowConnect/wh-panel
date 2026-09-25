package meta

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func jsonResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}

func signupClient(t *testing.T, failPath string) *Client {
	t.Helper()
	c := NewClient(Config{AppID: "123", AppSecret: "secret"})
	c.httpClient.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		path := strings.TrimPrefix(r.URL.Path, "/v26.0/")
		if path == failPath {
			return jsonResponse(400, `{"error":{"code":100}}`), nil
		}
		switch path {
		case "oauth/access_token":
			if r.URL.Query().Get("code") != "a+b&c" {
				t.Errorf("code was not URL encoded")
			}
			return jsonResponse(200, `{"access_token":"customer-token"}`), nil
		case "debug_token":
			return jsonResponse(200, `{"data":{"app_id":"123","is_valid":true,"granular_scopes":[{"scope":"whatsapp_business_management","target_ids":["111","222"]}]}}`), nil
		case "222/phone_numbers":
			return jsonResponse(200, `{"data":[{"id":"333","display_phone_number":"first"},{"id":"444","display_phone_number":"selected","quality_rating":"YELLOW"}]}`), nil
		case "444/register", "222/subscribed_apps":
			if r.Header.Get("Authorization") != "Bearer customer-token" {
				t.Error("wrong token")
			}
			return jsonResponse(200, `{"success":true}`), nil
		default:
			t.Fatalf("unexpected request: %s", path)
			return nil, nil
		}
	})
	return c
}

func TestSignupUsesSelectedAssets(t *testing.T) {
	c := signupClient(t, "")
	res, err := c.ExchangeEmbeddedSignupCode(context.Background(), "a+b&c", "222", "444")
	if err != nil {
		t.Fatal(err)
	}
	if res.PhoneID != "444" || res.WabaID != "222" || res.PhoneNumber != "selected" || res.Quality != "YELLOW" {
		t.Fatalf("wrong asset selected: %+v", res)
	}
	if err := c.ActivateEmbeddedSignup(context.Background(), res, "123456"); err != nil {
		t.Fatal(err)
	}
}

func TestSignupRejectsUnrelatedAssets(t *testing.T) {
	for _, assets := range [][2]string{{"999", "444"}, {"222", "999"}, {"", ""}} {
		c := signupClient(t, "")
		if _, err := c.ExchangeEmbeddedSignupCode(context.Background(), "a+b&c", assets[0], assets[1]); err == nil {
			t.Fatal("unrelated/missing assets accepted")
		}
	}
}

func TestSignupDoesNotHideGraphFailures(t *testing.T) {
	for _, path := range []string{"oauth/access_token", "debug_token", "222/phone_numbers", "444/register", "222/subscribed_apps"} {
		t.Run(path, func(t *testing.T) {
			c := signupClient(t, path)
			res, err := c.ExchangeEmbeddedSignupCode(context.Background(), "a+b&c", "222", "444")
			if err == nil {
				err = c.ActivateEmbeddedSignup(context.Background(), res, "123456")
			}
			if err == nil {
				t.Fatal("Graph error was ignored")
			}
			if strings.Contains(err.Error(), "secret") || strings.Contains(err.Error(), "customer-token") {
				t.Fatal("secret leaked")
			}
		})
	}
}

func TestTextSendAndTemplateSubmissionRequireRealConfirmation(t *testing.T) {
	c := NewClient(Config{})
	calls := 0
	c.httpClient.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(200, `{"messages":[{"id":"wamid.test"}]}`), nil
	})
	if _, err := c.SendTextMessage(context.Background(), "444", "token", "5511999999999", "hello"); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("message did not reach transport")
	}
	if _, err := c.SendTextMessage(context.Background(), "444", "", "5511999999999", "hello"); err == nil {
		t.Fatal("missing channel token accepted")
	}
	c.httpClient.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { return jsonResponse(200, `{}`), nil })
	if _, err := c.SendTextMessage(context.Background(), "444", "token", "5511999999999", "hello"); err == nil {
		t.Fatal("empty send response accepted")
	}
	if _, err := c.SubmitTemplate(context.Background(), "222", "token", "test", "UTILITY", "pt_BR", nil); err == nil {
		t.Fatal("fabricated template ID")
	}
	if c.VerifyWebhookToken("") {
		t.Fatal("empty verify token accepted")
	}
}
