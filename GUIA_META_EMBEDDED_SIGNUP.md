# 🚀 Guia de Ativação do Aplicativo Meta (WhatsApp Cloud API & Embedded Signup)

Este guia contém o passo a passo definitivo para configurar o aplicativo no **Meta for Developers**, ativar o fluxo de **Embedded Signup** (Cadastro Incorporado), adicionar números online sem bloqueios e configurar os **Webhooks** no ecossistema do **WH - Panel**.

---

## 📋 Sumário
1. [Pré-requisitos e Checklist Inicial](#1-pré-requisitos-e-checklist-inicial)
2. [Criação e Configuração do Aplicativo na Meta](#2-criação-e-configuração-do-aplicativo-na-meta)
3. [Configuração dos Webhooks](#3-configuração-dos-webhooks)
4. [Configuração do Embedded Signup (Onboarding de Clientes)](#4-configuração-do-embedded-signup-onboarding-de-clientes)
5. [Adição e Verificação do Número Online (Sem Erros)](#5-adição-e-verificação-do-número-online-sem-erros)
6. [Geração do Token Permanente (System User Token)](#6-geração-do-token-permanente-system-user-token)
7. [Variáveis de Ambiente (`.env`)](#7-variáveis-de-ambiente-env)
8. [Boas Práticas, Limites (Tiers) e Troubleshooting](#8-boas-práticas-limites-tiers-e-troubleshooting)

---

## 1. Pré-requisitos e Checklist Inicial

Antes de iniciar no painel da Meta, certifique-se de ter em mãos:

- [ ] **Meta Business Suite (Gerenciador de Negócios):** Uma conta de BM criada em [business.facebook.com](https://business.facebook.com).
- [ ] **Conta de Desenvolvedor Meta:** Cadastrada em [developers.facebook.com](https://developers.facebook.com).
- [ ] **Domínio com SSL / HTTPS:** Obrigatório para a URL de Webhook e para carregar o Facebook SDK no frontend.
- [ ] **Forma de Pagamento Cadastrada:** No Gerenciador do WhatsApp do seu BM (para cobrança oficial de conversas e templates fora da janela de 24h).
- [ ] **Número de Telefone Dedicado:**
  - O número **NÃO PODE** estar atualmente logado em nenhum aplicativo WhatsApp (nem WhatsApp padrão, nem WhatsApp Business no celular).
  - Se o número estiver em um celular, abra o WhatsApp > **Configurações / Ajustes > Conta > Apagar minha conta** (apenas desinstalar o app não é suficiente).
  - O número deve ser capaz de receber **SMS internacional** ou **Ligação telefônica** para confirmação de código de 6 dígitos.

---

## 2. Criação e Configuração do Aplicativo na Meta

### Passo 2.1: Criar o App
1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps) e clique em **Criar aplicativo** (*Create App*).
2. Selecione o caso de uso: **Outro** (*Other*) ou **Empresa** (*Business*).
3. Selecione o tipo de aplicativo: **Negócios** (*Business*).
4. Preencha os dados:
   - **Nome de exibição do app:** Ex: `WH Panel - Cloud API`
   - **E-mail de contato do app:** Seu e-mail corporativo.
   - **Conta do Gerenciador de Negócios:** Selecione o seu BM oficial.
5. Clique em **Criar aplicativo**.

### Passo 2.2: Adicionar os Produtos
No painel do aplicativo recém-criado:
1. Localize o card **WhatsApp** e clique em **Configurar** (*Set up*).
2. Localize o card **Login do Facebook para Empresas** (*Facebook Login for Business*) e clique em **Configurar** (*Set up*).

---

## 3. Configuração dos Webhooks

O webhook é o canal pelo qual a Meta envia para a sua aplicação os eventos em tempo real (mensagens recebidas, status de envio `sent`/`delivered`/`read`, respostas de botões e status de aprovação de templates).

### Passo 3.1: Configurar a URL e o Token de Verificação
1. No menu lateral do app na Meta, vá em **WhatsApp** > **Configuração** (*Configuration*).
2. No bloco **Webhook**, clique em **Editar** (*Edit*).
3. Preencha os campos:
   - **URL de retorno de chamada (Callback URL):**
     ```text
     https://api.seudominio.com/webhooks/meta
     ```
   - **Verificar token (Verify Token):**
     ```text
     narrow_wh_verify_secret_2026
     ```
     *(Defina uma chave segura e idêntica à variável `META_VERIFY_TOKEN` do seu `.env`)*.
4. Clique em **Verificar e Salvar** (*Verify and Save*).
   > O backend responderá automaticamente ao desafio `hub.challenge` com status HTTP 200.

### Passo 3.2: Inscrever-se nos Campos do Webhook
Após salvar a URL, clique em **Gerenciar campos de webhook** (*Manage Webhook Fields*) e assine os seguintes tópicos obrigatórios:

| Campo | Obrigatório? | Descrição |
| :--- | :---: | :--- |
| `messages` | **SIM** | Recebe mensagens de texto, áudio, imagem, botões e confirmações de leitura. |
| `message_template_status_update` | **SIM** | Notifica quando um template HSM for **APPROVED**, **REJECTED** ou **PAUSED**. |
| `phone_number_quality_update` | Recomendado | Alerta sobre mudanças na saúde do número (Green, Yellow, Red). |
| `phone_number_name_update` | Recomendado | Alerta de aprovação do Nome de Exibição do WhatsApp. |
| `account_review_update` | Recomendado | Status de verificação da conta WABA. |

---

## 4. Configuração do Embedded Signup (Onboarding de Clientes)

O **Embedded Signup** permite que os usuários do painel conectem seus próprios números e contas do WhatsApp diretamente pela interface via popup oficial da Meta, sem necessidade de criar apps manualmente.

### Passo 4.1: Configurar o Facebook Login for Business
1. No menu lateral, acesse **Login do Facebook para Empresas** > **Configurações**.
2. Em **URIs de redirecionamento do OAuth válidos**, adicione:
   ```text
   https://app.seudominio.com
   https://app.seudominio.com/channels
   ```
3. Em **Domínios permitidos para o SDK do JavaScript**, adicione o domínio do seu frontend:
   ```text
   https://app.seudominio.com
   ```

### Passo 4.2: Permissões Necessárias (Scopes)
Para o fluxo de Embedded Signup funcionar com autonomia total de envio e gestão, as seguintes permissões do OAuth devem ser solicitadas:
- `whatsapp_business_management` (criar/gerenciar templates, WABAs e números).
- `whatsapp_business_messaging` (enviar e receber mensagens em nome da conta).
- `business_management` (leitura de ativos da empresa).

### Passo 4.3: Configurar a Funcionalidade de Onboarding
1. No menu lateral da Meta, acesse **WhatsApp** > **Configuração Rápida** (*Quickstart*) ou **Incorporação de Cadastro** (*Embedded Signup*).
2. Vincule a **Solução de Parceiro** ou crie uma **Configuração de Incorporação** (*Configuration ID* / `config_id`).
3. O fluxo disparado no frontend via JavaScript SDK:
```javascript
window.fbAsyncInit = function() {
  FB.init({
    appId: '<META_APP_ID>',
    autoLogAppEvents: true,
    xfbml: true,
    version: 'v20.0'
  });
};

// Disparo do popup de Onboarding:
FB.login(function(response) {
  if (response.authResponse) {
    const code = response.authResponse.code;
    // Envia o code para o backend trocar pelo access_token da WABA conectada
  }
}, {
  config_id: '<CONFIG_ID_OPCIONAL>',
  scope: 'whatsapp_business_management,whatsapp_business_messaging',
  response_type: 'code'
});
```

---

## 5. Adição e Verificação do Número Online (Sem Erros)

Para adicionar um número diretamente pelo Gerenciador da Meta ou pela API sem falhas:

### Passo 5.1: Regras do Nome de Exibição (Display Name)
A Meta rejeita nomes que não cumpram as diretrizes. Siga estas regras:
- **Consistência:** O nome deve ter relação direta com a empresa cadastrada no CNPJ ou com o domínio do site (ex: `Narrow Tech - Suporte`).
- **Sem letras MAIÚSCULAS exageradas:** Evite `SUPER ATENDIMENTO TOP`. Use `Super Atendimento`.
- **Sem emojis:** Emojis não são permitidos no nome de exibição oficial da Cloud API.
- **Sem sufixos "WhatsApp":** Nunca use a palavra "WhatsApp" ou "Zap" no nome.

### Passo 5.2: Adicionar o Número
1. No Gerenciador de Negócios, vá em **Gerenciador do WhatsApp** > **Contas do WhatsApp** > selecione sua WABA > **Números de telefone**.
2. Clique em **Adicionar número de telefone**.
3. Digite o **Nome de exibição** e o **Fuso horário / Categoria**.
4. Insira o número com DDI e DDD (ex: `+55 11 99999-9999`).
5. Selecione o método de verificação:
   - **SMS:** Ideal para celulares móveis com boa recepção.
   - **Ligação telefônica:** Obrigatório para números fixos (0800, 4004 ou telefones fixos locais). *Certifique-se de que a URA ou ramal não bloqueie chamadas automáticas em inglês/português.*
6. Insira o código de 6 dígitos recebido.
7. Defina o **PIN de verificação em duas etapas** (guarde este código de 6 dígitos; ele protege a linha contra invasões).

---

## 6. Geração do Token Permanente (System User Token)

Para o seu backend Narrow/WH Panel operar de forma contínua sem que o token expire a cada 24 horas:

1. Acesse o **Meta Business Suite** > **Configurações do Negócio** (`business.facebook.com/settings`).
2. No menu lateral, acesse **Usuários** > **Usuários do sistema** (*System Users*).
3. Clique em **Adicionar**:
   - Nome: `WH Panel Admin System User`
   - Função: **Administrador**.
4. Clique em **Adicionar ativos** (*Add Assets*):
   - Em **Aplicativos**: selecione seu app e conceda **Controle Total**.
   - Em **Contas do WhatsApp**: selecione sua WABA e conceda **Controle Total**.
5. Clique em **Gerar novo token** (*Generate New Token*):
   - Selecione o aplicativo criado.
   - Expiração do token: **Nunca** (*Never*).
   - Marque os escopos:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
6. Copie o token gerado (começa com `EAA...`). **Salve em local seguro, pois ele não será exibido novamente.**

---

## 7. Variáveis de Ambiente (`.env`)

Preencha o arquivo `.env` do seu backend com as credenciais obtidas:

```dotenv
# ==========================================
# META CLOUD API OFICIAL
# ==========================================
# ID do Aplicativo (Painel do Desenvolvedor > Configurações Básicas)
META_APP_ID=123456789012345

# Chave Secreta do Aplicativo (Configurações Básicas > Chave Secreta)
META_APP_SECRET=a1b2c3d4e5f60718293a4b5c6d7e8f90

# Token de Verificação do Webhook (Configurado no Passo 3.1)
META_VERIFY_TOKEN=narrow_wh_verify_secret_2026

# Versão da Graph API
META_API_VERSION=v20.0

# Token Permanente do Usuário do Sistema (Passo 6)
META_ACCESS_TOKEN=EAAB...SEU_TOKEN_AQUI...
```

---

## 8. Boas Práticas, Limites (Tiers) e Troubleshooting

### 🟢 Níveis de Limite de Mensagens (Messaging Limits)
Toda nova conta do WhatsApp Cloud API inicia com limite de envio de mensagens ativas (iniciadas pela empresa):
- **Tier 1:** 1.000 clientes únicos / 24h.
- **Tier 2:** 10.000 clientes únicos / 24h.
- **Tier 3:** 100.000 clientes únicos / 24h.
- **Tier 4:** Ilimitado.

> **Importante:** Mensagens de resposta a clientes (dentro da janela de 24 horas aberta pelo usuário) **não contam** para esse limite e não têm custo adicional de template.

### 🛡️ Evitar Bloqueios e Manter Classificação Verde (*Quality Rating*)
1. **Templates Relevantes:** Só envie mensagens para contatos com Opt-in prévio confirmado.
2. **Botão de Descadastramento:** Em campanhas em massa, inclua um botão de ação rápida "Sair da lista" ou "Parar".
3. **Erros Comuns:**
   - `Error 131030: Message failed to send`: O número do destinatário não tem WhatsApp ou você atingiu o limite de envio diário.
   - `Error 100: Invalid parameter`: O template enviado não possui as variáveis correspondentes cadastradas na Meta.
   - `Error 190: Invalid OAuth access token`: O token expirou ou perdeu permissões no Usuário do Sistema.
