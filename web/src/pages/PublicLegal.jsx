import React, { useState } from 'react';
import { ShieldCheck, FileText, Trash2, ArrowLeft, ExternalLink, CheckCircle2, Lock, Scale, AlertCircle, Copy, Check } from 'lucide-react';
import ApiClient from '../api/client';

export const PublicLegal = ({ initialPage = 'privacy', onBackToApp }) => {
  const [activeTab, setActiveTab] = useState(initialPage);
  const [deletionEmail, setDeletionEmail] = useState('');
  const [deletionSubmitted, setDeletionSubmitted] = useState(false);
  const [deletionConfirmationCode, setDeletionConfirmationCode] = useState('');
  const [deletionSubmitting, setDeletionSubmitting] = useState(false);
  const [deletionError, setDeletionError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleRequestDeletion = async (e) => {
    e.preventDefault();
    if (!deletionEmail.trim()) return;
    setDeletionSubmitting(true);
    setDeletionError('');
    try {
      const res = await ApiClient.post('/meta/data-deletion/manual', { contact: deletionEmail.trim() });
      setDeletionConfirmationCode(res.confirmation_code || res.id);
      setDeletionSubmitted(true);
    } catch (err) {
      setDeletionError(err.message || 'Erro ao registrar solicitação. Tente novamente em alguns instantes.');
    } finally {
      setDeletionSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-purple-500/30">
      {/* Top Navbar */}
      <header className="border-b border-white/[0.08] bg-[#0c101c]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">WH Panel</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-bold uppercase border border-purple-500/20">
                Compliance & Legal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center gap-1.5 border border-white/[0.08]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar ao Painel</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero / Navigation Tabs */}
      <div className="border-b border-white/[0.06] bg-gradient-to-b from-purple-950/20 via-slate-900/40 to-transparent py-8 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Conformidade Oficial com Políticas da Meta & LGPD</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Políticas de Privacidade, Termos e Tratamento de Dados
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto">
            Documentação legal oficial do WH Panel para integração com a Meta WhatsApp Cloud API e Facebook Login for Business.
          </p>

          {/* Tab Selector */}
          <div className="flex flex-wrap justify-center gap-2 pt-4">
            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'privacy'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Política de Privacidade</span>
            </button>
            <button
              onClick={() => setActiveTab('terms')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'terms'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Termos de Serviço</span>
            </button>
            <button
              onClick={() => setActiveTab('data-deletion')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'data-deletion'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Exclusão de Dados (Data Deletion)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="max-w-4xl mx-auto w-full px-4 py-8 flex-1">
        {activeTab === 'privacy' && (
          <div className="space-y-6 text-sm text-slate-300 leading-relaxed bg-[#0c101d] p-6 sm:p-8 rounded-2xl border border-white/[0.07] shadow-xl">
            <div className="border-b border-white/[0.06] pb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-400" />
                Política de Privacidade da Plataforma WH Panel
              </h2>
              <p className="text-xs text-slate-400 mt-1">Última atualização: Setembro de 2026 • Em conformidade com LGPD (Lei 13.709/2018), GDPR e Termos da Plataforma Meta</p>
            </div>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">1. Identificação do Controlador e Objeto</h3>
              <p>
                A plataforma <strong>WH Panel</strong> é uma solução SaaS multi-tenant voltada para o atendimento ao cliente e mensageria omnichannel. 
                Esta Política de Privacidade esclarece como tratamos, armazenamos e protegemos os dados pessoais coletados durante o uso do aplicativo, 
                especificamente através das integrações oficiais da <strong>Meta WhatsApp Cloud API</strong> e do <strong>Facebook Login for Business</strong>.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">2. Dados Coletados e Finalidades do Tratamento</h3>
              <p>O WH Panel processa apenas os dados estritamente necessários para a operacionalização dos serviços de atendimento corporativo:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                <li><strong className="text-slate-200">Dados cadastrais da empresa cliente:</strong> Nome, e-mail corporativo, telefone e ID da WhatsApp Business Account (WABA).</li>
                <li><strong className="text-slate-200">Dados dos contatos finais:</strong> Número de telefone, nome público fornecido pelo WhatsApp e identificadores de conversa.</li>
                <li><strong className="text-slate-200">Conteúdo das mensagens:</strong> Textos, arquivos de mídia (imagens, áudios, documentos) e status de entrega enviados e recebidos estritamente para viabilizar o atendimento ao cliente dentro da Janela de 24 Horas (*Customer Care Window*).</li>
                <li><strong className="text-slate-200">Metadados técnicos:</strong> Logs de webhooks da Meta, confirmações de entrega (*sent, delivered, read*) e data/hora dos eventos para fins de auditoria e resolução de falhas.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">3. Tratamento de Dados via WhatsApp Cloud API (Meta Platforms, Inc.)</h3>
              <p>
                Nossa plataforma conecta-se diretamente aos servidores oficiais da Meta através da <strong>WhatsApp Cloud API</strong>. 
                Ao utilizar a integração:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                <li>Não compartilhamos, vendemos ou alugamos dados de mensagens para terceiros ou para fins de publicidade.</li>
                <li>As mensagens trafegam com criptografia de ponta a ponta na rede pública e via conexões HTTPS/TLS seguras entre nossos servidores e a infraestrutura da Meta.</li>
                <li>Os dados de cada cliente são rigorosamente isolados em nível de banco de dados através de políticas de <em>Row-Level Security (RLS)</em>, garantindo que nenhuma empresa acesse informações de outra.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">4. Consentimento e Políticas de Opt-in / Opt-out</h3>
              <p>
                Em estrita conformidade com as Políticas Comerciais e de Mensagens do WhatsApp, o WH Panel exige que todas as mensagens ativas 
                enviadas a clientes finais possuam consentimento prévio (*Opt-in*). Além disso, disponibilizamos mecanismos automáticos para que qualquer 
                usuário final possa revogar seu consentimento (*Opt-out*) enviando mensagens com palavras-chave como <strong>PARAR</strong> ou <strong>SAIR</strong>, 
                bloqueando novos envios de notificações e respeitando a vontade do titular.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">5. Direitos dos Titulares de Dados (LGPD Art. 18)</h3>
              <p>
                Os titulares têm o direito de confirmar a existência de tratamento, acessar seus dados, corrigir dados incompletos ou inexatos, 
                solicitar a anonimização ou a exclusão definitiva de seus dados de nossas bases a qualquer momento.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">6. Canal de Contato e Encarregado (DPO)</h3>
              <p>
                Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato com nosso Encarregado de Proteção de Dados:
              </p>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-purple-300">
                E-mail: dpo@whpanel.com • privacidade@whpanel.com
              </div>
            </section>
          </div>
        )}

        {activeTab === 'terms' && (
          <div className="space-y-6 text-sm text-slate-300 leading-relaxed bg-[#0c101d] p-6 sm:p-8 rounded-2xl border border-white/[0.07] shadow-xl">
            <div className="border-b border-white/[0.06] pb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-purple-400" />
                Termos de Serviço e Condições de Uso
              </h2>
              <p className="text-xs text-slate-400 mt-1">Vigência: Setembro de 2026 • Contrato de Licenciamento de Software SaaS</p>
            </div>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">1. Aceitação dos Termos</h3>
              <p>
                Ao criar uma conta ou utilizar a plataforma <strong>WH Panel</strong>, a empresa contratante concorda integralmente com estes Termos de Serviço, 
                bem como com as políticas aplicáveis da <strong>Meta Platforms, Inc.</strong>, incluindo os Termos da Plataforma WhatsApp Business e a Política Comercial do WhatsApp.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">2. Uso Aceitável e Proibição de SPAM</h3>
              <p>
                O WH Panel é uma ferramenta destinada ao relacionamento, suporte e atendimento ao cliente legítimo. 
                É terminantemente proibido:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                <li>O envio de mensagens não solicitadas (SPAM) ou mensagens em massa sem o devido consentimento (*Opt-in*).</li>
                <li>A comercialização de produtos ou serviços ilegais, fraudulentos, armas, substâncias controladas ou qualquer outro item vetado na Política Comercial da Meta.</li>
                <li>Tentativas de contornar limites de envio (*tier limits*) ou violar a integridade técnica da API oficial da Meta.</li>
              </ul>
              <p className="text-amber-400 text-xs bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                O descumprimento destas diretrizes resultará na suspensão imediata da conta do usuário no WH Panel e poderá acarretar no bloqueio irreversível do número de WhatsApp pela própria Meta.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">3. Templates de Mensagem (HSM) e Janelas de 24 Horas</h3>
              <p>
                O envio de mensagens fora da Janela de Atendimento de 24 Horas está condicionado ao uso de Modelos de Mensagem (*Templates*) 
                previamente aprovados pela Meta nas categorias <em>MARKETING</em>, <em>UTILITY</em> ou <em>AUTHENTICATION</em>. 
                O cliente reconhece que a aprovação, tarifação e diretrizes dos templates são reguladas exclusivamente pela Meta.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">4. Disponibilidade e Isenção de Responsabilidade Técnica</h3>
              <p>
                Empregamos os melhores esforços para garantir a alta disponibilidade da plataforma. Não obstante, não nos responsabilizamos por instabilidades, 
                interrupções no serviço ou rejeições de templates causadas diretamente pela infraestrutura da Meta ou por falhas na conexão do cliente.
              </p>
            </section>
          </div>
        )}

        {activeTab === 'data-deletion' && (
          <div className="space-y-6 text-sm text-slate-300 leading-relaxed bg-[#0c101d] p-6 sm:p-8 rounded-2xl border border-white/[0.07] shadow-xl">
            <div className="border-b border-white/[0.06] pb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                Instruções de Exclusão de Dados do Usuário (Data Deletion)
              </h2>
              <p className="text-xs text-slate-400 mt-1">Conformidade com a Política de Desenvolvedores da Meta (Facebook Login for Business & WhatsApp API)</p>
            </div>

            <section className="space-y-3">
              <p>
                O <strong>WH Panel</strong> respeita a sua privacidade e oferece transparência total quanto à gestão dos seus dados. 
                De acordo com os requisitos da Meta para aplicativos com <strong>Facebook Login for Business</strong> e <strong>WhatsApp Cloud API</strong>, 
                qualquer usuário ou empresa pode solicitar a remoção completa e definitiva de suas informações da nossa base de dados.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">Opção 1: Desconectar e Excluir pelo Facebook / Meta Business</h3>
              <p>Você pode revogar o acesso do WH Panel diretamente pelo painel do Facebook:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 ml-2">
                <li>Acesse as <strong>Configurações e Privacidade</strong> da sua conta do Facebook.</li>
                <li>Vá para a seção <strong>Aplicativos e Sites</strong>.</li>
                <li>Localize o aplicativo <strong>WH Panel</strong> na lista.</li>
                <li>Clique em <strong>Remover</strong> e marque a opção para remover os dados e publicações vinculadas.</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">Opção 2: Solicitar Exclusão Imediata via Formulário</h3>
              <p>
                Informe o e-mail cadastrado ou o número de telefone conectado para iniciar a exclusão imediata de todos os seus dados:
              </p>

              {deletionSubmitted ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Solicitação de Exclusão Registrada com Sucesso!</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Sua solicitação foi registrada em nosso sistema com o protocolo abaixo e será processada por nossa equipe em até 15 dias, em conformidade com a LGPD e as diretrizes da Meta.
                  </p>
                  <div className="mt-3 p-2.5 rounded-lg bg-black/40 border border-emerald-500/20 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-mono">Código de Protocolo (URL de Status):</p>
                      <p className="text-xs font-mono font-bold text-emerald-400">{deletionConfirmationCode}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(deletionConfirmationCode)}
                      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs flex items-center gap-1 text-slate-300"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestDeletion} className="space-y-3 max-w-md">
                  {deletionError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                      {deletionError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      E-mail corporativo ou telefone com DDI (+55...):
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="seu-email@empresa.com ou +5511999999999"
                      value={deletionEmail}
                      onChange={(e) => setDeletionEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white text-xs focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={deletionSubmitting}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletionSubmitting ? 'Enviando...' : 'Confirmar Solicitação de Exclusão'}</span>
                  </button>
                </form>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-bold text-white">Endpoint Oficial de Callback para a Meta</h3>
              <p className="text-xs text-slate-400">
                Se você é um engenheiro ou revisor da Meta verificando a conformidade com o <em>Data Deletion Request Callback</em>:
              </p>
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-mono space-y-1">
                <div className="text-purple-400 font-bold">POST /api/v1/meta/data-deletion</div>
                <div className="text-slate-500">Payload: signed_request assinado com META_APP_SECRET</div>
                <div className="text-slate-400">Retorno: &#123;"url": "https://seudominio.com/data-deletion?id=...", "confirmation_code": "..."&#125;</div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-slate-500">
        <p>© 2026 WH Panel — Plataforma Omnichannel Inteligente. Todos os direitos reservados.</p>
        <p className="mt-1 text-[11px] text-slate-600">WhatsApp é marca registrada da Meta Platforms, Inc.</p>
      </footer>
    </div>
  );
};

export default PublicLegal;
