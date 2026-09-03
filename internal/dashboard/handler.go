package dashboard

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
)

type Handler struct {
	db *sqlx.DB
}

func NewHandler(db *sqlx.DB) *Handler {
	return &Handler{db: db}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	dash := router.Group("/dashboard")
	dash.Get("/kpis", h.GetKPIs)
	dash.Get("/channels-volume", h.GetChannelVolume)
	dash.Get("/attendants-performance", h.GetAttendantsPerformance)
	dash.Get("/sentiment-analysis", h.GetSentimentAnalysis)
	dash.Get("/funnel", h.GetStatusFunnel)
}

func parseDateRange(c *fiber.Ctx) (string, []interface{}, int) {
	return parseDashboardFilters(c, "created_at")
}

func parseDashboardFilters(c *fiber.Ctx, dateColumn string) (string, []interface{}, int) {
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")
	queueID := c.Query("queue_id")
	channelID := c.Query("channel_id")

	whereClause := ""
	args := []interface{}{}
	paramIdx := 2

	if startDateStr != "" {
		if t, err := time.Parse("2006-01-02", startDateStr); err == nil {
			whereClause += fmt.Sprintf(" AND %s >= $%d", dateColumn, paramIdx)
			args = append(args, t)
			paramIdx++
		}
	}
	if endDateStr != "" {
		if t, err := time.Parse("2006-01-02", endDateStr); err == nil {
			tEnd := t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			whereClause += fmt.Sprintf(" AND %s <= $%d", dateColumn, paramIdx)
			args = append(args, tEnd)
			paramIdx++
		}
	}
	if queueID != "" {
		whereClause += fmt.Sprintf(" AND queue_id = $%d", paramIdx)
		if qid, err := uuid.Parse(queueID); err == nil {
			args = append(args, qid)
		} else {
			args = append(args, queueID)
		}
		paramIdx++
	}
	if channelID != "" {
		whereClause += fmt.Sprintf(" AND channel_id = $%d", paramIdx)
		if cid, err := uuid.Parse(channelID); err == nil {
			args = append(args, cid)
		} else {
			args = append(args, channelID)
		}
		paramIdx++
	}

	return whereClause, args, paramIdx
}

func (h *Handler) GetKPIs(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	dateWhere, dateArgs, _ := parseDashboardFilters(c, "conversations.created_at")

	var kpis models.DashboardKPIs
	args := append([]interface{}{companyID}, dateArgs...)

	countQuery := fmt.Sprintf(`SELECT 
		COUNT(*) as total_conversations,
		COUNT(*) FILTER (WHERE status = 'open') as open_conversations,
		COUNT(*) FILTER (WHERE status = 'pending') as pending_conversations,
		COUNT(*) FILTER (WHERE status = 'resolved') as resolved_conversations,
		COALESCE(AVG(sentiment_score), 0.00) as overall_sentiment_score
		FROM conversations WHERE company_id = $1 %s`, dateWhere)

	_ = h.db.QueryRowxContext(c.UserContext(), countQuery, args...).Scan(
		&kpis.TotalConversations,
		&kpis.OpenConversations,
		&kpis.PendingConversations,
		&kpis.ResolvedConversations,
		&kpis.OverallSentimentScore,
	)

	frtQuery := fmt.Sprintf(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60), 0.0) 
		FROM conversations WHERE company_id = $1 AND first_response_at IS NOT NULL %s`, dateWhere)
	_ = h.db.GetContext(c.UserContext(), &kpis.AvgFirstResponseMinutes, frtQuery, args...)

	resQuery := fmt.Sprintf(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60), 0.0) 
		FROM conversations WHERE company_id = $1 AND resolved_at IS NOT NULL %s`, dateWhere)
	_ = h.db.GetContext(c.UserContext(), &kpis.AvgResolutionMinutes, resQuery, args...)

	return c.JSON(kpis)
}

func (h *Handler) GetChannelVolume(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	dateWhere, dateArgs, _ := parseDashboardFilters(c, "cv.created_at")
	args := append([]interface{}{companyID}, dateArgs...)

	var metrics []models.ChannelVolumeMetric
	query := fmt.Sprintf(`SELECT 
		COALESCE(ch.id::text, 'unknown') as channel_id,
		COALESCE(ch.name, 'Direto') as channel_name,
		COALESCE(ch.type, 'direct') as channel_type,
		COUNT(cv.id) as total_count
		FROM conversations cv
		LEFT JOIN channels ch ON ch.id = cv.channel_id
		WHERE cv.company_id = $1 %s
		GROUP BY ch.id, ch.name, ch.type
		ORDER BY total_count DESC`, dateWhere)

	if err := h.db.SelectContext(c.UserContext(), &metrics, query, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch channel volume"})
	}

	return c.JSON(metrics)
}

func (h *Handler) GetAttendantsPerformance(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	dateWhere, dateArgs, _ := parseDashboardFilters(c, "c.created_at")
	args := append([]interface{}{companyID}, dateArgs...)

	var metrics []models.AttendantPerformanceMetric
	query := fmt.Sprintf(`SELECT 
		u.id::text as user_id,
		u.name as user_name,
		u.email as user_email,
		COUNT(c.id) as assigned_count,
		COUNT(c.id) FILTER (WHERE c.status = 'resolved') as resolved_count,
		COALESCE(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60) FILTER (WHERE c.first_response_at IS NOT NULL), 0.0) as avg_first_response_mins,
		COALESCE(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 60) FILTER (WHERE c.resolved_at IS NOT NULL), 0.0) as avg_resolution_mins
		FROM users u
		LEFT JOIN conversations c ON c.assigned_user_id = u.id AND c.company_id = u.company_id %s
		WHERE u.company_id = $1
		GROUP BY u.id, u.name, u.email
		ORDER BY assigned_count DESC`, dateWhere)

	if err := h.db.SelectContext(c.UserContext(), &metrics, query, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch attendant performance"})
	}

	return c.JSON(metrics)
}

func (h *Handler) GetSentimentAnalysis(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	dateWhere, dateArgs, _ := parseDashboardFilters(c, "messages.created_at")
	args := append([]interface{}{companyID}, dateArgs...)

	var metric models.SentimentAnalysisMetric
	query := fmt.Sprintf(`SELECT 
		COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_count,
		COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_count,
		COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_count,
		COALESCE(AVG(sentiment_score), 0.0) as avg_score
		FROM messages WHERE company_id = $1 %s`, dateWhere)

	_ = h.db.QueryRowxContext(c.UserContext(), query, args...).Scan(
		&metric.PositiveCount,
		&metric.NeutralCount,
		&metric.NegativeCount,
		&metric.AvgScore,
	)

	return c.JSON(metric)
}

func (h *Handler) GetStatusFunnel(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	dateWhere, dateArgs, _ := parseDashboardFilters(c, "conversations.created_at")
	args := append([]interface{}{companyID}, dateArgs...)

	var funnel []models.StatusFunnelMetric
	query := fmt.Sprintf(`SELECT status, COUNT(*) as count FROM conversations WHERE company_id = $1 %s GROUP BY status ORDER BY count DESC`, dateWhere)
	if err := h.db.SelectContext(c.UserContext(), &funnel, query, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch funnel"})
	}

	return c.JSON(funnel)
}
