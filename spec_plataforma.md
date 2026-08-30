# Especificação Técnica — Plataforma de Atendimento Omnichannel (SaaS Multi-Tenant)

## Objetivo do Prompt

Este documento serve como especificação completa para geração/desenvolvimento de uma plataforma SaaS multi-tenant de atendimento omnichannel (estilo Chatwoot + Kommo + fluxo de automação), escrita em **Go**, com **PostgreSQL** como banco principal e **Redis** para cache/contexto de conversas, pronta para deploy via **Docker** no **EasyPanel**.

Use este documento como prompt-base para um agente de código (Claude Code, Cursor, etc.), quebrando a implementação por módulos/fases — não peça tudo de uma vez em um único prompt gigante.

---

## 1. Stack e Requisitos Técnicos Gerais

- **Linguagem:** Go (1.22+)
- **Framework HTTP sugerido:** Fiber ou Echo (leve, performático, bom suporte a middlewares)
- **ORM/Query builder:** sqlc ou GORM (sqlc recomendado para performance e controle de SQL em multi-tenant)
- **Banco de dados:** PostgreSQL 16 (container próprio)
- **Cache/memória de contexto:** Redis 7 (container próprio) — usado para:
  - Cache de sessão/autenticação (JWT blacklist, refresh tokens)
  - Contexto de conversa: manter as **últimas 50 mensagens** por conversa em lista Redis (`LPUSH`/`LTRIM`) para uso em IA/SDR e resposta rápida, com sincronização assíncrona para o Postgres (fonte de verdade)
  - Filas leves (rate limit de disparo de campanhas, debounce de eventos)
- **Fila assíncrona (para webhooks, disparos em massa, flows):** Redis Streams ou NATS/RabbitMQ (avaliar conforme volume; começar com Redis Streams para simplificar infraestrutura)
- **Autenticação:** JWT (access + refresh token), multi-tenant via `company_id` embutido no token
- **WebSocket:** para atualização em tempo real das Conversas e Dashboard (Fiber tem suporte nativo via `gofiber/websocket`)
- **Documentação de API:** Swagger/OpenAPI gerado via `swaggo/swag`, exposto na aba **Documentação**
- **Frontend:** SPA separada (React/Vue) consumindo API Go, ou server-rendered com HTMX — definir conforme preferência, mas o backend deve ser API-first
- **Containerização:** Dockerfile multi-stage (build Go estático + imagem final `scratch`/`alpine`), `docker-compose.yml` para dev local, e configuração compatível com EasyPanel (variáveis de ambiente, healthcheck, volumes persistentes para uploads)

### Estrutura de projeto sugerida (Go)

```
/cmd/api                 -> entrypoint
/internal/auth           -> login, JWT, middleware de tenant
/internal/tenant         -> lógica de empresa/multi-tenancy
/internal/contacts
/internal/channels
/internal/conversations
/internal/templates
/internal/flows
/internal/queues
/internal/integrations
/internal/reports
/internal/campaigns
/internal/crm
/internal/billing
/internal/websocket
/pkg/postgres
/pkg/redis
/migrations
/docs (swagger gerado)
Dockerfile
docker-compose.yml
.env.example
```

---

## 2. Multi-Tenancy e Autenticação

### 2.1 Modelo de dados (núcleo)

- `companies` (id, nome, plano, status, created_at)
- `users` (id, company_id, nome, email, senha_hash, role, status)
- `roles` (admin da empresa, supervisor, atendente) — permissões por módulo
- Toda tabela de negócio carrega `company_id` (isolamento lógico por linha — **Row Level Security do Postgres** é fortemente recomendado como segunda camada de proteção, além do filtro na aplicação)

### 2.2 Regras

- Login é sempre no contexto de uma empresa (subdomínio, slug ou seleção pós-login se o usuário pertencer a mais de uma empresa — decidir se o modelo permite usuário em múltiplas empresas)
- Empresa (admin) pode criar/gerenciar usuários abaixo dela (`POST /companies/:id/users`)
- Todo middleware de rota autenticada injeta `company_id` no contexto e **todas as queries filtram por ele obrigatoriamente** — nenhum dado de outra empresa deve ser acessível, nem por IDOR
- Sugestão: usar RLS no Postgres com `SET app.current_company_id` por conexão, como camada extra de segurança contra bug de aplicação

