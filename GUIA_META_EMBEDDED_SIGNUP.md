# Configurar a Meta e conectar um canal no WH Panel

Revisado em 17/09/2026. Este guia corresponde ao fluxo implementado no projeto.

## Configuração recomendada

Para o WH Panel conectar números de diferentes empresas, use seu próprio aplicativo empresarial Meta com WhatsApp Cloud API e Facebook Login for Business, configurado como Tech Provider. Crie uma configuração **WhatsApp Embedded Signup v4**, com cadastro completo do número. O exemplo oficial da Meta recomenda v4 para produção [1]. A versão do cadastro (`v4`) é independente da versão Graph API (`v26.0`).

No painel da Meta:

1. Vincule o aplicativo ao portfólio empresarial da plataforma e conclua a verificação empresarial/etapas de Tech Provider exigidas para sua conta.
2. Em Facebook Login for Business / Embedded Signup Builder, crie uma configuração cuja variação seja WhatsApp Embedded Signup e cujo produto seja WhatsApp Cloud API.
3. Configure os ativos de conta WhatsApp e telefone necessários para gerenciar números, templates e mensagens. Use token de usuário do sistema empresarial (business integration system user), destinado ao cliente que autorizou o cadastro. Confira a expiração oferecida no seu painel: o código não renova tokens automaticamente. Não trate um token temporário de teste como permanente.
4. Solicite `whatsapp_business_management` e `whatsapp_business_messaging`. Não acrescente permissões de anúncios, páginas ou Instagram para este fluxo. `business_management` não é usado pelos endpoints deste cadastro.
5. Copie o ID da configuração para `META_CONFIG_ID`. Ele não é o App ID, WABA ID ou Phone Number ID.
6. Para atender clientes externos, conclua App Review/acesso necessário às permissões e publique o aplicativo. Em desenvolvimento, teste com usuários que tenham função no app [2].

Esta implementação usa o cadastro **Cloud API padrão**. Não selecione apenas compartilhamento de WABA, app-only ou coexistência com o WhatsApp Business do celular: esses fluxos precisam de tratamento adicional e são recusados quando não retornam um número compatível. Não apague uma conta WhatsApp existente como tentativa de resolver erros; planeje a migração ou implemente coexistência separadamente.

## Domínios e OAuth

Use HTTPS. Adicione o domínio do frontend em App Domains e habilite o login via SDK JavaScript. Em Facebook Login for Business, cadastre as URLs reais onde o botão é usado em Allowed Domains for the JavaScript SDK e Valid OAuth Redirect URIs [2].

Exemplo: `https://app.seudominio.com/`. Se sua aplicação usa rotas com caminhos próprios, cadastre a URL exata apresentada pelo navegador. Não copie `/channels` do exemplo antigo sem conferir a rota real. A URL do webhook é do backend, não a URL da tela de login.

## Variáveis do ambiente

```dotenv
META_APP_ID=
META_APP_SECRET=
META_CONFIG_ID=
META_VERIFY_TOKEN=
META_API_VERSION=v26.0
META_EMBEDDED_SIGNUP_VERSION=v4
META_ACCESS_TOKEN=
```

| Variável | Como preencher |
| --- | --- |
| `META_APP_ID` | ID do seu aplicativo Meta. |
| `META_APP_SECRET` | Segredo do mesmo aplicativo; apenas no backend. Também verifica a assinatura HMAC dos eventos POST. |
| `META_CONFIG_ID` | ID da configuração de Embedded Signup criada no mesmo app. |
| `META_VERIFY_TOKEN` | Segredo aleatório escolhido por você, idêntico ao informado no cadastro do webhook. Valida o desafio GET; não é o App Secret. |
| `META_API_VERSION` | Versão Graph API compatível com seu app. O projeto mantém `v26.0`; confirme no painel antes de mudar. |
| `META_EMBEDDED_SIGNUP_VERSION` | `v4`, recomendado. `v3` existe apenas para compatibilidade explícita com uma configuração legada. |
| `META_ACCESS_TOKEN` | Deixe vazio para Embedded Signup. O token de cada cliente é obtido no cadastro e salvo criptografado no seu canal. |

O `.env` local foi atualizado com campos ausentes, sem substituir valores existentes. Ainda é necessário fornecer App ID, App Secret, Config ID e Verify Token reais. Não há credenciais reais de Meta incluídas pelo projeto. Em produção, configure as mesmas variáveis no EasyPanel/serviço backend; editar um `.env` local não atualiza o servidor remoto.

