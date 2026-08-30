package models

import "time"

type ConversationsReportFilter struct {
	StartDate   *time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
	ChannelID   *string    `json:"channel_id"`
	UserID      *string    `json:"user_id"`
	QueueID     *string    `json:"queue_id"`
	Status      *string    `json:"status"`
}

type ConversationReportItem struct {
	ConversationID    string    `json:"conversation_id" db:"conversation_id"`
	ContactName       string    `json:"contact_name" db:"contact_name"`
	ContactPhone      string    `json:"contact_phone" db:"contact_phone"`
	ChannelName       string    `json:"channel_name" db:"channel_name"`
	AttendantName     string    `json:"attendant_name" db:"attendant_name"`
	Status            string    `json:"status" db:"status"`
	FirstResponseMins float64   `json:"first_response_mins" db:"first_response_mins"`
	ResolutionMins    float64   `json:"resolution_mins" db:"resolution_mins"`
	SentimentScore    float64   `json:"sentiment_score" db:"sentiment_score"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
}
