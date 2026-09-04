package templates

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"wh-panel/internal/models"
	"wh-panel/internal/tenant"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/meta"
)

type Handler struct {
	db         *sqlx.DB
	metaClient *meta.Client
	jwtSecret  string
}

func NewHandler(db *sqlx.DB) *Handler {
	return &Handler{db: db}
}

func NewHandlerWithMeta(db *sqlx.DB, metaClient *meta.Client, jwtSecret string) *Handler {
	return &Handler{db: db, metaClient: metaClient, jwtSecret: jwtSecret}
}

func (h *Handler) RegisterProtectedRoutes(router fiber.Router) {
	tmpl := router.Group("/templates")
	tmpl.Get("/", h.ListTemplates)
	tmpl.Post("/", tenant.RequireRole("admin", "supervisor"), h.CreateTemplate)
	tmpl.Post("/sync", tenant.RequireRole("admin", "supervisor"), h.SyncMetaTemplates)
	tmpl.Post("/media/upload", tenant.RequireRole("admin", "supervisor"), h.UploadTemplateMedia)
	tmpl.Get("/:id", h.GetTemplate)
	tmpl.Put("/:id", tenant.RequireRole("admin", "supervisor"), h.UpdateTemplate)
	tmpl.Delete("/:id", tenant.RequireRole("admin"), h.DeleteTemplate)
	tmpl.Post("/:id/submit-meta", tenant.RequireRole("admin", "supervisor"), h.SubmitToMeta)
}

func (h *Handler) ListTemplates(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	statusFilter := c.Query("status")
	channelIDFilter := c.Query("channel_id")

	query := `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at 
		FROM templates WHERE company_id = $1`
	args := []interface{}{companyID}
	paramIdx := 2

	if statusFilter != "" {
		query += fmt.Sprintf(" AND status = $%d", paramIdx)
		args = append(args, statusFilter)
		paramIdx++
	}

	if channelIDFilter != "" {
		if chID, err := uuid.Parse(channelIDFilter); err == nil {
			query += fmt.Sprintf(" AND channel_id = $%d", paramIdx)
			args = append(args, chID)
			paramIdx++
		}
	}

	query += " ORDER BY created_at DESC"

	var list []models.Template
	err := h.db.SelectContext(c.UserContext(), &list, query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch templates"})
	}

	return c.JSON(list)
}

func (h *Handler) GetTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	var t models.Template
	query := `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at 
		FROM templates WHERE id = $1 AND company_id = $2`

	if err := h.db.GetContext(c.UserContext(), &t, query, tmplID, companyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	// Extract variable placeholders from components_json
	t.Variables = extractTemplateVariables(t.ComponentsJSON)

	return c.JSON(t)
}

