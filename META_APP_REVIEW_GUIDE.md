# Guia de Aprovação da Meta — WH Panel

Guia prático com tudo que você precisa configurar, verificar e enviar para aprovar o app do WH Panel no **Meta App Review** (WhatsApp Cloud API + Facebook Login for Business).

Acompanhe o progresso real dentro do próprio painel, na aba **"Homologação Meta"** — ela lê/grava esses mesmos itens no banco de dados.

---

## 0. Antes de começar — variáveis de ambiente (`.env`)

O código não usa mais nenhum valor padrão "de fábrica" para essas variáveis — se estiverem vazias, os recursos correspondentes ficam bloqueados com um aviso claro (isso é intencional, evita conectar com credenciais erradas):

| Variável | Onde obter | Observação |
|---|---|---|
| `META_APP_ID` | Meta for Developers → seu App → Configurações Básicas | |
| `META_APP_SECRET` | Meta for Developers → seu App → Configurações Básicas | Sem isso, a assinatura dos webhooks é **rejeitada** (por design) |
| `META_VERIFY_TOKEN` | Você mesmo define — qualquer string única e aleatória | **Troque** se ainda estiver com um valor genérico; precisa ser **idêntico** ao cadastrado no painel da Meta |
| `META_CONFIG_ID` | Meta for Developers → WhatsApp → Configuração → Embedded Signup | Precisa pertencer ao **mesmo** `META_APP_ID` |
| `META_ACCESS_TOKEN` | Business Settings → Usuários do Sistema → gerar token permanente | Use um token de **System User sem expiração**, não um token temporário do Graph API Explorer |
| `APP_URL` | O domínio público real onde o WH Panel está rodando | Usado para montar as URLs de webhook e callback abaixo — **precisa ser o domínio real**, sem `/` no final importa pouco (o código já trata) |

---

## 1. Configuração no App Dashboard da Meta

Em **Meta for Developers → seu App → Configurações Básicas / Uso do App**, cadastre:

| Campo | Valor |
|---|---|
| Domínios do App | seu domínio (`APP_URL`, sem `https://`) |
| URL da Política de Privacidade | `{APP_URL}/privacy` |
| URL dos Termos de Serviço | `{APP_URL}/terms` |
| URL de Callback de Exclusão de Dados (Data Deletion) | `{APP_URL}/api/v1/meta/data-deletion` |
| Nome/Ícone do App | Não pode conter "WhatsApp" ou "Meta" de forma que sugira afiliação oficial |

Em **WhatsApp → Configuração → Webhooks**:

| Campo | Valor |
|---|---|
| URL de Callback | `{APP_URL}/webhooks/meta` |
| Verify Token | o mesmo valor de `META_VERIFY_TOKEN` no seu `.env` |
| Campos assinados | `messages`, `message_template_status_update` (mínimo) |

> As duas primeiras URLs (`/webhooks/meta` e `/api/v1/meta/data-deletion`) já existem e funcionam de verdade no backend — inclusive a de exclusão de dados valida a assinatura (`signed_request`) com o `META_APP_SECRET`.

---

## 2. Verificação de Negócios (Business Verification)

Feito fora do app, no **Meta Business Manager**:

1. Business Manager → Configurações do Negócio → Informações do Negócio → **Iniciar Verificação**.
2. Envie CNPJ/documento legal da empresa dona do app.
3. Confirme o domínio verificado (registro DNS ou upload de arquivo) — precisa bater com o domínio cadastrado no App Dashboard.
4. Aguarde aprovação (pode levar de horas a poucos dias).

Sem isso, o app permanece em modo de desenvolvimento e não pode aceitar usuários reais além dos testadores.

---

## 3. Permissões & Textos de Caso de Uso (App Review)

Vá em **App Review → Permissões e Recursos**, solicite cada permissão abaixo e cole a justificativa correspondente. Os textos já ficam salvos e editáveis na aba **Homologação Meta → Checklist** do painel.

### `whatsapp_business_messaging`

**PT-BR:**
> Nosso aplicativo é uma plataforma de atendimento omnichannel multi-tenant (WH Panel). Cada empresa cliente conecta seu próprio número de WhatsApp Business via Embedded Signup e usa essa permissão para: (1) receber mensagens de clientes finais em uma caixa de entrada unificada, (2) responder essas mensagens em tempo real pelos atendentes ou por um agente de IA configurável, e (3) disparar mensagens de template aprovadas (notificações, confirmações, marketing) dentro das janelas permitidas pela Meta.

**EN:**
> Our application (WH Panel) is a multi-tenant omnichannel customer service platform. Each client company connects its own official WhatsApp Business account via Embedded Signup and utilizes this permission to: (1) receive incoming support inquiries from end-users into a unified team inbox, (2) reply in real-time within the 24-hour customer care window via live agents, and (3) dispatch approved notification templates outside the 24h window. We strictly respect user consent and opt-out directives.

### `whatsapp_business_management`