---

## 3. Módulos (Abas)

### 3.1 Dashboard

- Sidebar fixa com ícones modernos (usar um set consistente tipo Lucide/Phosphor — sem placeholders, ícones reais desde o início)
- Cards e gráficos com dados reais vindos do Postgres (nunca mockados):
  - Volume de atendimentos (por canal, por período)
  - Funis de conversão (etapas de atendimento/CRM)
  - Tempo médio de primeira resposta e tempo médio de resolução
  - Análise de sentimento da conversa (armazenar score de sentimento por mensagem/conversa — pode vir de um serviço de IA chamado de forma assíncrona)
- Filtros: intervalo de datas, canal, atendente, fila, tag
- Dados agregados via queries otimizadas (materialized views ou tabelas de agregação atualizadas por job, para não pesar em tempo real)

### 3.2 Conversas

- Lista de contatos que iniciaram conversa, agrupados por status (aberta, pendente, resolvida) e fila
- Histórico completo de mensagens por contato (thread por canal, com indicação de qual canal originou)
- Tags de atendimento (many-to-many conversa↔tag, tags configuráveis por empresa)
- Painel lateral "visão 360": dados cadastrais do contato, etapa do funil/CRM, histórico de atendimentos anteriores
- **Whisper/notas internas**: mensagens de nota visíveis só para atendentes (campo `is_internal boolean` na tabela de mensagens, nunca enviado ao canal externo)
- Atualização em tempo real via WebSocket (nova mensagem, troca de status, atribuição de atendente)

### 3.3 Canais

- Interface simples para conectar canais: WhatsApp (API oficial Meta + opção API não-oficial), Instagram/Facebook (Meta), X, LinkedIn, Webchat embutido (widget JS para o site)
- Toda complexidade de OAuth/validação de webhook fica no backend; a UI só orienta o passo a passo (ex.: colar token, escanear QR code, autorizar OAuth)
- Tabela `channels` (id, company_id, tipo, credenciais criptografadas, status, config json)
- Cada canal tem webhook próprio (`/webhooks/:channel_type/:channel_id`) validado por assinatura/secret

### 3.4 Contatos

- Cadastro manual com campos básicos (nome, telefone, email, etc.)
- **Campos personalizados por empresa**: tabela `custom_fields` (id, company_id, nome, tipo) + `contact_custom_values` (contact_id, custom_field_id, valor) — IDs isolados por `company_id`, sem colisão entre empresas
- Vinculação automática: quando alguém entra em contato por um canal, buscar contato existente por identificador (telefone/email/handle); se não encontrar, criar novo; permitir mesclagem manual de contatos duplicados (`POST /contacts/merge`)

### 3.5 Templates

- Listagem de templates por empresa e por canal vinculado
- Diferenciação de regras por canal:
  - WhatsApp API oficial (Meta): exige template aprovado para abrir janela de 24h
  - WhatsApp API não-oficial: não exige template
- Fluxo de criação de template respeitando as regras de aprovação da Meta (categorias, variáveis, idioma) com submissão via API da Meta
- Status do template (pendente, aprovado, rejeitado) sincronizado via webhook da Meta

### 3.6 Flow (Automação Visual)

- Editor canvas (drag-and-drop) para montar fluxos de atendimento automatizado
- Nós básicos: mensagem, condição, espera, encaminhar para fila, chamar integração/webhook, coletar dado do contato, encerrar
- Persistência do fluxo como JSON (grafo de nós e conexões) em `flows` (id, company_id, nome, definição_json, status)
- Motor de execução do flow roda no backend (worker que interpreta o JSON e processa eventos de entrada)
- Integração direta com a aba Integrações: nós de webhook no canvas devem poder disparar/consumir os webhooks configurados lá

### 3.7 Filas

- Configuração de filas de atendimento por canal (ex.: fila comercial, fila suporte)
- Regras de pré-triagem automática: exemplo, se contato já é cliente → fila de suporte; se é lead novo → fila comercial
- Regras podem usar tags, campos personalizados, canal de origem ou respostas do Flow como critério de roteamento
- Distribuição de atendimento dentro da fila: round-robin, menor carga atual, ou manual

