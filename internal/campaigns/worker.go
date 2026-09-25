package campaigns

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"wh-panel/internal/models"
	"wh-panel/pkg/crypto"
	"wh-panel/pkg/meta"
	"wh-panel/pkg/postgres"
	"wh-panel/pkg/redis"
)

type Dispatcher struct {
	db         *postgres.DB
	metaClient *meta.Client
	jwtSecret  string
}

func NewDispatcher(db *sqlx.DB, _ *redis.Client) *Dispatcher {
	return &Dispatcher{db: postgres.Wrap(db)}
}
func (d *Dispatcher) ConfigureMeta(client *meta.Client, secret string) {
	d.metaClient = client
	d.jwtSecret = secret
}

type campaignConfig struct {
	Credentials string `db:"credentials_encrypted"`
	Name        string `db:"name"`
	Language    string `db:"language"`
	Components  string `db:"components_json"`
	Rate        int    `db:"rate_limit_per_minute"`
}

// The current campaign UI has no per-recipient parameter/media mapping. Reject
// those templates explicitly rather than sending examples or fabricated values.
func validateCampaignComponents(raw string) error {
	var components []models.TemplateComponent
	if err := json.Unmarshal([]byte(raw), &components); err != nil {
		return fmt.Errorf("componentes do template inválidos")
	}
	body := false
	for _, component := range components {
		if strings.EqualFold(component.Type, "BODY") {
			body = true
		}
		if strings.Contains(component.Text, "{{") {
			return fmt.Errorf("campanhas ainda não suportam templates com variáveis; selecione um template sem parâmetros")
		}
		if strings.EqualFold(component.Type, "HEADER") && component.Format != "" && !strings.EqualFold(component.Format, "TEXT") {
			return fmt.Errorf("campanhas ainda não suportam cabeçalho de mídia")
		}
		for _, button := range component.Buttons {
			if strings.Contains(button.URL, "{{") || (button.Type != "URL" && button.Type != "PHONE_NUMBER" && button.Type != "QUICK_REPLY") {
				return fmt.Errorf("template requer parâmetros de botão não configurados na campanha")
			}
		}
	}
	if !body {
		return fmt.Errorf("template sem corpo de mensagem")
	}
	return nil
}

const campaignConfigQuery = `SELECT ch.credentials_encrypted, t.name, t.language, t.components_json, c.rate_limit_per_minute
 FROM campaigns c JOIN channels ch ON ch.id=c.channel_id AND ch.company_id=c.company_id
 JOIN templates t ON t.id=c.template_id AND t.company_id=c.company_id
 JOIN channels tc ON tc.id=t.channel_id AND tc.company_id=c.company_id
 WHERE c.id=$1 AND c.company_id=$2 AND ch.status='active'
 AND ch.type IN ('whatsapp_meta','whatsapp_official') AND t.status='approved'
 AND t.meta_template_id IS NOT NULL AND t.meta_template_id ~ '^[0-9]+$'
 AND ch.config_json->>'waba_id'=tc.config_json->>'waba_id'`

func (d *Dispatcher) QueueCampaignTasks(ctx context.Context, companyID, campaignID uuid.UUID) error {
	if d.metaClient == nil {
		return fmt.Errorf("integração Meta indisponível")
	}
	var cfg campaignConfig
	if err := d.db.GetContext(ctx, &cfg, campaignConfigQuery, campaignID, companyID); err != nil {
		return fmt.Errorf("selecione um canal oficial ativo e um template aprovado e sincronizado da mesma conta WhatsApp")
	}
	if err := validateCampaignComponents(cfg.Components); err != nil {
		return err
	}
	if _, err := d.credentials(cfg.Credentials); err != nil {
		return err
	}
	// Postgres is the durable queue, so a Redis outage cannot silently drop recipients.
	result, err := d.db.ExecContext(ctx, `UPDATE campaigns SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND company_id=$2 AND status IN ('draft','scheduled')`, campaignID, companyID)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return fmt.Errorf("campanha não está em rascunho ou agendada")
	}
	return nil
}

func (d *Dispatcher) credentials(encrypted string) (map[string]string, error) {
	plain, err := crypto.DecryptAES(encrypted, d.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("credenciais do canal inválidas")
	}
	var creds map[string]string
	if json.Unmarshal([]byte(plain), &creds) != nil || creds["access_token"] == "" || creds["phone_number_id"] == "" {
		return nil, fmt.Errorf("credenciais do canal incompletas")
	}
	return creds, nil
}

