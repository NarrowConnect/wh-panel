package auth

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestAuthPasswordHashing(t *testing.T) {
	jwtMgr := NewJWTManager("super-secret-jwt-key-32bytes-long", 24, 7, nil)

	password := "SenhaForte123@"
	hash, err := jwtMgr.HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	if !jwtMgr.CheckPassword(password, hash) {
		t.Fatalf("password should match hash")
	}

	if jwtMgr.CheckPassword("SenhaErrada", hash) {
		t.Fatalf("wrong password should not match hash")
	}
}

func TestAuthTokenGenerationAndValidation(t *testing.T) {
	jwtMgr := NewJWTManager("super-secret-jwt-key-32bytes-long", 24, 7, nil)

	userID := uuid.New()
	companyID := uuid.New()
	email := "admin@narrowconnect.com.br"
	role := "admin"

	access, refresh, expires, err := jwtMgr.GenerateTokens(userID, companyID, email, role)
	if err != nil {
		t.Fatalf("failed to generate tokens: %v", err)
	}

	if access == "" || refresh == "" || expires <= 0 {
		t.Fatalf("invalid token generation results")
	}

	claims, err := jwtMgr.ValidateToken(context.Background(), access)
	if err != nil {
		t.Fatalf("failed to validate access token: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected userID %s, got %s", userID, claims.UserID)
	}
	if claims.CompanyID != companyID {
		t.Errorf("expected companyID %s, got %s", companyID, claims.CompanyID)
	}
	if claims.Email != email {
		t.Errorf("expected email %s, got %s", email, claims.Email)
	}
	if claims.Role != role {
		t.Errorf("expected role %s, got %s", role, claims.Role)
	}
}

func TestEmailAndSlugNormalization(t *testing.T) {
	rawEmail := "  Usuario.Admin@NarrowConnect.COM.br  "
	normalizedEmail := strings.ToLower(strings.TrimSpace(rawEmail))
	expectedEmail := "usuario.admin@narrowconnect.com.br"

	if normalizedEmail != expectedEmail {
		t.Errorf("expected %s, got %s", expectedEmail, normalizedEmail)
	}

	rawSlug := "  Minha-Empresa-Tech  "
	normalizedSlug := strings.ToLower(strings.TrimSpace(rawSlug))
	expectedSlug := "minha-empresa-tech"

	if normalizedSlug != expectedSlug {
		t.Errorf("expected %s, got %s", expectedSlug, normalizedSlug)
	}
}
