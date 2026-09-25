import React, { useState, useEffect } from 'react';
import { Plus, Play, Webhook, Copy, Check, Trash2, Loader2 } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

// Events the backend actually publishes (integrations/publisher.go callers).
const events = {
  'conversation.created': 'Nova conversa',
  'message.received': 'Mensagem recebida',
  'message.sent': 'Mensagem enviada',
  'crm.card_moved': 'Card movido no CRM',
};

const codeCls = 'field font-mono text-xs resize-y';

const sampleTemplate = `{
  "nome": "payload.name",
  "telefone": "payload.phone",
  "origem": "whatsapp"
}`;

const samplePayload = `{
  "name": "Maria Souza",
  "phone": "5511999990000",
  "email": "maria@exemplo.com"
}`;

export const Integrations = () => {
  const [view, setView] = useState('webhooks');
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', event: 'conversation.created', url: '', secret: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [template, setTemplate] = useState(sampleTemplate);
  const [payload, setPayload] = useState(samplePayload);
  const [output, setOutput] = useState(null);
  const [testing, setTesting] = useState(false);

  const fetchWebhooks = async () => {
    try {
      const data = await ApiClient.get('/webhooks-subscriptions');
      setWebhooks(Array.isArray(data) ? data : data?.webhooks || []);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Não foi possível carregar os webhooks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const openModal = () => {
    setForm({ name: '', event: 'conversation.created', url: '', secret: '' });
    setFormError('');
    setShowModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await ApiClient.post('/webhooks-subscriptions', {
        name: form.name.trim(),
        event_type: form.event,
        target_url: form.url.trim(),
        secret_token: form.secret.trim() || null,
      });
      setShowModal(false);
      fetchWebhooks();
    } catch (err) {
      setFormError(err.message || 'Não foi possível salvar o webhook.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (hook) => {
    if (!window.confirm(`Excluir o webhook "${hook.name}"?`)) return;
    try {
      await ApiClient.delete(`/webhooks-subscriptions/${hook.id}`);
      fetchWebhooks();
    } catch (err) {
      setLoadError(err.message || 'Não foi possível excluir o webhook.');
    }
  };

  const copySecret = async (hook) => {
    try {
      await navigator.clipboard.writeText(hook.secret_token);
      setCopiedId(hook.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* clipboard blocked: nothing to confirm */
    }
  };

  const runTest = async () => {
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      setOutput({ ok: false, text: `O payload de teste não é um JSON válido: ${err.message}` });
      return;
    }
    setTesting(true);
    try {
      const res = await ApiClient.post('/integrations/transform-test', { script: template, payload: parsed });
      setOutput({ ok: true, text: JSON.stringify(res.output, null, 2) });
    } catch (err) {
      setOutput({ ok: false, text: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <PageHeader
          description="Envie eventos do WH Panel para outros sistemas e teste o mapeamento de campos do payload."
          actions={
            <>
              <div className="segmented" role="group" aria-label="Visualização">
                <button type="button" aria-pressed={view === 'webhooks'} onClick={() => setView('webhooks')}>Webhooks</button>
                <button type="button" aria-pressed={view === 'transform'} onClick={() => setView('transform')}>Transformação</button>
              </div>
              {view === 'webhooks' && (
                <button type="button" onClick={openModal} className="btn btn-primary">
                  <Plus strokeWidth={2} />
                  Novo webhook
                </button>
              )}
            </>
          }
        />

        {view === 'webhooks' && (
          <>
            {loadError && (
              <p role="alert" className="alert-error">{loadError}</p>
            )}

            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
              </div>
            ) : webhooks.length === 0 ? (
              !loadError && (
                <div className="glass-card px-6 py-14 text-center space-y-3">
                  <Webhook className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
                  <h2 className="text-sm font-medium text-white">Nenhum webhook cadastrado</h2>
                  <p className="text-[13px] text-slate-400 max-w-md mx-auto">
                    Receba um POST no seu sistema (n8n, Make, ERP) sempre que um evento acontecer no painel.
                  </p>
                  <button type="button" onClick={openModal} className="btn btn-primary mt-2">
                    <Plus strokeWidth={2} />
                    Novo webhook
                  </button>
                </div>
              )
            ) : (
              <ul className="glass-card divide-y divide-white/[0.05]">
                {webhooks.map((hook) => (
                  <li key={hook.id} className="px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white truncate">{hook.name}</span>
                        <span className="text-xs text-slate-500">{events[hook.event_type] || hook.event_type}</span>
                        {!hook.is_active && (
                          <span className="px-1.5 h-5 inline-flex items-center rounded-md border border-white/[0.08] text-[11px] text-slate-400">Inativo</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono truncate">{hook.target_url}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {hook.secret_token && (
                        <button type="button" onClick={() => copySecret(hook)} className="btn btn-secondary">
                          {copiedId === hook.id ? <Check strokeWidth={2} /> : <Copy strokeWidth={1.75} />}
                          {copiedId === hook.id ? 'Copiado' : 'Copiar segredo'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(hook)}
                        className="btn btn-icon text-slate-500 hover:text-rose-300"
                        aria-label={`Excluir ${hook.name}`}
                        title="Excluir"
                      >
                        <Trash2 strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {view === 'transform' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="glass-card p-5 space-y-4">
              <div>
                <label htmlFor="tf-template" className="field-label">Mapeamento</label>
                <p className="text-xs text-slate-500 mb-2">
                  Um objeto JSON em que cada valor <code className="font-mono text-slate-300">"payload.campo"</code> é substituído pelo campo do evento. Outros valores passam como estão.
                </p>
                <textarea id="tf-template" rows={7} spellCheck={false} value={template} onChange={(e) => setTemplate(e.target.value)} className={codeCls} />
              </div>
              <div>
                <label htmlFor="tf-payload" className="field-label">Payload de teste</label>
                <textarea id="tf-payload" rows={6} spellCheck={false} value={payload} onChange={(e) => setPayload(e.target.value)} className={codeCls} />
              </div>
              <button type="button" onClick={runTest} disabled={testing} className="btn btn-primary">
                {testing ? <Loader2 className="animate-spin" /> : <Play strokeWidth={1.75} />}
                {testing ? 'Testando…' : 'Testar mapeamento'}
              </button>
            </section>

            <section className="glass-card p-5 flex flex-col gap-2 min-h-[16rem]">
              <h2 className="text-xs text-slate-300">Resultado</h2>
              <div className="flex-1 rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 overflow-auto">
                {output ? (
                  <pre className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${output.ok ? 'text-slate-200' : 'text-rose-300'}`}>{output.text}</pre>
                ) : (
                  <p className="text-xs text-slate-500">O resultado do mapeamento aparece aqui.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title="Novo webhook"
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
          submitting={submitting}
          submitLabel="Salvar webhook"
          error={formError}
        >
          <div>
            <label htmlFor="wh-name" className="field-label">Nome</label>
            <input id="wh-name" autoFocus required type="text" placeholder="Ex.: n8n – novos leads" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" />
          </div>
          <div>
            <label htmlFor="wh-event" className="field-label">Evento</label>
            <select id="wh-event" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} className="field">
              {Object.entries(events).map(([id, label]) => (
                <option key={id} value={id}>{label} ({id})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wh-url" className="field-label">URL de destino</label>
            <input id="wh-url" required type="url" placeholder="https://api.suaempresa.com/webhook" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="field" />
          </div>
          <div>
            <label htmlFor="wh-secret" className="field-label">
              Segredo <span className="text-slate-500">(opcional)</span>
            </label>
            <input id="wh-secret" type="text" autoComplete="off" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} className="field font-mono" />
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Integrations;
