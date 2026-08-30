package reports

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"time"

	"wh-panel/internal/models"
)

// GenerateConversationsCSV exports conversation report records to CSV bytes
func GenerateConversationsCSV(items []models.ConversationReportItem) ([]byte, error) {
	buf := new(bytes.Buffer)
	writer := csv.NewWriter(buf)

	// UTF-8 BOM for Excel compatibility
	buf.WriteString("\xEF\xBB\xBF")

	// Write CSV Header
	header := []string{
		"ID Conversa",
		"Nome do Contato",
		"Telefone",
		"Canal",
		"Atendente",
		"Status",
		"Tempo Primeira Resposta (min)",
		"Tempo Resolução (min)",
		"Score Sentimento",
		"Data de Criação",
	}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, item := range items {
		row := []string{
			item.ConversationID,
			item.ContactName,
			item.ContactPhone,
			item.ChannelName,
			item.AttendantName,
			item.Status,
			fmt.Sprintf("%.2f", item.FirstResponseMins),
			fmt.Sprintf("%.2f", item.ResolutionMins),
			fmt.Sprintf("%.2f", item.SentimentScore),
			item.CreatedAt.Format(time.RFC3339),
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	return buf.Bytes(), writer.Error()
}

// GenerateAttendantsPerformanceCSV exports operator performance to CSV bytes
func GenerateAttendantsPerformanceCSV(items []models.AttendantPerformanceMetric) ([]byte, error) {
	buf := new(bytes.Buffer)
	writer := csv.NewWriter(buf)

	buf.WriteString("\xEF\xBB\xBF")

	header := []string{
		"ID Atendente",
		"Nome",
		"Email",
		"Conversas Atribuídas",
		"Conversas Resolvidas",
		"Média Tempo 1ª Resposta (min)",
		"Média Tempo Resolução (min)",
	}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, item := range items {
		row := []string{
			item.UserID,
			item.UserName,
			item.UserEmail,
			fmt.Sprintf("%d", item.AssignedCount),
			fmt.Sprintf("%d", item.ResolvedCount),
			fmt.Sprintf("%.2f", item.AvgFirstResponseMins),
			fmt.Sprintf("%.2f", item.AvgResolutionMins),
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	return buf.Bytes(), writer.Error()
}