// Kept as the startup entry point; work is now claimed from the durable DB queue.
func (d *Dispatcher) StartStreamWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var campaigns []struct {
					ID        uuid.UUID `db:"id"`
					CompanyID uuid.UUID `db:"company_id"`
				}
				if err := d.db.SelectContext(ctx, &campaigns, `SELECT id,company_id FROM campaigns WHERE status='processing' ORDER BY created_at`); err != nil {
					continue
				}
				for _, campaign := range campaigns {
					if err := d.dispatchRecipient(ctx, campaign.CompanyID, campaign.ID); err != nil {
						log.Printf("[CampaignWorker] campaign %s: %v", campaign.ID, err)
					}
				}
			}
		}
	}()
}

func (d *Dispatcher) dispatchRecipient(ctx context.Context, companyID, campaignID uuid.UUID) error {
	tx, err := d.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// One worker per campaign even when multiple API replicas are running.
	var locked bool
	if err := tx.GetContext(ctx, &locked, `SELECT pg_try_advisory_xact_lock(hashtextextended($1, 1))`, campaignID.String()); err != nil || !locked {
		return err
	}
	var inFlight bool
	if err := tx.GetContext(ctx, &inFlight, `SELECT EXISTS(SELECT 1 FROM campaign_recipients WHERE campaign_id=$1 AND status='processing')`, campaignID); err != nil {
		return err
	}
	if inFlight {
		return nil
	}
	var cfg campaignConfig
	if err := tx.GetContext(ctx, &cfg, campaignConfigQuery, campaignID, companyID); err != nil {
		return d.failCampaign(ctx, tx, campaignID, "Canal ou template não está mais disponível/aprovado")
	}
	if err := validateCampaignComponents(cfg.Components); err != nil {
		return d.failCampaign(ctx, tx, campaignID, err.Error())
	}
	creds, err := d.credentials(cfg.Credentials)
	if err != nil {
		return d.failCampaign(ctx, tx, campaignID, err.Error())
	}
	var recipient struct {
		ID    uuid.UUID `db:"id"`
		Phone string    `db:"phone"`
	}
	rows := []struct {
		ID    uuid.UUID `db:"id"`
		Phone string    `db:"phone"`
	}{}
	err = tx.SelectContext(ctx, &rows, `SELECT r.id,COALESCE(ct.phone,'') AS phone FROM campaign_recipients r
 JOIN campaigns c ON c.id=r.campaign_id JOIN contacts ct ON ct.id=r.contact_id AND ct.company_id=c.company_id
 WHERE c.id=$1 AND c.company_id=$2 AND c.status='processing' AND r.status='pending'
 ORDER BY r.created_at LIMIT 1 FOR UPDATE OF r SKIP LOCKED`, campaignID, companyID)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		_, err = tx.ExecContext(ctx, `UPDATE campaigns SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='processing' AND NOT EXISTS (SELECT 1 FROM campaign_recipients WHERE campaign_id=$1 AND status IN ('pending','processing'))`, campaignID)
		if err != nil {
			return err
		}
		return tx.Commit()
	}
	recipient = rows[0]
	if cfg.Rate <= 0 {
		cfg.Rate = 60
	}
	if cfg.Rate > 600 {
		cfg.Rate = 600
	}
	timer := time.NewTimer(time.Minute / time.Duration(cfg.Rate))
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
	}
	var status string
	if err := tx.GetContext(ctx, &status, `SELECT status FROM campaigns WHERE id=$1 AND company_id=$2`, campaignID, companyID); err != nil {
		return err
	}
	if status != "processing" {
		return nil
	}
	// Commit the claim before the external side effect. A crash must never replay
	// an already accepted message. Interrupted claims require manual reconciliation.
	if _, err := tx.ExecContext(ctx, `UPDATE campaign_recipients SET status='processing',error_message='Envio iniciado; se interrompido, confira a entrega antes de reenviar' WHERE id=$1`, recipient.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	phone := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, recipient.Phone)
	var sendErr error
	if len(phone) < 8 || len(phone) > 15 {
		sendErr = fmt.Errorf("telefone inválido")
	} else {
		_, sendErr = d.metaClient.SendTemplateMessage(ctx, creds["phone_number_id"], creds["access_token"], phone, cfg.Name, cfg.Language)
	}
	if sendErr != nil {
		_, err = d.db.ExecContext(ctx, `UPDATE campaign_recipients SET status='failed',error_message=$1 WHERE id=$2`, sendErr.Error(), recipient.ID)
	} else {
		_, err = d.db.ExecContext(ctx, `UPDATE campaign_recipients SET status='sent',sent_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=$1`, recipient.ID)
	}
	return err
}

func (d *Dispatcher) failCampaign(ctx context.Context, tx *sqlx.Tx, id uuid.UUID, message string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE campaign_recipients SET status='failed',error_message=$1 WHERE campaign_id=$2 AND status='pending'`, message, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE campaigns SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='processing'`, id); err != nil {
		return err
	}
	return tx.Commit()
}
