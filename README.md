# WH - Panel | Omnichannel SaaS Multi-Tenant Backend

Backend robusto, escalável e de alta performance desenvolvido em **Go 1.22+ (Fiber)**, **PostgreSQL 16 com Row Level Security (RLS)** nativo por tenant e **Redis 7 (Streams, Sliding Window & Blacklist)**. 

Desenvolvido para atender operações omnichannel de grande porte (estilo Chatwoot + Kommo CRM + Flow Engine visual).

---

## 🚀 Arquitetura e Principais Tecnologias

- **Linguagem & Framework:** Go 1.22+ com [Fiber v2](https://github.com/gofiber/fiber)
- **Banco de Dados Relacional:** PostgreSQL 16 com isolamento **Row Level Security (RLS)** via `company_id`
- **Fila & Cache:** Redis 7 para:
  - Blacklist e controle de expiração de JWT
  - Janela deslizante de contexto das últimas 50 mensagens por conversa
  - Processamento assíncrono de campanhas via **Redis Streams** com *Throttling/Rate Limiting*
- **Comunicação em Tempo Real:** WebSockets (`/ws/conversations`) com broadcasting por tenant
- **Sandbox JavaScript:** Goja VM (`pkg/sandbox`) para execução segura de scripts de transformação de dados
- **Documentação de API:** Swagger UI interativo integrado em `/docs` (OpenAPI em `/swagger.json`)
- **Deploy:** Otimizado para **EasyPanel**, Docker e Docker Compose

---

## 📂 Estrutura do Projeto

```
.
├── cmd/
│   └── api/
│       └── main.go                 # Ponto de entrada da API
├── internal/
│   ├── auth/                       # JWT, Blacklist Redis e Login multi-empresa
│   ├── billing/                    # Planos SaaS, limites de uso e API Keys de IA
│   ├── campaigns/                  # Disparos em massa, Redis Streams e rate limiting
│   ├── channels/                   # Conexão de canais e webhooks Meta
│   ├── contacts/                   # CRM de contatos, campos customizados e merge
│   ├── conversations/              # Mensagens, whisper notes, tags e Redis context
│   ├── crm/                        # Pipelines de vendas e Kanban board
│   ├── dashboard/                  # KPIs em tempo real, TMPR, TMR e funil
│   ├── docs/                       # Handler da interface Swagger UI
│   ├── flows/                      # Motor interpretador de automação visual
│   ├── integrations/               # REST APIs, webhooks de saída e Sandbox JS
│   ├── models/                     # Structs e DTOs de dados
│   ├── queues/                     # Filas, regras de triagem e Round-Robin
│   ├── reports/                    # Relatórios analíticos e exportação em CSV
│   ├── tenant/                     # Middlewares de multi-tenancy e papéis
│   └── websocket/                  # Hub de WebSockets por empresa
├── migrations/                     # 11 Migrações SQL versionadas
├── pkg/
│   ├── crypto/                     # Criptografia AES-256 GCM
│   ├── postgres/                   # Pool de conexão e executor de migrações
│   ├── redis/                      # Cliente Redis e gerenciador de contexto
│   └── sandbox/                    # Sandbox Goja JS
├── docs/
│   └── swagger.json                # Especificação OpenAPI completa
├── Dockerfile                      # Build multi-stage minimalista (Alpine)
├── docker-compose.yml              # Ambiente completo (API + Postgres + Redis)
├── GUIA_META_EMBEDDED_SIGNUP.md    # Guia passo a passo Meta Cloud API & Embedded Signup
└── .env.example                    # Exemplo de variáveis de ambiente
```

---

## 🛠️ Como Rodar Localmente (Docker Compose)

1. Clone o repositório e crie seu `.env`:
   ```bash
   cp .env.example .env
   ```

2. Inicie os containers:
   ```bash
   docker compose up --build
   ```

3. Acesse a documentação interativa da API:
   - **Swagger UI:** `http://localhost:8080/docs`
   - **Healthcheck:** `http://localhost:8080/health`
