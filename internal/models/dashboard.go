package models

type DashboardKPIs struct {
	TotalConversations      int     `json:"total_conversations"`
	OpenConversations       int     `json:"open_conversations"`
	PendingConversations    int     `json:"pending_conversations"`
	ResolvedConversations   int     `json:"resolved_conversations"`
	AvgFirstResponseMinutes float64 `json:"avg_first_response_minutes"`
	AvgResolutionMinutes    float64 `json:"avg_resolution_minutes"`
	OverallSentimentScore   float64 `json:"overall_sentiment_score"`
}

// db tags are required: these are filled with sqlx.Select, which maps
// columns by tag (or lowercased field name, which never matches snake_case).
type ChannelVolumeMetric struct {
	ChannelID   string `json:"channel_id" db:"channel_id"`
	ChannelName string `json:"channel_name" db:"channel_name"`
	ChannelType string `json:"channel_type" db:"channel_type"`
	TotalCount  int    `json:"total_count" db:"total_count"`
}

type AttendantPerformanceMetric struct {
	UserID               string  `json:"user_id" db:"user_id"`
	UserName             string  `json:"user_name" db:"user_name"`
	UserEmail            string  `json:"user_email" db:"user_email"`
	AssignedCount        int     `json:"assigned_count" db:"assigned_count"`
	ResolvedCount        int     `json:"resolved_count" db:"resolved_count"`
	AvgFirstResponseMins float64 `json:"avg_first_response_mins" db:"avg_first_response_mins"`
	AvgResolutionMins    float64 `json:"avg_resolution_mins" db:"avg_resolution_mins"`
}

type SentimentAnalysisMetric struct {
	PositiveCount int     `json:"positive_count" db:"positive_count"`
	NeutralCount  int     `json:"neutral_count" db:"neutral_count"`
	NegativeCount int     `json:"negative_count" db:"negative_count"`
	AvgScore      float64 `json:"avg_score" db:"avg_score"`
}

type StatusFunnelMetric struct {
	Status string `json:"status" db:"status"`
	Count  int    `json:"count" db:"count"`
}