`APP_URL` deve apontar para a origem HTTPS pública do backend, por exemplo `https://api.seudominio.com`. Preserve `JWT_SECRET` entre reinícios: ele também participa da proteção das credenciais armazenadas. Alterá-lo sem migração pode impedir a leitura de tokens de canais existentes.

Após preencher, recrie/reinicie o serviço backend. O Compose já encaminha `META_EMBEDDED_SIGNUP_VERSION` ao contêiner. Não exponha App Secret, tokens ou PIN em variáveis de frontend.

## Webhook

Cadastre na Meta:

- Callback: `https://api.seudominio.com/webhooks/meta`.
- Verify Token: o valor de `META_VERIFY_TOKEN`.
- Campo `messages` para eventos de mensagens.
- Campo `message_template_status_update` para mudanças de status dos templates.

O cadastro registra o telefone via `/{PHONE_NUMBER_ID}/register` e inscreve o app na WABA via `/{WABA_ID}/subscribed_apps`, operações também presentes no exemplo oficial [3]. Configurar a URL do app não substitui a inscrição na WABA. Erros nessas etapas impedem que o painel anuncie conexão concluída.

Todos os endpoints Meta de recebimento exigem `X-Hub-Signature-256` válido. Um POST manual sem assinatura deve retornar 401. A rota específica por canal não serve para contornar essa proteção.

## Adicionar o canal

1. Entre na empresa correta do WH Panel com perfil administrador ou supervisor.
2. Abra Canais → Conectar Canal → Meta Oficial e informe o nome do canal.
3. Informe o PIN de duas etapas: escolha e guarde seis dígitos para um número novo, ou informe o PIN atual do número existente. **Não é o código SMS/ligação.** O PIN é enviado apenas para registrar o número; não é salvo pelo painel.
4. Clique em Conectar WhatsApp Oficial e conclua o popup: autorize o app, selecione a WABA e o número correto e finalize a verificação solicitada pela Meta.
5. Aguarde a confirmação no painel. O backend valida o token e a associação WABA/número, confirma registro e inscrição, e só então salva o canal ativo.
6. Envie uma mensagem real de um telefone externo para esse número e responda em Conversas dentro da janela de atendimento.
7. Sincronize Templates e confira os status vindos da Meta. Uma falha de submissão mantém o template local em rascunho; não há aprovação ou ID fictício.

Dois números de uma mesma WABA devem gerar dois canais. Reconectar o mesmo número na mesma empresa atualiza o canal. Um número já vinculado a outra empresa é recusado; a transferência exige resolver a vinculação anterior.

## Testes e limites desta entrega

Os testes automatizados usam respostas simuladas da Graph API e banco simulado. Não substituem uma homologação real no seu app, pois não há credenciais Meta configuradas neste ambiente.

- Mensagens de texto só recebem status `sent` após confirmação da API; sem mensagem recebida ou após 24 horas, texto livre é bloqueado.
- O status `sent` significa aceitação pela API, não confirmação de leitura. A correlação de recibos `delivered/read` e a ingestão completa de mídia/eventos em lote ainda não estão implementadas neste fluxo.
- Os simuladores de Homologação Meta não enviam mensagens, não registram opt-in real e não comprovam aprovação. Use Canais, Conversas e Templates para homologação.
- Campanhas agora usam envio real de templates aprovados, sem variáveis ou cabeçalhos de mídia. Esses parâmetros precisam de uma interface própria antes de serem habilitados; exemplos de aprovação não são valores reais de envio. Garanta que a lista tenha consentimento válido: os simuladores não fornecem esse controle.
- A fila de campanhas usa Postgres e respeita o limite configurado (até 600/min), independentemente de Redis. O destinatário é reservado antes do envio. Uma interrupção entre a reserva e a resposta pode deixá-lo em `processing`; confira o resultado antes de qualquer reenvio, para evitar duplicação. O sistema não reenvia automaticamente operações de resultado incerto.
- Tokens revogados/expirados exigem reconexão. Se a Meta retornar erro, a interface informa código/subcódigo sem expor os segredos.

## Referências

1. [Exemplo oficial Meta: versão do Embedded Signup e parâmetros do lançamento](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/app/components/ClientDashboard.tsx).
2. [Exemplo oficial Meta: configuração do aplicativo e checklist de produção](https://github.com/fbsamples/business-messaging-sample-tech-provider-app#3-meta-developer-app).
3. [Exemplo oficial Meta: troca do código, registro e inscrição de webhook](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/app/api/beUtils.ts).
4. [Documentação Meta: implementação do Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation). O acesso automatizado a esta página retornou HTTP 429 durante a revisão; os detalhes de lançamento foram conferidos no código oficial acima.
