package models

type DashboardKPIs struct {
	TotalConversations int     `json:"total_conversations"`
	OpenConversations  int     `json:"open_conversations"`
	PendingConversations int   `json:"pending_conversations"`
	ResolvedConversations int  `json:"resolved_conversations"`
	AvgFirstResponseMinutes float64 `json:"avg_first_response_minutes"`
	AvgResolutionMinutes    float64 `json:"avg_resolution_minutes"`
	OverallSentimentScore   float64 `json:"overall_sentiment_score"`
}

type ChannelVolumeMetric struct {
	ChannelID   string `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	ChannelType string `json:"channel_type"`
	TotalCount  int    `json:"total_count"`
}

type AttendantPerformanceMetric struct {
	UserID               string  `json:"user_id"`
	UserName             string  `json:"user_name"`
	UserEmail            string  `json:"user_email"`
	AssignedCount        int     `json:"assigned_count"`
	ResolvedCount        int     `json:"resolved_count"`
	AvgFirstResponseMins float64 `json:"avg_first_response_mins"`
	AvgResolutionMins    float64 `json:"avg_resolution_mins"`
}

type SentimentAnalysisMetric struct {
	PositiveCount int     `json:"positive_count"`
	NeutralCount  int     `json:"neutral_count"`
	NegativeCount int     `json:"negative_count"`
	AvgScore      float64 `json:"avg_score"`
}

type StatusFunnelMetric struct {
	Status string `json:"status"`
	Count  int    `json:"count"`
}
