package models

import (
	"time"

	"github.com/google/uuid"
)

// Company represents a SaaS tenant
type Company struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Slug      string    `json:"slug" db:"slug"`
	Plan      string    `json:"plan" db:"plan"`
	Status    string    `json:"status" db:"status"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// User represents an operator/admin/supervisor in a tenant
type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	CompanyID    uuid.UUID `json:"company_id" db:"company_id"`
	Name         string    `json:"name" db:"name"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Role         string    `json:"role" db:"role"`
	Status       string    `json:"status" db:"status"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// Role represents user permissions
type Role struct {
	ID          uuid.UUID `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	Permissions string    `json:"permissions" db:"permissions"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// DTOs for HTTP requests and responses

type CreateCompanyRequest struct {
	Name       string `json:"name" validate:"required"`
	Slug       string `json:"slug" validate:"required"`
	Plan       string `json:"plan"`
	AdminName  string `json:"admin_name" validate:"required"`
	AdminEmail string `json:"admin_email" validate:"required,email"`
	Password   string `json:"password" validate:"required,min=6"`
}

type RegisterRequest struct {
	CompanyName string `json:"company_name"`
	CompanySlug string `json:"company_slug"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	AdminName   string `json:"admin_name"`
	Email       string `json:"email"`
	AdminEmail  string `json:"admin_email"`
	Password    string `json:"password"`
	Plan        string `json:"plan"`
}

type CreateUserRequest struct {
	Name     string `json:"name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
	Role     string `json:"role"`
}

type UpdateUserRequest struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

type LoginRequest struct {
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required"`
	CompanySlug string `json:"company_slug"` // Optional company context for multi-company users
}

type LoginResponse struct {
	AccessToken  string  `json:"access_token"`
	RefreshToken string  `json:"refresh_token"`
	ExpiresIn    int64   `json:"expires_in"`
	User         User    `json:"user"`
	Company      Company `json:"company"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type RefreshTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int64  `json:"expires_in"`
}