### 3.8 Integrações

- Cadastro de integrações externas (API keys, endpoints, autenticação) reutilizáveis em Flows e regras de Filas
- Suporte a execução de "código específico" (scripts leves/sandbox, ex.: uma etapa de transformação de dados) — avaliar uso de VM Go (goja para JS sandbox) para lógica customizada seguro
- Criação de **webhooks por evento** (nova conversa, mensagem recebida, mudança de etapa do CRM, etc.) que podem ser consumidos como gatilho dentro do canvas do Flow

### 3.9 Relatórios

- Filtros amplos sobre tudo que ocorre na plataforma: mensagens, tempos de atendimento, uso por canal, desempenho por atendente, uso de templates, resultados de campanhas
- Exportação (CSV/PDF) dos relatórios gerados
- Base para tomada de decisão da empresa cliente sobre a operação

### 3.10 Campanhas

- Disparo em massa por canal (respeitando limites e templates quando aplicável)
- Seleção de destinatários via upload de CSV ou lista de contatos previamente segmentada (tags/filtros)
- Fila de envio com throttling (usar Redis para controle de rate limit por canal, evitando bloqueio das APIs oficiais)
- Acompanhamento de status de envio (enviado, entregue, lido, falhou) por destinatário

### 3.11 CRM

- Reaproveita o cadastro de Contatos
- Pipelines configuráveis (funis) com etapas customizáveis por empresa
- Visualização Kanban (cards por etapa) e também em lista
- Card do CRM linkado à conversa e ao histórico do contato

### 3.12 Pagamentos

- Gestão de billing da própria plataforma (plano da empresa cliente)
- Configuração de canais de pagamento da Meta (ex.: WhatsApp Payments, quando aplicável)
- Configuração de provedores de IA usados no atendimento (chave de API para o motor de IA usado no SDR/chatbot configurável)
- Histórico de cobranças e status de assinatura

### 3.13 Documentação

- Aba que aponta para o Swagger/OpenAPI gerado automaticamente (`swaggo/swag`) cobrindo todos os endpoints dos módulos acima
- Manter anotações Swagger atualizadas em cada handler Go desde o início do desenvolvimento, não como etapa final

---

## 4. Banco de Dados — Visão Geral de Entidades

```
companies, users, roles
channels
contacts, custom_fields, contact_custom_values
conversations, messages (com is_internal para whisper)
tags, conversation_tags
templates
flows, flow_executions
queues, queue_rules
integrations, webhooks
campaigns, campaign_recipients
crm_pipelines, crm_stages, crm_cards
billing_plans, subscriptions, payment_channels
```

> Recomenda-se desenhar as migrations com uma ferramenta como `golang-migrate`, versionadas no repositório.

---

## 5. Docker e Deploy no EasyPanel

- `Dockerfile` multi-stage: build binário estático Go → imagem final mínima (alpine/distroless)
- `docker-compose.yml` local com serviços: `api`, `postgres`, `redis`, (e frontend, se aplicável)
- Variáveis de ambiente via `.env` (DB_URL, REDIS_URL, JWT_SECRET, META_APP_ID, etc.) — nunca hardcoded
- Healthcheck endpoint (`/health`) para o EasyPanel monitorar o container
- Volume persistente para uploads (mídias de conversas) e para dados do Postgres
- Logs estruturados (JSON) direcionados a stdout, padrão esperado por plataformas de deploy como EasyPanel

---

## 6. Ordem Sugerida de Implementação (fases)

1. Auth + multi-tenancy + CRUD de usuários/empresas
2. Canais + Webhook receiver genérico + Contatos
3. Conversas (mensagens, whisper, tags, WebSocket)
4. Filas + regras de roteamento
5. Dashboard (com dados reais desde o início, mesmo que simples)
6. Templates (integração Meta)
7. CRM (pipelines/kanban)
8. Flow (motor de automação)
9. Integrações + webhooks de evento
10. Campanhas
11. Relatórios avançados
12. Pagamentos/Billing
13. Swagger/Documentação (contínuo, mas revisão final aqui)

---

*Use cada seção acima como um prompt isolado ao instruir um agente de código, referenciando sempre o modelo de multi-tenancy (seção 2) para garantir isolamento de dados entre empresas em cada novo módulo.*