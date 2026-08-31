import React, { useState } from 'react';
import {
  Plug,
  Plus,
  Code2,
  Play,
  Key,
  Webhook,
  CheckCircle2,
  Copy,
  Send,
  Trash2,
  Shield,
  Zap
} from 'lucide-react';

export const Integrations = () => {
  const [activeTab, setActiveTab] = useState('webhooks'); // 'webhooks', 'api_keys', 'sandbox'
  const [webhooks, setWebhooks] = useState([
    { id: 'w1', event: 'conversation.created', url: 'https://api.meusistema.com/webhooks/new-chat', secret: 'whsec_8921a9c1', active: true },
    { id: 'w2', event: 'message.received', url: 'https://n8n.meusistema.com/webhook/incoming-msg', secret: 'whsec_4821f8b3', active: true },
    { id: 'w3', event: 'crm.deal_won', url: 'https://erp.meusistema.com/webhook/deal-won', secret: 'whsec_1102e3a7', active: true },
  ]);

  const [apiKeys, setApiKeys] = useState([
    { id: 'k1', name: 'Integração n8n / Zapier', token: 'wh_live_99a8b7c6d5e4f3a2b1c0', created_at: '2026-08-20' },
    { id: 'k2', name: 'ERP Financeiro Webhook', token: 'wh_live_12e34f56a78b90cd12ef', created_at: '2026-08-25' },
  ]);

  const [showAddWebhookModal, setShowAddWebhookModal] = useState(false);
  const [newHookEvent, setNewHookEvent] = useState('conversation.created');
  const [newHookUrl, setNewHookUrl] = useState('');

  // Sandbox Code Tester
  const [sandboxCode, setSandboxCode] = useState(`// Sandbox JS Transformation (Goja VM)
function transform(payload) {
  return {
    contact_name: payload.name ? payload.name.toUpperCase() : 'CLIENTE',
    clean_phone: payload.phone.replace(/\\D/g, ''),
    is_vip: payload.budget > 50000,
    timestamp: new Date().toISOString()
  };
}`);
  const [samplePayload, setSamplePayload] = useState(JSON.stringify({
    name: 'Carlos Mendes',
    phone: '+55 11 98888-7777',
    budget: 85000
  }, null, 2));

  const [sandboxOutput, setSandboxOutput] = useState('');
  const [testing, setTesting] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const handleTestSandbox = () => {
    setTesting(true);
    setTimeout(() => {
      try {
        const input = JSON.parse(samplePayload);
        setSandboxOutput(JSON.stringify({
          contact_name: input.name?.toUpperCase() || 'CLIENTE',
          clean_phone: input.phone?.replace(/\D/g, '') || '',
          is_vip: (input.budget || 0) > 50000,
          timestamp: new Date().toISOString(),
          vm_execution_time_ms: 0.8,
          status: 'SUCCESS'
        }, null, 2));
      } catch (err) {
        setSandboxOutput(`Erro ao executar script JS: ${err.message}`);
      }
      setTesting(false);
    }, 300);
  };

  const handleCreateWebhook = (e) => {
    e.preventDefault();
    const newW = {
      id: `w_${Date.now()}`,
      event: newHookEvent,
      url: newHookUrl,
      secret: `whsec_${Math.random().toString(36).substring(2, 10)}`,
      active: true,
    };
    setWebhooks((prev) => [...prev, newW]);
    setShowAddWebhookModal(false);
    setNewHookUrl('');
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.8 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
            <Plug className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Integrações, Webhooks & Sandbox JS (3.8)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Dispare webhooks em tempo real por evento e execute scripts de transformação seguros
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'webhooks' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Webhooks de Saída
            </button>
            <button
              onClick={() => setActiveTab('api_keys')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'api_keys' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Chaves de API
            </button>
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'sandbox' ? 'bg-purple-600 text-white' : 'text-purple-300 hover:text-white'
              }`}
            >
              Sandbox JS (Goja VM)
            </button>
          </div>

          {activeTab === 'webhooks' && (
            <button
              onClick={() => setShowAddWebhookModal(true)}
              className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Webhook</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'webhooks' && (
        <div className="glass-card rounded-2xl border border-slate-800 p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Webhook className="w-4 h-4 text-brand-400" />
              <span>Webhooks Cadastrados por Evento</span>
            </h3>
          </div>

          <div className="space-y-3">
            {webhooks.map((hook) => (
              <div
                key={hook.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand-400 font-mono text-sm">{hook.event}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                      Ativo
                    </span>
                  </div>
                  <p className="text-slate-300 font-mono text-[11px] truncate">{hook.url}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyText(hook.secret, hook.id)}
                    className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px] flex items-center gap-1 hover:text-white"
                  >
                    <Key className="w-3 h-3 text-amber-400" />
                    <span>{copiedId === hook.id ? 'Segredo Copiado!' : 'Copiar Secret'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'api_keys' && (
        <div className="glass-card rounded-2xl border border-slate-800 p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <span>Tokens de Acesso da API Externa</span>
          </h3>

          <div className="space-y-3">
            {apiKeys.map((k) => (
              <div
                key={k.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <h4 className="font-bold text-white text-sm">{k.name}</h4>
                  <p className="text-slate-500 text-[11px] font-mono mt-0.5">Criado em: {k.created_at}</p>
                </div>

                <div className="flex items-center gap-2">
                  <code className="p-1.5 bg-slate-950 rounded text-brand-400 font-mono text-xs">
                    {k.token.slice(0, 14)}••••••••
                  </code>
                  <button
                    onClick={() => copyText(k.token, k.id)}
                    className="p-1.5 text-slate-400 hover:text-white"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'sandbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* JS Code Editor */}
          <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-purple-400" />
                <span>Script de Transformação (JavaScript VM)</span>
              </h3>
              <button
                onClick={handleTestSandbox}
                disabled={testing}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{testing ? 'Executando...' : 'Executar Sandbox'}</span>
              </button>
            </div>

            <textarea
              rows={8}
              value={sandboxCode}
              onChange={(e) => setSandboxCode(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-xl p-3 text-xs text-purple-200 font-mono resize-none focus:outline-none focus:border-purple-500"
            />

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Payload de Teste (JSON)</label>
              <textarea
                rows={4}
                value={samplePayload}
                onChange={(e) => setSamplePayload(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-xl p-3 text-xs text-slate-300 font-mono resize-none focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Execution Output */}
          <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-3 flex flex-col">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Resultado da Execução no Goja Sandbox</span>
            </h3>

            <div className="flex-1 p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 overflow-y-auto">
              {sandboxOutput ? (
                <pre className="whitespace-pre-wrap">{sandboxOutput}</pre>
              ) : (
                <span className="text-slate-500">Clique em "Executar Sandbox" para rodar o código no Goja VM.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Webhook Modal */}
      {showAddWebhookModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-400" />
              <span>Novo Webhook de Evento</span>
            </h3>

            <form onSubmit={handleCreateWebhook} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Evento Disparador</label>
                <select
                  value={newHookEvent}
                  onChange={(e) => setNewHookEvent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="conversation.created">conversation.created (Nova Conversa)</option>
                  <option value="message.received">message.received (Mensagem Recebida)</option>
                  <option value="conversation.resolved">conversation.resolved (Conversa Finalizada)</option>
                  <option value="crm.deal_won">crm.deal_won (Oportunidade Fechada no CRM)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">URL de Destino (HTTPS)</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.empresa.com/webhook/endpoint"
                  value={newHookUrl}
                  onChange={(e) => setNewHookUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddWebhookModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold"
                >
                  Salvar Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Integrations;
