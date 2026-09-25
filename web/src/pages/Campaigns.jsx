import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, Plus, Play, Square, ArrowRight, ArrowLeft, UploadCloud, Loader2 } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const asList = (data, key) => (Array.isArray(data) ? data : data?.[key] || []);

// Campaigns are sent through the Meta Cloud API only: the dispatcher refuses
// QR channels and anything but approved, synced templates.
const isOfficial = (ch) => ch.type === 'whatsapp_meta' || ch.type === 'whatsapp_official';

const statusConfig = {
  draft: { label: 'Rascunho', cls: 'text-slate-300 bg-white/[0.05] border-white/[0.08]' },
  scheduled: { label: 'Agendada', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  processing: { label: 'Enviando', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  completed: { label: 'Concluída', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
  cancelled: { label: 'Cancelada', cls: 'text-slate-400 bg-white/[0.03] border-white/[0.06]' },
};

const emptyWizard = { name: '', channelId: '', audience: 'tag', tagId: '', file: null, templateId: '', rateLimit: 60 };

export const Campaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});

  const [channels, setChannels] = useState([]);
  const [tags, setTags] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyWizard);
  const [submitting, setSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const fileRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const fetchCampaigns = async () => {
    try {
      const data = await ApiClient.get('/campaigns');
      setCampaigns(asList(data, 'campaigns'));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Não foi possível carregar as campanhas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Refresh progress while anything is sending.
  useEffect(() => {
    if (!campaigns.some((c) => c.status === 'processing')) return undefined;
    const id = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(id);
  }, [campaigns]);

  const openWizard = async () => {
    setForm(emptyWizard);
    setStep(1);
    setWizardError('');
    setShowWizard(true);
    const [chRes, tagRes] = await Promise.allSettled([ApiClient.get('/channels'), ApiClient.get('/tags')]);
    const official = chRes.status === 'fulfilled' ? asList(chRes.value, 'channels').filter(isOfficial) : [];
    setChannels(official);
    setTags(tagRes.status === 'fulfilled' ? asList(tagRes.value, 'tags') : []);
    if (official.length === 1) set({ channelId: official[0].id });
  };

  useEffect(() => {
    if (!showWizard || !form.channelId) {
      setTemplates([]);
      return;
    }
    ApiClient.get('/templates', { channel_id: form.channelId })
      .then((data) => setTemplates(asList(data, 'templates').filter((t) => String(t.status).toLowerCase() === 'approved')))
      .catch(() => setTemplates([]));
  }, [showWizard, form.channelId]);

  const closeWizard = () => {
    if (!submitting) setShowWizard(false);
  };

  const canAdvance =
    step === 1
      ? form.name.trim() && form.channelId
      : step === 2
        ? form.templateId && (form.audience === 'tag' ? form.tagId : form.file)
        : true;

  // Enter and "Continuar" advance through the steps; only the last one creates.
  const handleSubmit = (e) => {
    e.preventDefault();
    if (step < 3) {
      if (canAdvance) setStep(step + 1);
      return;
    }
    handleCreate();
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setWizardError('');
    let created = null;
    try {
      created = await ApiClient.post('/campaigns', {
        name: form.name.trim(),
        channel_id: form.channelId,
        template_id: form.templateId,
        rate_limit_per_minute: form.rateLimit,
        ...(form.audience === 'tag' ? { tag_id: form.tagId } : {}),
      });
      if (form.audience === 'csv' && form.file) {
        await ApiClient.uploadFile(`/campaigns/${created.id}/import-csv`, form.file);
      }
      await ApiClient.post(`/campaigns/${created.id}/start`);
      setShowWizard(false);
    } catch (err) {
      // A created campaign stays as a draft the user can start from the list.
      setWizardError(
        created
          ? `A campanha foi salva como rascunho, mas não iniciou: ${err.message}`
          : err.message || 'Não foi possível criar a campanha.'
      );
    } finally {
      setSubmitting(false);
      fetchCampaigns();
    }
  };

  const runAction = async (camp, action) => {
    setBusyId(camp.id);
    setRowError((r) => ({ ...r, [camp.id]: '' }));
    try {
      await ApiClient.post(`/campaigns/${camp.id}/${action}`);
      await fetchCampaigns();
    } catch (err) {
      setRowError((r) => ({ ...r, [camp.id]: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === form.templateId);
  const selectedChannel = channels.find((c) => c.id === form.channelId);
  const selectedTag = tags.find((t) => t.id === form.tagId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <PageHeader
          description="Disparos em massa pelo WhatsApp oficial, com templates aprovados pela Meta e taxa de envio controlada."
          actions={
            <button type="button" onClick={openWizard} className="btn btn-primary">
              <Plus strokeWidth={2} />
              Nova campanha
            </button>
          }
        />

        {loadError && (
          <p role="alert" className="alert-error">{loadError}</p>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
          </div>
        ) : campaigns.length === 0 ? (
          !loadError && (
            <div className="glass-card px-6 py-14 text-center space-y-3">
              <Megaphone className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
              <h2 className="text-sm font-medium text-white">Nenhuma campanha ainda</h2>
              <p className="text-[13px] text-slate-400 max-w-md mx-auto">
                Envie um template aprovado para uma tag de contatos ou para uma lista importada de CSV.
              </p>
              <button type="button" onClick={openWizard} className="btn btn-primary mt-2">
                <Plus strokeWidth={2} />
                Nova campanha
              </button>
            </div>
          )
        ) : (
          <ul className="glass-card divide-y divide-white/[0.05]">
            {campaigns.map((camp) => {
              const total = camp.total_recipients || 0;
              const sent = camp.sent_recipients || 0;
              const failed = camp.failed_recipients || 0;
              const progress = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
              const st = statusConfig[camp.status] || statusConfig.draft;
              const busy = busyId === camp.id;
              return (
                <li key={camp.id} className="px-5 py-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h3 className="text-[13px] font-medium text-white truncate">{camp.name}</h3>
                    <span className={`px-2 h-5 inline-flex items-center rounded-md border text-[11px] ${st.cls}`}>{st.label}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{camp.rate_limit_per_minute} msg/min</span>
                    <div className="ml-auto flex items-center gap-2">
                      {camp.status === 'draft' && (
                        <button type="button" disabled={busy} onClick={() => runAction(camp, 'start')} className="btn btn-secondary">
                          <Play strokeWidth={1.75} />
                          Iniciar
                        </button>
                      )}
                      {(camp.status === 'processing' || camp.status === 'scheduled') && (
                        <button type="button" disabled={busy} onClick={() => runAction(camp, 'cancel')} className="btn btn-secondary">
                          <Square strokeWidth={1.75} />
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden flex">
                      <div className="h-full bg-accent-400 transition-[width] duration-500" style={{ width: `${total ? (sent / total) * 100 : 0}%` }} />
                      <div className="h-full bg-rose-400 transition-[width] duration-500" style={{ width: `${total ? (failed / total) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {sent} de {total} enviadas
                      {failed > 0 && <span className="text-rose-300"> · {failed} falharam</span>}
                      {total > 0 && <span> · {progress}%</span>}
                    </p>
                  </div>

                  {rowError[camp.id] && (
                    <p role="alert" className="text-xs text-rose-300">{rowError[camp.id]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showWizard && (
        <Modal
          title="Nova campanha"
          subtitle={`etapa ${step} de 3`}
          size="lg"
          onClose={closeWizard}
          onSubmit={handleSubmit}
          error={wizardError}
          footer={
            <>
              {step > 1 && (
                <button type="button" onClick={() => setStep(step - 1)} disabled={submitting} className="btn btn-secondary mr-auto">
                  <ArrowLeft strokeWidth={1.75} />
                  Voltar
                </button>
              )}
              {step < 3 ? (
                <button type="submit" disabled={!canAdvance} className="btn btn-primary">
                  Continuar
                  <ArrowRight strokeWidth={1.75} />
                </button>
              ) : (
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? <Loader2 className="animate-spin" /> : <Play strokeWidth={1.75} />}
                  {submitting ? 'Iniciando…' : 'Criar e iniciar envio'}
                </button>
              )}
            </>
          }
        >
              {step === 1 && (
                <>
                  <div>
                    <label htmlFor="camp-name" className="field-label">Nome</label>
                    <input
                      id="camp-name"
                      autoFocus
                      type="text"
                      placeholder="Ex.: Reativação de clientes"
                      value={form.name}
                      onChange={(e) => set({ name: e.target.value })}
                      className="field"
                    />
                  </div>
                  <div>
                    <label htmlFor="camp-channel" className="field-label">Canal</label>
                    {channels.length > 0 ? (
                      <select
                        id="camp-channel"
                        value={form.channelId}
                        onChange={(e) => set({ channelId: e.target.value, templateId: '' })}
                        className="field"
                      >
                        <option value="">Selecione um canal oficial</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id} disabled={ch.status !== 'active'}>
                            {ch.name}{ch.status !== 'active' ? ' (inativo)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[13px] text-amber-200/90">
                        Nenhum canal WhatsApp oficial conectado. Campanhas usam a Cloud API da Meta; conecte um canal em Canais.
                      </p>
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <span className="field-label">Público</span>
                    <div className="segmented" role="group" aria-label="Público">
                      <button type="button" aria-pressed={form.audience === 'tag'} onClick={() => set({ audience: 'tag' })}>
                        Por tag
                      </button>
                      <button type="button" aria-pressed={form.audience === 'csv'} onClick={() => set({ audience: 'csv' })}>
                        Planilha CSV
                      </button>
                    </div>
                  </div>

                  {form.audience === 'tag' ? (
                    <div>
                      <label htmlFor="camp-tag" className="field-label">Tag</label>
                      {tags.length > 0 ? (
                        <select id="camp-tag" value={form.tagId} onChange={(e) => set({ tagId: e.target.value })} className="field">
                          <option value="">Selecione uma tag</option>
                          {tags.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[13px] text-slate-400">Nenhuma tag criada. Marque conversas com tags ou importe um CSV.</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="field-label">Arquivo</span>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="w-full px-4 py-5 rounded-lg border border-dashed border-white/[0.12] hover:border-white/[0.2] text-center space-y-1 transition-colors"
                      >
                        <UploadCloud className="w-5 h-5 text-slate-400 mx-auto" strokeWidth={1.75} />
                        <span className="block text-[13px] text-slate-200">{form.file ? form.file.name : 'Escolher arquivo .csv'}</span>
                        <span className="block text-xs text-slate-500">Colunas: telefone, nome, email (separador , ou ;)</span>
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => set({ file: e.target.files?.[0] || null })}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="camp-template" className="field-label">Template aprovado</label>
                    {templates.length > 0 ? (
                      <select id="camp-template" value={form.templateId} onChange={(e) => set({ templateId: e.target.value })} className="field">
                        <option value="">Selecione um template</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} · {t.language}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[13px] text-slate-400">
                        Nenhum template aprovado para este canal. Sincronize ou envie um template em Templates Meta.
                      </p>
                    )}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-[13px]">
                    <dt className="text-slate-500">Campanha</dt>
                    <dd className="text-slate-200 truncate">{form.name}</dd>
                    <dt className="text-slate-500">Canal</dt>
                    <dd className="text-slate-200 truncate">{selectedChannel?.name}</dd>
                    <dt className="text-slate-500">Público</dt>
                    <dd className="text-slate-200 truncate">{form.audience === 'tag' ? `Tag ${selectedTag?.name || ''}` : form.file?.name}</dd>
                    <dt className="text-slate-500">Template</dt>
                    <dd className="text-slate-200 truncate">{selectedTemplate?.name}</dd>
                  </dl>

                  <div className="pt-4 border-t border-white/[0.06] space-y-2">
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="camp-rate" className="text-xs text-slate-300">Taxa de envio</label>
                      <span className="text-[13px] text-white tabular-nums">{form.rateLimit} msg/min</span>
                    </div>
                    <input
                      id="camp-rate"
                      type="range"
                      min="10"
                      max="120"
                      step="10"
                      value={form.rateLimit}
                      onChange={(e) => set({ rateLimit: Number(e.target.value) })}
                      className="w-full accent-accent-500 cursor-pointer"
                    />
                    <p className="text-xs text-slate-500">Taxas menores reduzem o risco de bloqueio do número pela Meta.</p>
                  </div>
                </>
              )}
        </Modal>
      )}
    </div>
  );
};

export default Campaigns;
