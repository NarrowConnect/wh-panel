package reports

import (
	"fmt"
	"strings"
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
	rep.Get("/conversations/export/pdf", h.ExportConversationsPDF)
	rep.Get("/attendants/export/csv", h.ExportAttendantsCSV)
	rep.Get("/attendants/export/pdf", h.ExportAttendantsPDF)
	rep.Get("/crm/funnel", h.GetCRMFunnel)
}

func (h *Handler) fetchReportItems(c *fiber.Ctx, companyID uuid.UUID) ([]models.ConversationReportItem, error) {
	status := c.Query("status")
	channelID := c.Query("channel_id")
	userID := c.Query("user_id")
	queueID := c.Query("queue_id")
	tagID := c.Query("tag_id")
	if tagID == "" {
		tagID = c.Query("tag")
	}
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	search := c.Query("search")
	limitStr := c.Query("limit")
	offsetStr := c.Query("offset")

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

	if queueID != "" {
		query += fmt.Sprintf(" AND c.queue_id = $%d", paramIdx)
		args = append(args, queueID)
		paramIdx++
	}

	if tagID != "" {
		if _, err := uuid.Parse(tagID); err == nil {
			query += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM conversation_tags ct2 WHERE ct2.conversation_id=c.id AND ct2.tag_id=$%d)", paramIdx)
			args = append(args, tagID)
			paramIdx++
		}
	}

	if userID != "" {
		query += fmt.Sprintf(" AND c.assigned_user_id = $%d", paramIdx)
		args = append(args, userID)
		paramIdx++
	}

	if search != "" {
		query += fmt.Sprintf(" AND (ct.name ILIKE $%d OR ct.phone ILIKE $%d OR ct.email ILIKE $%d)", paramIdx, paramIdx, paramIdx)
		args = append(args, "%"+search+"%")
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

	limit := 5000
	if limitStr != "" {
		if v, err := fmt.Sscanf(limitStr, "%d", &limit); err == nil && v == 1 && limit > 0 && limit <= 10000 {
		} else {
			limit = 5000
		}
	}
	offset := 0
	if offsetStr != "" {
		fmt.Sscanf(offsetStr, "%d", &offset)
	}
	query += fmt.Sprintf(" ORDER BY c.created_at DESC LIMIT %d OFFSET %d", limit, offset)

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

func (h *Handler) ExportConversationsPDF(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	items, err := h.fetchReportItems(c, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate PDF data"})
	}
	pdfBytes := generateSimplePDF("Relatorio de Conversas", items)
	filename := fmt.Sprintf("relatorio-conversas-%s.pdf", time.Now().Format("2006-01-02"))
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	return c.Send(pdfBytes)
}

func (h *Handler) ExportAttendantsPDF(c *fiber.Ctx) error {
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
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch data"})
	}
	pdfBytes := generateAttendantsPDF(metrics)
	filename := fmt.Sprintf("desempenho-atendentes-%s.pdf", time.Now().Format("2006-01-02"))
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	return c.Send(pdfBytes)
}

func (h *Handler) GetCRMFunnel(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)
	pipelineIDStr := c.Query("pipeline_id")
	var pipelineID uuid.UUID
	if pipelineIDStr != "" {
		if pid, err := uuid.Parse(pipelineIDStr); err == nil {
			pipelineID = pid
		}
	} else {
		_ = h.db.GetContext(c.UserContext(), &pipelineID, `SELECT id FROM crm_pipelines WHERE company_id=$1 ORDER BY is_default DESC LIMIT 1`, companyID)
	}
	if pipelineID == uuid.Nil {
		return c.JSON([]interface{}{})
	}
	type FunnelRow struct {
		StageID    string  `json:"stage_id" db:"stage_id"`
		StageName  string  `json:"stage_name" db:"stage_name"`
		Color      string  `json:"color" db:"color"`
		Count      int     `json:"count" db:"count"`
		TotalValue float64 `json:"total_value" db:"total_value"`
	}
	var rows []FunnelRow
	q := `SELECT s.id::text as stage_id, s.name as stage_name, s.color, COUNT(c.id) as count, COALESCE(SUM(c.value),0) as total_value
	 FROM crm_stages s LEFT JOIN crm_cards c ON c.stage_id=s.id AND c.company_id=s.company_id
	 WHERE s.pipeline_id=$1 AND s.company_id=$2 GROUP BY s.id, s.name, s.color, s.order_index ORDER BY s.order_index ASC`
	_ = h.db.SelectContext(c.UserContext(), &rows, q, pipelineID, companyID)
	return c.JSON(rows)
}

func generateSimplePDF(title string, items []models.ConversationReportItem) []byte {
	var sb string
	sb += "%PDF-1.4\n"
	sb += "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
	sb += "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
	sb += "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj\n"
	content := fmt.Sprintf("BT /F1 14 Tf 50 750 Td (%s) Tj ET\n", pdfEscape(title))
	y := 730
	content += fmt.Sprintf("BT /F1 8 Tf 50 %d Td (Gerado em %s - Total: %d) Tj ET\n", y, time.Now().Format("02/01/2006"), len(items))
	y -= 20
	for i, it := range items {
		if y < 50 {
			break
		}
		if i >= 40 {
			break
		}
		line := fmt.Sprintf("%s | %s | %s | %s", truncate(it.ContactName, 18), truncate(it.ChannelName, 12), it.Status, it.CreatedAt.Format("02/01 15:04"))
		content += fmt.Sprintf("BT /F1 7 Tf 50 %d Td (%s) Tj ET\n", y, pdfEscape(line))
		y -= 12
	}
	sb += fmt.Sprintf("4 0 obj << /Length %d >> stream\n%s\nendstream endobj\n", len(content), content)
	sb += "xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000120 00000 n \n0000000300 00000 n \n"
	sb += "trailer << /Size 5 /Root 1 0 R >>\nstartxref\n500\n%%EOF"
	return []byte(sb)
}

func generateAttendantsPDF(metrics []models.AttendantPerformanceMetric) []byte {
	var sb string
	sb += "%PDF-1.4\n"
	sb += "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
	sb += "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
	sb += "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj\n"
	content := "BT /F1 14 Tf 50 750 Td (Desempenho por Atendente) Tj ET\n"
	y := 730
	for i, m := range metrics {
		if y < 50 || i >= 40 {
			break
		}
		line := fmt.Sprintf("%s | Atend:%d Res:%d TMPR:%.1f TMR:%.1f", truncate(m.UserName, 20), m.AssignedCount, m.ResolvedCount, m.AvgFirstResponseMins, m.AvgResolutionMins)
		content += fmt.Sprintf("BT /F1 7 Tf 50 %d Td (%s) Tj ET\n", y, pdfEscape(line))
		y -= 12
	}
	sb += fmt.Sprintf("4 0 obj << /Length %d >> stream\n%s\nendstream endobj\n", len(content), content)
	sb += "xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000120 00000 n \n0000000300 00000 n \n"
	sb += "trailer << /Size 5 /Root 1 0 R >>\nstartxref\n500\n%%EOF"
	return []byte(sb)
}

func pdfEscape(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "(", "\\(")
	s = strings.ReplaceAll(s, ")", "\\)")
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "."
}