**PT-BR:**
> Usamos esta permissão para permitir que cada empresa cliente gerencie, pela nossa interface, os templates de mensagem (HSM) da sua própria conta do WhatsApp Business (criação, edição, exclusão e consulta de status de aprovação), além de consultar os números de telefone e o status da WABA conectada via Embedded Signup. Nenhuma ação é executada em contas de outras empresas — o acesso é sempre limitado à WABA que o próprio cliente conectou.

**EN:**
> We use whatsapp_business_management exclusively to allow client businesses to manage their own WhatsApp Business Account assets: creating and submitting message templates (HSM) across UTILITY and MARKETING categories directly from our UI, tracking template approval statuses via webhooks, and monitoring phone number quality ratings and tier limits. Tenant data is completely isolated.

### `business_management`

**PT-BR:**
> Esta permissão é usada exclusivamente durante o fluxo de Embedded Signup: quando uma empresa cliente conecta seu WhatsApp Business pela nossa interface, precisamos identificar o Business Manager e a WhatsApp Business Account (WABA) que ela autorizou, para vincular corretamente o número de telefone e as credenciais àquele tenant específico dentro da nossa plataforma multi-tenant.

**EN:**
> This permission is used exclusively during the Embedded Signup flow: when a client company connects its WhatsApp Business account through our interface, we need to identify the Business Manager and WhatsApp Business Account (WABA) it authorized, in order to correctly link the phone number and credentials to that specific tenant within our multi-tenant platform.

---

## 4. Checklist de Verificação Manual

Estes itens não têm API pública de status — marque-os você mesmo na aba **Homologação Meta → Checklist** conforme for concluindo:

- [ ] **Verificação de Negócios** concluída no Business Manager (seção 2 acima).
- [ ] **Domínios do App + Política de Privacidade** cadastrados e publicados (`/privacy` já existe no app).
- [ ] **Termos de Serviço** publicados (`/terms` já existe no app).
- [ ] **Nome/ícone do app** em conformidade com as diretrizes de marca da Meta.
- [ ] **Embedded Signup testado ponta a ponta** com um número real, confirmando que o webhook recebe mensagens de teste.
- [ ] **Webhook de produção validado**: `META_APP_SECRET` configurado e assinatura `X-Hub-Signature-256` sendo aceita.

---

## 5. Conta de Teste para o Revisor da Meta

No formulário de submissão, a Meta pede credenciais de um usuário de teste. Use:

| Campo | Valor |
|---|---|
| URL de acesso | seu `APP_URL` |
| Slug da empresa | `meta-reviewer` |
| E-mail | `reviewer@whpanel.com` |
| Senha | `MetaReview2026!Secure` |

⚠️ **Essas credenciais só funcionam depois de você clicar em "Criar/Verificar Conta de Teste"** na aba **Homologação Meta → Kit do Revisor** (isso cria a conta de verdade via `/auth/register`; antes disso o login falharia).

Instruções para o revisor (cole no campo de instruções do formulário):
> Acesse a URL informada, faça login com o e-mail e senha de teste. Vá até a aba "Conversas" para testar envio/recebimento de mensagens, e até a aba "Homologação Meta" para ver a comprovação de uso de cada permissão.

---

## 6. Roteiro do Vídeo de Demonstração (2min30s)

A Meta exige um screencast mostrando o uso real das permissões:

| Tempo | O que mostrar |
|---|---|
| 0:00–0:25 | Login na conta de teste e visão geral do dashboard (explique: SaaS multi-tenant de atendimento) |
| 0:25–0:55 | Aba "Canais" → "Conectar WhatsApp Oficial" → popup do Facebook Login for Business autorizando a WABA |
| 0:55–1:40 | Aba "Conversas": envio de mensagem em tempo real, confirmações de entrega (checks duplos), recebimento via webhook dentro da janela de 24h |
| 1:40–2:10 | Aba "Templates Meta": lista de templates aprovados + criação de um novo template UTILITY com variáveis `{{1}}` |
| 2:10–2:30 | Opt-in/Opt-out: consentimento prévio e resposta ao comando "PARAR", mais os links públicos de Termos e Privacidade |

---

## 7. Checklist final antes de enviar

- [ ] Todas as variáveis da seção 0 preenchidas com valores reais (nada de placeholder).
- [ ] As 3 permissões da seção 3 solicitadas com os textos de caso de uso.
- [ ] Verificação de Negócios aprovada.
- [ ] Conta de teste criada e login confirmado manualmente antes de submeter.
- [ ] Vídeo de demonstração gravado seguindo o roteiro da seção 6.
- [ ] URLs de Política de Privacidade, Termos e Data Deletion Callback acessíveis publicamente (teste em aba anônima).
- [ ] Embedded Signup testado com um número real, mensagem de teste chegando via webhook.

---

*Gerado a partir da implementação real do backend/frontend do WH Panel — os endpoints e textos citados aqui já existem e funcionam no código, não são apenas exemplos.*
