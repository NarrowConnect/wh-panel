# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Principal: atendentes em turno.** Operadores que passam o expediente inteiro na tela de Conversas respondendo clientes pelo WhatsApp (e demais canais), alternando entre várias conversas abertas, notas internas (whisper), tags e o card do contato no CRM.

**Secundários: supervisores e admins da empresa cliente.** Configuram o que sustenta o atendimento: canais, filas e regras de triagem, flows e agentes de IA, templates Meta, campanhas, integrações, usuários e plano. Usam o painel em sessões mais curtas e esporádicas.

Papéis existentes no sistema: admin da empresa, supervisor, atendente.

## Product Purpose

SaaS multi-tenant de atendimento omnichannel: centraliza as conversas de uma empresa num só painel e dá à operação as ferramentas ao redor delas (CRM, automação, disparos, relatórios). Sucesso é o atendente resolver mais conversas com menos troca de contexto, e a empresa operar WhatsApp oficial e não-oficial sem precisar de três produtos diferentes.

## Positioning

- **Meta oficial + QR juntos.** WhatsApp Cloud API oficial (com templates, janela de 24h, Embedded Signup e homologação Meta) e WhatsApp não-oficial via QR (WAHA) no mesmo painel, na mesma caixa de conversas.
- **Tudo em um.** Atendimento, CRM Kanban, Flows, Campanhas, Filas e Relatórios numa ferramenta só, compartilhando o mesmo cadastro de contatos e conversas — em vez de integrar Chatwoot + Kommo + um motor de automação.
- **Agentes de IA / SDR.** Agentes de IA configurados nos Flows, usando a chave de API do próprio cliente, atendendo e qualificando leads automaticamente.

## Operating Context

- Uso contínuo durante o turno de trabalho, em desktop, com atualização em tempo real via WebSocket (novas mensagens, troca de status, atribuição).
- Interface e conteúdo em português do Brasil.
- Regras da Meta fazem parte do dia a dia: templates aprovados para abrir conversa fora da janela de 24h, status de template sincronizado por webhook, limites de envio em campanhas.
- A empresa cliente conecta seus próprios canais (OAuth/Embedded Signup da Meta, token, ou QR code do WAHA).
- Páginas públicas de compliance para revisores da Meta: privacidade, termos e exclusão de dados (`/privacy`, `/terms`, `/data-deletion`).

## Capabilities and Constraints

- Módulos: Dashboard, Conversas, CRM Kanban, Flows & Agentes IA, Canais, Contatos (com campos personalizados e merge), Templates Meta, Homologação Meta, Filas & Triagem, Campanhas, Integrações & webhooks (com sandbox JS), Relatórios (exportação CSV), Planos & chaves de IA, documentação Swagger em `/docs`.
- Isolamento multi-tenant obrigatório por `company_id` (RLS no Postgres); nada de dados de uma empresa visível para outra.
- Stack existente: backend Go (Fiber), PostgreSQL 16, Redis 7; frontend React 18 + Vite + Tailwind 3 em `web/`.
- Dados exibidos devem ser reais, vindos da API — nunca mockados.
- Diferença de regras por canal: WhatsApp oficial exige template aprovado; WhatsApp via QR não exige.

## Brand Commitments

- Nome do produto: **WH Panel**.
- Idioma: português do Brasil.

## Evidence on Hand

- Produto em **pré-lançamento**: em desenvolvimento e em processo de homologação na Meta, sem clientes pagantes.
- Não existem depoimentos, cases, logos de clientes, métricas de uso ou números de desempenho. Nenhuma tela ou texto pode inventá-los.
- Material existente: `META_APP_REVIEW_GUIDE.md` e `GUIA_META_EMBEDDED_SIGNUP.md` (roteiro de homologação e conexão Meta), `spec_plataforma.md` (especificação dos módulos), Swagger em `docs/swagger.json`.

## Product Principles

1. **O turno do atendente vem primeiro.** Conversas é a tela principal; todo o resto é configuração que serve a ela. Decisões que custam atenção do atendente precisam se justificar.
2. **A verdade do canal sempre visível.** Deve ficar claro se uma conversa ou canal é Meta oficial ou QR, e as regras da Meta (janela de 24h, template obrigatório, status de aprovação) aparecem no ponto da ação, não escondidas em outra aba.
3. **Uma ferramenta, não três.** Contato, conversa, card do CRM e flow são o mesmo objeto visto de ângulos diferentes; ligar entre eles em vez de duplicar.
4. **Só o que é real.** Dados reais da API, estados vazios honestos, nenhuma prova social ou número fabricado enquanto o produto estiver em pré-lançamento.
