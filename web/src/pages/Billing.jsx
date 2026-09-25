import React, { useState, useEffect } from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';

// Providers the billing API has defaults for (billing/handler.go SaveAIProvider).
const providers = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-proj-…', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-…', model: 'claude-3-5-sonnet' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-…', model: 'deepseek-chat' },
];

const subscriptionStatus = {
  active: 'Ativa',
  free: 'Gratuita',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
};

const Usage = ({ label, used, limit }) => {
  const unlimited = !limit || limit <= 0;
  const pct = unlimited || used == null ? 0 : Math.min(100, (used / limit) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200 tabular-nums">
          {used ?? '–'} <span className="text-slate-500">/ {unlimited ? 'ilimitado' : limit.toLocaleString('pt-BR')}</span>
        </span>
      </div>
      {!unlimited && (
        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-amber-400' : 'bg-accent-400'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

const ProviderRow = ({ provider, config, onSaved, onError }) => {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(config?.model_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setModel(config?.model_name || ''), [config?.model_name]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await ApiClient.post('/billing/ai-providers', { provider: provider.id, api_key: key.trim(), model_name: model.trim() });
      setKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      onError(err.message || 'Não foi possível salvar a chave.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remover a chave ${provider.label}?`)) return;
    try {
      await ApiClient.delete(`/billing/ai-providers/${config.id}`);
      onSaved();
    } catch (err) {
      onError(err.message || 'Não foi possível remover a chave.');
    }
  };

  return (
    <form onSubmit={save} className="px-5 py-4 grid grid-cols-1 md:grid-cols-[10rem,1fr,11rem,auto] gap-3 md:items-center">
      <div>
        <p className="text-[13px] text-white">{provider.label}</p>
        <p className={`text-xs ${config ? 'text-emerald-300' : 'text-slate-500'}`}>{config ? 'Chave configurada' : 'Sem chave'}</p>
      </div>
      <input
        type="password"
        autoComplete="off"
        required
        aria-label={`Chave de API ${provider.label}`}
        placeholder={config ? 'Nova chave para substituir' : provider.placeholder}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="field font-mono"
      />
      <input
        type="text"
        aria-label={`Modelo ${provider.label}`}
        placeholder={provider.model}
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="field font-mono"
      />
      <div className="flex items-center gap-1">
        <button type="submit" disabled={saving || !key.trim()} className="btn btn-secondary">
          {saving ? <Loader2 className="animate-spin" /> : saved ? <Check strokeWidth={2} /> : null}
          {saved ? 'Salva' : 'Salvar'}
        </button>
        {config && (
          <button type="button" onClick={remove} className="btn btn-icon text-slate-500 hover:text-rose-300" aria-label={`Remover chave ${provider.label}`} title="Remover">
            <Trash2 strokeWidth={1.75} />
          </button>
        )}
      </div>
    </form>
  );
};

export const Billing = () => {
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState({});
  const [aiConfigs, setAiConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAiConfigs = () =>
    ApiClient.get('/billing/ai-providers')
      .then((d) => setAiConfigs(Array.isArray(d) ? d : []))
      .catch(() => {});

  useEffect(() => {
    const load = async () => {
      const [subRes, usersRes, chRes, ctRes] = await Promise.allSettled([
        ApiClient.get('/billing/subscription'),
        ApiClient.get('/companies/me/users'),
        ApiClient.get('/channels'),
        ApiClient.get('/contacts', { limit: 1 }),
      ]);
      if (subRes.status === 'fulfilled') setSubscription(subRes.value);
      else setError(subRes.reason?.message || 'Não foi possível carregar a assinatura.');
      setUsage({
        users: usersRes.status === 'fulfilled' ? usersRes.value?.total ?? null : null,
        channels: chRes.status === 'fulfilled' && Array.isArray(chRes.value) ? chRes.value.length : null,
        contacts: ctRes.status === 'fulfilled' ? ctRes.value?.total ?? null : null,
      });
      await fetchAiConfigs();
      setLoading(false);
    };
    load();
  }, []);

  const plan = subscription?.plan;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <PageHeader description="Plano da empresa, uso atual e as chaves de API dos provedores de IA usados pelos agentes nos Flows." />

        {error && (
          <p role="alert" className="alert-error">{error}</p>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[20rem,1fr] gap-5 items-start">
            <section className="glass-card">
              <header className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">Plano</p>
                  <h2 className="text-base font-medium text-white">{plan?.name || '–'}</h2>
                </div>
                {subscription?.status && (
                  <span className="px-2 h-5 inline-flex items-center rounded-md border border-white/[0.08] text-[11px] text-slate-300">
                    {subscriptionStatus[subscription.status] || subscription.status}
                  </span>
                )}
              </header>
              <div className="p-5 space-y-4">
                <Usage label="Usuários" used={usage.users} limit={plan?.max_users} />
                <Usage label="Canais" used={usage.channels} limit={plan?.max_channels} />
                <Usage label="Contatos" used={usage.contacts} limit={plan?.max_contacts} />
                {plan?.price_monthly > 0 && (
                  <p className="pt-4 border-t border-white/[0.06] text-[13px] text-slate-400 tabular-nums">
                    {plan.price_monthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês
                  </p>
                )}
              </div>
            </section>

            <section className="glass-card">
              <header className="px-5 py-4 border-b border-white/[0.06]">
                <h2 className="text-[13px] font-medium text-white">Chaves de IA</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  As chaves ficam criptografadas e não são exibidas de volta. O modelo é opcional; em branco, usa o padrão indicado.
                </p>
              </header>
              <div className="divide-y divide-white/[0.05]">
                {providers.map((p) => (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    config={aiConfigs.find((c) => c.provider === p.id)}
                    onSaved={fetchAiConfigs}
                    onError={setError}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default Billing;