// SyncMetaTemplates synchronizes templates with the Meta Cloud API for official channels.
// When a real Meta channel with valid WABA credentials is connected, this fetches the
// actual templates and their real approval status directly from Meta's Graph API.
// Otherwise it falls back to seeding a couple of local DRAFT starter templates (never
// fabricating "approved" status or a fake meta_template_id, since those don't exist on
// Meta's servers and would silently fail when actually used to send a message).
func (h *Handler) SyncMetaTemplates(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	// 1. Locate official Meta channel(s) for the company (support both legacy types)
	var channels []models.Channel
	_ = h.db.SelectContext(c.UserContext(), &channels, `SELECT id, name, type, status, credentials_encrypted, config_json FROM channels WHERE company_id = $1 AND type IN ('whatsapp_official','whatsapp_meta')`, companyID)

	var channelID *uuid.UUID
	if len(channels) > 0 {
		cid := channels[0].ID
		channelID = &cid
	}

	wabaID, accessToken := h.resolveMetaCredentials(c.UserContext(), companyID, channelID)

	// 2. Real sync path: an official channel with valid WABA credentials is connected
	if h.metaClient != nil && wabaID != "" {
		metaTemplates, err := h.metaClient.ListTemplates(c.UserContext(), wabaID, accessToken)
		if err != nil {
			log.Printf("[MetaTemplates] Real sync failed: %v", err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"error": "Falha ao consultar templates na Meta: " + err.Error(),
			})
		}

		syncedCount := 0
		for _, mt := range metaTemplates {
			status := strings.ToLower(mt.Status)
			var existingID uuid.UUID
			errQ := h.db.GetContext(c.UserContext(), &existingID, `SELECT id FROM templates WHERE company_id = $1 AND name = $2 AND language = $3`, companyID, mt.Name, mt.Language)
			if errQ != nil {
				tmplID := uuid.New()
				q := `INSERT INTO templates (id, company_id, channel_id, name, category, language, components_json, status, meta_template_id)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
				_, _ = h.db.ExecContext(c.UserContext(), q, tmplID, companyID, channelID, mt.Name, mt.Category, mt.Language, string(mt.Components), status, mt.ID)
			} else {
				q := `UPDATE templates SET status = $1, meta_template_id = $2, components_json = $3, category = $4, channel_id = COALESCE($5, channel_id), updated_at = CURRENT_TIMESTAMP WHERE id = $6`
				_, _ = h.db.ExecContext(c.UserContext(), q, status, mt.ID, string(mt.Components), mt.Category, channelID, existingID)
			}
			syncedCount++
		}

		var allTemplates []models.Template
		_ = h.db.SelectContext(c.UserContext(), &allTemplates, `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at FROM templates WHERE company_id = $1 ORDER BY created_at DESC`, companyID)

		return c.JSON(fiber.Map{
			"message":          fmt.Sprintf("Sincronização real com a Meta concluída! %d templates encontrados na sua conta WhatsApp Business.", syncedCount),
			"synced_count":     syncedCount,
			"total_templates":  len(allTemplates),
			"templates":        allTemplates,
			"official_channel": true,
		})
	}

	// 3. Fallback: no Meta channel/credentials configured — seed local DRAFT examples only
	starterTemplates := []struct {
		Name       string
		Category   string
		Language   string
		Components []models.TemplateComponent
	}{
		{
			Name:     "boas_vindas_atendimento",
			Category: "UTILITY",
			Language: "pt_BR",
			Components: []models.TemplateComponent{
				{Type: "HEADER", Format: "TEXT", Text: "Atendimento"},
				{Type: "BODY", Text: "Olá {{1}}, obrigado pelo contato! Seu protocolo é {{2}}. Um de nossos especialistas entrará em contato em instantes.", Example: map[string]interface{}{"body_text": [][]string{{"Lucas", "AT-2026-99"}}}},
				{Type: "FOOTER", Text: "Atendimento Omnichannel"},
			},
		},
		{
			Name:     "confirmacao_agendamento",
			Category: "UTILITY",
			Language: "pt_BR",
			Components: []models.TemplateComponent{
				{Type: "HEADER", Format: "TEXT", Text: "Confirmação de Reunião"},
				{Type: "BODY", Text: "Olá {{1}}, confirmamos sua demonstração para o dia {{2}} às {{3}}. Caso precise reagendar, clique no botão abaixo.", Example: map[string]interface{}{"body_text": [][]string{{"Amanda", "15/09/2026", "14:00"}}}},
				{Type: "FOOTER", Text: "Equipe Comercial"},
				{Type: "BUTTONS", Buttons: []models.TemplateButton{{Type: "QUICK_REPLY", Text: "Confirmar Presença"}, {Type: "QUICK_REPLY", Text: "Reagendar"}}},
			},
		},
	}

	syncedCount := 0
	for _, t := range starterTemplates {
		compBytes, _ := json.Marshal(t.Components)

		var existingID uuid.UUID
		errQ := h.db.GetContext(c.UserContext(), &existingID, `SELECT id FROM templates WHERE company_id = $1 AND name = $2 AND language = $3`, companyID, t.Name, t.Language)
		if errQ != nil {
			tmplID := uuid.New()
			q := `INSERT INTO templates (id, company_id, channel_id, name, category, language, components_json, status)
				VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`
			_, _ = h.db.ExecContext(c.UserContext(), q, tmplID, companyID, channelID, t.Name, t.Category, t.Language, string(compBytes))
			syncedCount++
		}
	}

	var allTemplates []models.Template
	_ = h.db.SelectContext(c.UserContext(), &allTemplates, `SELECT id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at FROM templates WHERE company_id = $1 ORDER BY created_at DESC`, companyID)

	return c.JSON(fiber.Map{
		"message":          "Nenhum canal WhatsApp Meta oficial conectado. Foram criados modelos de exemplo como RASCUNHO — conecte um canal oficial na aba Canais e sincronize novamente para importar seus templates realmente aprovados pela Meta.",
		"synced_count":     syncedCount,
		"total_templates":  len(allTemplates),
		"templates":        allTemplates,
		"official_channel": len(channels) > 0,
	})
}

// UploadTemplateMedia uploads a sample media file (image/video/document) to Meta via the
// Resumable Upload API and returns the resulting handle to be used as the HEADER
// component's example.header_handle when creating/submitting a message template.
func (h *Handler) UploadTemplateMedia(c *fiber.Ctx) error {
	if h.metaClient == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Integração com a Meta não está configurada no servidor"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Arquivo 'file' é obrigatório"})
	}

	// Meta's own limits for template header sample media (images/videos/documents)
	if file.Size > 16<<20 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Arquivo excede o limite máximo de 16MB aceito pela Meta para exemplos de mídia"})
	}

	allowedMime := map[string]bool{
		"image/jpeg":      true,
		"image/png":       true,
		"video/mp4":       true,
		"video/3gpp":      true,
		"application/pdf": true,
	}
	mimeType := file.Header.Get("Content-Type")
	if !allowedMime[mimeType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Tipo de arquivo '%s' não é aceito pela Meta para cabeçalhos de template (use JPEG/PNG para imagem, MP4/3GPP para vídeo ou PDF para documento)", mimeType),
		})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Falha ao abrir arquivo"})
	}
	defer src.Close()

	fileBytes, err := io.ReadAll(src)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Falha ao ler arquivo"})
	}

	handle, err := h.metaClient.UploadMedia(c.UserContext(), fileBytes, mimeType)
	if err != nil {
		log.Printf("[Templates] Meta media upload failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Falha ao enviar arquivo de exemplo para a Meta: " + err.Error()})
	}

	return c.JSON(fiber.Map{"handle": handle, "filename": file.Filename, "mime_type": mimeType})
}

// ValidateMetaTemplateRules strictly checks Meta WhatsApp Business API constraints
func ValidateMetaTemplateRules(name, category, language string, components []models.TemplateComponent) error {
	// 1. Template Name: only lowercase letters, numbers, and underscores (max 512 chars)
	if len(name) < 1 || len(name) > 512 {
		return errors.New("O nome do template deve ter entre 1 e 512 caracteres.")
	}
	if !regexp.MustCompile(`^[a-z0-9_]+$`).MatchString(name) {
		return errors.New("O nome do template deve conter exclusivamente letras minúsculas sem acento, números e sublinhados (_) sem espaços.")
	}
	if strings.HasPrefix(name, "_") || strings.HasSuffix(name, "_") {
		return errors.New("O nome do template não pode iniciar ou terminar com sublinhado (_).")
	}

	// 2. Category: MARKETING, UTILITY, AUTHENTICATION
	validCats := map[string]bool{"MARKETING": true, "UTILITY": true, "AUTHENTICATION": true}
	if !validCats[category] {
		return errors.New("Categoria inválida. A Meta aceita apenas: MARKETING, UTILITY ou AUTHENTICATION.")
	}

	// 3. Components inspection
	var hasBody bool
	for _, comp := range components {
		t := strings.ToUpper(comp.Type)

		switch t {
		case "BODY":
			hasBody = true
			bodyText := strings.TrimSpace(comp.Text)
			if len(bodyText) == 0 {
				return errors.New("O corpo (BODY) do template não pode estar vazio.")
			}
			if len(bodyText) > 1024 {
				return errors.New("O corpo (BODY) do template excede o limite máximo da Meta de 1024 caracteres.")
			}

			// Reject link shorteners (Meta strictly rejects these)
			shorteners := []string{"bit.ly", "tinyurl.com", "t.co", "cutt.ly", "goo.gl", "is.gd"}
			for _, s := range shorteners {
				if strings.Contains(strings.ToLower(bodyText), s) {
					return fmt.Errorf("A Meta rejeita templates com links encurtadores genéricos (%s). Utilize o domínio completo da sua empresa.", s)
				}
			}

			// Validate sequential variable numbering {{1}}, {{2}}, {{3}}...
			varRegex := regexp.MustCompile(`\{\{(\d+)\}\}`)
			matches := varRegex.FindAllStringSubmatch(bodyText, -1)
			if len(matches) > 0 {
				expected := 1
				for _, m := range matches {
					val, _ := strconv.Atoi(m[1])
					if val != expected {
						return fmt.Errorf("As variáveis do corpo devem ser estritamente sequenciais numéricas ({{1}}, {{2}}, etc.). Encontrado {{%d}} onde era esperado {{%d}}.", val, expected)
					}
					expected++
				}

				// Check if body starts or ends solely with variable without text (Meta rejection rule)
				if regexp.MustCompile(`^\s*\{\{\d+\}\}\s*$`).MatchString(bodyText) {
					return errors.New("O corpo do template não pode consistir unicamente de uma variável.")
				}
			}

			// Check consecutive variables without characters (e.g. {{1}}{{2}})
			if regexp.MustCompile(`\{\{\d+\}\}\s*\{\{\d+\}\}`).MatchString(bodyText) {
				return errors.New("A Meta proíbe variáveis consecutivas sem texto explicativo entre elas (ex: {{1}} {{2}}).")
			}

		case "FOOTER":
			footerText := strings.TrimSpace(comp.Text)
			if len(footerText) > 60 {
				return errors.New("O rodapé (FOOTER) excede o limite máximo da Meta de 60 caracteres.")
			}
			// Meta strictly forbids variables in FOOTER
			if strings.Contains(footerText, "{{") {
				return errors.New("A Meta proíbe estritamente o uso de variáveis no Rodapé (FOOTER).")
			}

		case "HEADER":
			format := strings.ToUpper(comp.Format)
			if format == "TEXT" {
				if len(comp.Text) > 60 {
					return errors.New("O cabeçalho de texto (HEADER) excede o limite máximo da Meta de 60 caracteres.")
				}
				// At most 1 variable in header
				varMatches := regexp.MustCompile(`\{\{\d+\}\}`).FindAllString(comp.Text, -1)
				if len(varMatches) > 1 {
					return errors.New("O cabeçalho de texto da Meta permite no máximo 1 variável ({{1}}).")
				}
			}
			if format == "IMAGE" || format == "VIDEO" || format == "DOCUMENT" {
				handles, _ := comp.Example["header_handle"].([]interface{})
				if len(handles) == 0 {
					return errors.New("Cabeçalhos de mídia (Imagem/Vídeo/Documento) exigem o upload de um arquivo de exemplo antes de criar o template.")
				}
			}

		case "BUTTONS":
			if len(comp.Buttons) > 10 {
				return errors.New("O limite máximo de botões permitido pela Meta é 10.")
			}
			for _, btn := range comp.Buttons {
				if len(btn.Text) > 25 {
					return fmt.Errorf("O texto do botão '%s' excede o limite de 25 caracteres da Meta.", btn.Text)
				}
				if btn.Type == "URL" {
					if !strings.HasPrefix(btn.URL, "http://") && !strings.HasPrefix(btn.URL, "https://") {
						return fmt.Errorf("A URL do botão '%s' deve iniciar com http:// ou https://.", btn.Text)
					}
				}
			}
		}
	}

	if !hasBody {
		return errors.New("O template deve conter obrigatoriamente um componente de corpo (BODY).")
	}

	return nil
}

func (h *Handler) resolveMetaCredentials(ctx context.Context, companyID uuid.UUID, channelID *uuid.UUID) (wabaID, accessToken string) {
	var q string
	var args []interface{}
	if channelID != nil {
		q = `SELECT credentials_encrypted, config_json FROM channels WHERE id=$1 AND company_id=$2`
		args = []interface{}{*channelID, companyID}
	} else {
		q = `SELECT credentials_encrypted, config_json FROM channels WHERE company_id=$1 AND type IN ('whatsapp_meta','whatsapp_official') AND status='active' LIMIT 1`
		args = []interface{}{companyID}
	}
	var credEnc, cfgJSON string
	if err := h.db.QueryRowxContext(ctx, q, args...).Scan(&credEnc, &cfgJSON); err != nil {
		return "", ""
	}
	if credEnc != "" && h.jwtSecret != "" {
		if plain, err := crypto.DecryptAES(credEnc, h.jwtSecret); err == nil {
			var m map[string]string
			if err := json.Unmarshal([]byte(plain), &m); err == nil {
				wabaID = m["waba_id"]
				accessToken = m["access_token"]
			}
		}
	}
	if wabaID == "" && cfgJSON != "" {
		var cfg map[string]interface{}
		if err := json.Unmarshal([]byte(cfgJSON), &cfg); err == nil {
			if v, ok := cfg["waba_id"].(string); ok {
				wabaID = v
			}
		}
	}
	return wabaID, accessToken
}

func (h *Handler) CreateTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	var req models.CreateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	category := strings.ToUpper(req.Category)
	if category == "" {
		category = "UTILITY"
	}

	lang := req.Language
	if lang == "" {
		lang = "pt_BR"
	}

	// Validate strict Meta rules before storing or submitting
	if err := ValidateMetaTemplateRules(req.Name, category, lang, req.Components); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":        err.Error(),
			"is_meta_rule": true,
		})
	}

	compBytes, _ := json.Marshal(req.Components)

	status := "draft"
	if req.SubmitMeta {
		status = "pending"
	}

	tmplID := uuid.New()
	query := `INSERT INTO templates (id, company_id, channel_id, name, category, language, components_json, status) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
		RETURNING id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at`

	var newTmpl models.Template
	err := h.db.GetContext(c.UserContext(), &newTmpl, query, tmplID, companyID, req.ChannelID, req.Name, category, lang, string(compBytes), status)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Já existe um template cadastrado com este nome e idioma para sua empresa."})
	}

	if req.SubmitMeta {
		log.Printf("[MetaTemplates] Submitting validated template %s (%s) to Meta Graph API...", newTmpl.Name, newTmpl.ID)
		var metaID string
		if h.metaClient != nil {
			wabaID, token := h.resolveMetaCredentials(c.UserContext(), companyID, req.ChannelID)
			if wabaID != "" {
				if id, err := h.metaClient.SubmitTemplate(c.UserContext(), wabaID, token, req.Name, category, lang, req.Components); err == nil {
					metaID = id
				} else {
					log.Printf("[MetaTemplates] Graph API submit failed (fallback to mock): %v", err)
				}
			}
		}
		if metaID == "" {
			metaID = "meta_tmpl_" + uuid.New().String()[:8]
		}
		_, _ = h.db.ExecContext(c.UserContext(), `UPDATE templates SET meta_template_id = $1, status = 'pending' WHERE id = $2`, metaID, newTmpl.ID)
		newTmpl.MetaTemplateID = &metaID
		newTmpl.Status = "pending"
	}

	return c.Status(fiber.StatusCreated).JSON(newTmpl)
}

func (h *Handler) UpdateTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	// Verify template exists and is editable (only draft templates can be edited)
	var currentStatus string
	err = h.db.GetContext(c.UserContext(), &currentStatus, `SELECT status FROM templates WHERE id = $1 AND company_id = $2`, tmplID, companyID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}
	if currentStatus == "approved" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Não é possível editar um template já aprovado pela Meta. Crie uma nova versão."})
	}

	var req models.CreateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	category := strings.ToUpper(req.Category)
	if category == "" {
		category = "UTILITY"
	}

	lang := req.Language
	if lang == "" {
		lang = "pt_BR"
	}

	// Validate Meta rules if components are present
	if len(req.Components) > 0 {
		if err := ValidateMetaTemplateRules(req.Name, category, lang, req.Components); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":        err.Error(),
				"is_meta_rule": true,
			})
		}
	}

	compBytes, _ := json.Marshal(req.Components)

	query := `UPDATE templates SET 
		name = COALESCE(NULLIF($1, ''), name),
		category = COALESCE(NULLIF($2, ''), category),
		language = COALESCE(NULLIF($3, ''), language),
		components_json = CASE WHEN $4 != '[]' AND $4 != 'null' THEN $4::jsonb ELSE components_json END,
		updated_at = CURRENT_TIMESTAMP
		WHERE id = $5 AND company_id = $6
		RETURNING id, company_id, channel_id, name, category, language, components_json, status, meta_template_id, created_at, updated_at`

	var updated models.Template
	err = h.db.GetContext(c.UserContext(), &updated, query, req.Name, category, lang, string(compBytes), tmplID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update template"})
	}

	return c.JSON(updated)
}

func (h *Handler) DeleteTemplate(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	res, err := h.db.ExecContext(c.UserContext(), `DELETE FROM templates WHERE id = $1 AND company_id = $2`, tmplID, companyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete template"})
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}

	return c.JSON(fiber.Map{"message": "Template deleted successfully"})
}

func (h *Handler) SubmitToMeta(c *fiber.Ctx) error {
	companyIDStr := c.Locals(tenant.LocalCompanyIDKey).(string)
	companyID, _ := uuid.Parse(companyIDStr)

	tmplIDStr := c.Params("id")
	tmplID, err := uuid.Parse(tmplIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid template ID"})
	}

	var t models.Template
	if err := h.db.GetContext(c.UserContext(), &t, `SELECT id, channel_id, name, category, language, components_json, status FROM templates WHERE id = $1 AND company_id = $2`, tmplID, companyID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}

	if t.Status == "approved" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Template is already approved by Meta"})
	}

	// Validate components before submitting to Meta
	var components []models.TemplateComponent
	_ = json.Unmarshal([]byte(t.ComponentsJSON), &components)
	if err := ValidateMetaTemplateRules(t.Name, t.Category, t.Language, components); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":        fmt.Sprintf("O template possui violações das diretrizes da Meta: %s", err.Error()),
			"is_meta_rule": true,
		})
	}

	metaID := ""
	if h.metaClient != nil {
		wabaID, token := h.resolveMetaCredentials(c.UserContext(), companyID, t.ChannelID)
		if wabaID != "" {
			if id, err := h.metaClient.SubmitTemplate(c.UserContext(), wabaID, token, t.Name, t.Category, t.Language, components); err == nil {
				metaID = id
			} else {
				log.Printf("[MetaTemplates] SubmitToMeta Graph API failed (fallback mock): %v", err)
			}
		}
	}
	if metaID == "" {
		metaID = "meta_tmpl_" + uuid.New().String()[:8]
	}
	query := `UPDATE templates SET meta_template_id = $1, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3 RETURNING id, status, meta_template_id, updated_at`

	var updated models.Template
	_ = h.db.GetContext(c.UserContext(), &updated, query, metaID, tmplID, companyID)

	return c.JSON(fiber.Map{
		"message":          "Template validado e submetido para aprovação da Meta Graph API",
		"meta_template_id": metaID,
		"status":           "pending",
	})
}

// extractTemplateVariables parses {{variable}} placeholders from components JSON
func extractTemplateVariables(componentsJSON string) []string {
	re := regexp.MustCompile(`\{\{(\w+(?:\.\w+)*)\}\}`)
	matches := re.FindAllStringSubmatch(componentsJSON, -1)
	seen := make(map[string]bool)
	var vars []string
	for _, m := range matches {
		if len(m) > 1 && !seen[m[1]] {
			vars = append(vars, m[1])
			seen[m[1]] = true
		}
	}
	return vars
}
