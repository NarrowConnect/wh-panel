package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"wh-panel/pkg/redis"
)

type JWTClaims struct {
	UserID    uuid.UUID `json:"user_id"`
	CompanyID uuid.UUID `json:"company_id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	TokenID   string    `json:"jti"`
	jwt.RegisteredClaims
}

type JWTManager struct {
	secretKey     []byte
	accessExp     time.Duration
	refreshExp    time.Duration
	redisClient   *redis.Client
}

func NewJWTManager(secret string, accessExpHours int, refreshExpDays int, redisClient *redis.Client) *JWTManager {
	return &JWTManager{
		secretKey:   []byte(secret),
		accessExp:   time.Duration(accessExpHours) * time.Hour,
		refreshExp:  time.Duration(refreshExpDays) * 24 * time.Hour,
		redisClient: redisClient,
	}
}

func (j *JWTManager) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func (j *JWTManager) CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func (j *JWTManager) GenerateTokens(userID, companyID uuid.UUID, email, role string) (string, string, int64, error) {
	tokenID := uuid.New().String()
	now := time.Now()
	expiresAt := now.Add(j.accessExp)

	claims := &JWTClaims{
		UserID:    userID,
		CompanyID: companyID,
		Email:     email,
		Role:      role,
		TokenID:   tokenID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   userID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err := token.SignedString(j.secretKey)
	if err != nil {
		return "", "", 0, fmt.Errorf("error signing access token: %w", err)
	}

	// Generate Refresh Token
	refreshClaims := &JWTClaims{
		UserID:    userID,
		CompanyID: companyID,
		TokenID:   uuid.New().String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(j.refreshExp)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   userID.String(),
		},
	}

	refreshTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err := refreshTokenObj.SignedString(j.secretKey)
	if err != nil {
		return "", "", 0, fmt.Errorf("error signing refresh token: %w", err)
	}

	return accessToken, refreshToken, expiresAt.Unix(), nil
}

func (j *JWTManager) ValidateToken(ctx context.Context, tokenStr string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secretKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	// Check Redis Blacklist
	if j.redisClient != nil && claims.TokenID != "" {
		blacklisted, err := j.redisClient.IsTokenBlacklisted(ctx, claims.TokenID)
		if err == nil && blacklisted {
			return nil, errors.New("token has been revoked")
		}
	}

	return claims, nil
}

func (j *JWTManager) RevokeToken(ctx context.Context, tokenID string, expiresAt time.Time) error {
	if j.redisClient == nil {
		return nil
	}
	remaining := time.Until(expiresAt)
	if remaining <= 0 {
		return nil
	}
	return j.redisClient.BlacklistToken(ctx, tokenID, remaining)
}
