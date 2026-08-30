package reports

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
	rep := router.Group("/reports")
	rep.Get("/conversations", h.GetConversationsReport)
	rep.Get("/conversations/export/csv", h.ExportConversationsCSV)
	rep.Get("/attendants/export/csv", h.ExportAttendantsCSV)
}

func (h *Handler) fetchReportItems(c *fiber.Ctx, companyID uuid.UUID) ([]models.ConversationReportItem, error) {
	status := c.Query("status")
	channelID := c.Query("channel_id")
	userID := c.Query("user_id")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	query := `SELECT 
		c.id::text as conversation_id,
		ct.name as contact_name,
		COALESCE(ct.phone, '') as contact_phone,
		COALESCE(ch.name, 'Direto') as channel_name,
		COALESCE(u.name, 'Não Atribuído') as attendant_name,
		c.status,
		COALESCE(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60, 0.0) as first_response_mins,
		COALESCE(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 60, 0.0) as resolution_mins,
		COALESCE(c.sentiment_score, 0.0) as sentiment_score,
		c.created_at
		FROM conversations c
		JOIN contacts ct ON ct.id = c.contact_id
		LEFT JOIN channels ch ON ch.id = c.channel_id
		LEFT JOIN users u ON u.id = c.assigned_user_id
		WHERE c.company_id = $1`

	args := []interface{}{companyID}
	paramIdx := 2

	if status != "" {
		query += fmt.Sprintf(" AND c.status = $%d", paramIdx)
		args = append(args, status)
		paramIdx++
	}

	if channelID != "" {
		query += fmt.Sprintf(" AND c.channel_id = $%d", paramIdx)
		args = append(args, channelID)
		paramIdx++
	}

	if userID != "" {
		query += fmt.Sprintf(" AND c.assigned_user_id = $%d", paramIdx)
		args = append(args, userID)
		paramIdx++
	}

	if startDate != "" {
		if t, err := time.Parse("2006-01-02", startDate); err == nil {
			query += fmt.Sprintf(" AND c.created_at >= $%d", paramIdx)
			args = append(args, t)
			paramIdx++
		}
	}

	if endDate != "" {
		if t, err := time.Parse("2006-01-02", endDate); err == nil {
			tEnd := t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			query += fmt.Sprintf(" AND c.created_at <= $%d", paramIdx)
			args = append(args, tEnd)
			paramIdx++
		}
	}

	query += " ORDER BY c.created_at DESC LIMIT 5000"

	var items []models.ConversationReportItem
	err := h.db.SelectContext(c.UserContext(), &items, query, args...)
	return items, err
}

func (h *Handler) GetConversationsReport(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	items, err := h.fetchReportItems(c, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate report"})
	}

	return c.JSON(fiber.Map{
		"items": items,
		"total": len(items),
	})
}

func (h *Handler) ExportConversationsCSV(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	items, err := h.fetchReportItems(c, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate CSV data"})
	}

	csvData, err := GenerateConversationsCSV(items)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to format CSV"})
	}

	filename := fmt.Sprintf("relatorio-conversas-%s.csv", time.Now().Format("2006-01-02"))
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))

	return c.Send(csvData)
}

func (h *Handler) ExportAttendantsCSV(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var metrics []models.AttendantPerformanceMetric
	query := `SELECT 
		u.id::text as user_id,
		u.name as user_name,
		u.email as user_email,
		COUNT(c.id) as assigned_count,
		COUNT(c.id) FILTER (WHERE c.status = 'resolved') as resolved_count,
		COALESCE(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60) FILTER (WHERE c.first_response_at IS NOT NULL), 0.0) as avg_first_response_mins,
		COALESCE(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 60) FILTER (WHERE c.resolved_at IS NOT NULL), 0.0) as avg_resolution_mins
		FROM users u
		LEFT JOIN conversations c ON c.assigned_user_id = u.id AND c.company_id = u.company_id
		WHERE u.company_id = $1
		GROUP BY u.id, u.name, u.email
		ORDER BY assigned_count DESC`

	if err := h.db.SelectContext(c.UserContext(), &metrics, query, companyID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch attendant performance"})
	}

	csvData, err := GenerateAttendantsPerformanceCSV(metrics)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to format CSV"})
	}

	filename := fmt.Sprintf("desempenho-atendentes-%s.csv", time.Now().Format("2006-01-02"))
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))

	return c.Send(csvData)
}
