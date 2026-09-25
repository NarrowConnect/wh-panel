import React, { useState, useEffect } from 'react';
import { Plus, Search, LayoutGrid, Table as TableIcon, FolderPlus, SlidersHorizontal, Trash2, MessageSquare, Loader2, Kanban } from 'lucide-react';
import ApiClient from '../api/client';
import Modal from '../components/Modal';
import { normalizePhone } from '../lib/phone';

const statusLabels = { open: 'Em aberto', won: 'Ganho', lost: 'Perdido' };
const statusCls = {
  open: 'text-slate-300 border-white/[0.08]',
  won: 'text-emerald-300 border-emerald-500/25',
  lost: 'text-rose-300 border-rose-500/25',
};

const fieldTypes = { text: 'Texto', number: 'Número', date: 'Data', select: 'Lista de opções', boolean: 'Sim / Não', url: 'Link' };

const brl = (v, digits = 0) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });

const parseOptions = (options) => {
  try {
    if (Array.isArray(options)) return options;
    return JSON.parse(options || '[]');
  } catch {
    return [];
  }
};

const parseValues = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};

const formatValue = (field, value) => {
  if (field?.field_type === 'date' && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleDateString('pt-BR');
  if (field?.field_type === 'boolean') return value === 'true' || value === true ? 'Sim' : 'Não';
  return String(value);
};

const FieldInput = ({ field, value, onChange }) => {
  const id = `crm-cf-${field.key}`;
  const common = { id, value: value ?? '', onChange: (e) => onChange(e.target.value), className: 'field' };
  let control;
  if (field.field_type === 'select') {
    control = (
      <select {...common}>
        <option value="">Selecione</option>
        {parseOptions(field.options).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (field.field_type === 'boolean') {
    control = (
      <select {...common}>
        <option value="">Não informado</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  } else {
    const type = { date: 'date', number: 'number', url: 'url' }[field.field_type] || 'text';
    control = <input {...common} type={type} />;
  }
  return (
    <div>
      <label htmlFor={id} className="field-label">{field.name}</label>
      {control}
    </div>
  );
};

const emptyDeal = { title: '', value: '', stageId: '', contactName: '', contactPhone: '', contactEmail: '', custom: {} };

export const CRM = ({ onOpenChat }) => {
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState('');
  const [stages, setStages] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState('');

  const [viewMode, setViewMode] = useState('kanban');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modal, setModal] = useState(null); // 'deal' | 'pipeline' | 'stage' | 'fields' | 'card'
  const [deal, setDeal] = useState(emptyDeal);
  const [nameDraft, setNameDraft] = useState('');
  const [stageColor, setStageColor] = useState('#7468bd');
  const [fieldDraft, setFieldDraft] = useState({ name: '', type: 'text', options: '' });
  const [card, setCard] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadBoard = async (id) => {
    if (!id) return;
    setBoardLoading(true);
    try {
      const [board, fieldList] = await Promise.all([
        ApiClient.get(`/crm/pipelines/${id}/kanban`),
        ApiClient.get('/crm/custom-fields', { pipeline_id: id }),
      ]);
      setStages(Array.isArray(board) ? board : []);
      setFields(Array.isArray(fieldList) ? fieldList : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o funil.');
    } finally {
      setBoardLoading(false);
    }
  };

  const loadPipelines = async (selectId) => {
    try {
      const list = await ApiClient.get('/crm/pipelines');
      const pipes = Array.isArray(list) ? list : [];
      setPipelines(pipes);
      const next = selectId || pipelineId || (pipes.find((p) => p.is_default) || pipes[0])?.id || '';
      setPipelineId(next);
      if (next) await loadBoard(next);
      else setStages([]);
      setError('');
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os funis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipelines();
  }, []);

  const selectPipeline = (id) => {
    setPipelineId(id);
    loadBoard(id);
  };

  const open = (kind, payload) => {
    setFormError('');
    if (kind === 'deal') setDeal({ ...emptyDeal, stageId: payload || stages[0]?.id || '' });
    if (kind === 'pipeline' || kind === 'stage') setNameDraft('');
    if (kind === 'fields') setFieldDraft({ name: '', type: 'text', options: '' });
    if (kind === 'card') setCard({ ...payload, custom_values: parseValues(payload.custom_values) });
    setModal(kind);
  };

  const close = () => !submitting && setModal(null);

  const run = async (fn, fallback, keepOpen = false) => {
    setSubmitting(true);
    setFormError('');
    try {
      await fn();
      if (!keepOpen) setModal(null);
    } catch (err) {
      setFormError(err.message || fallback);
    } finally {
      setSubmitting(false);
    }
  };

  const createDeal = (e) => {
    e.preventDefault();
    const custom = Object.fromEntries(Object.entries(deal.custom).filter(([, v]) => v !== ''));
    const phone = deal.contactPhone.trim() ? normalizePhone(deal.contactPhone) : '';
    if (phone === null) {
      setFormError('Telefone do contato inválido. Informe DDD e número, por exemplo (11) 99999-8888.');
      return;
    }
    if (phone && !deal.contactName.trim()) {
      setFormError('Informe o nome do contato junto com o telefone.');
      return;
    }
    run(async () => {
      await ApiClient.post('/crm/cards', {
        pipeline_id: pipelineId,
        stage_id: deal.stageId,
        title: deal.title.trim(),
        value: parseFloat(deal.value) || 0,
        contact_name: deal.contactName.trim() || undefined,
        contact_phone: phone || undefined,
        contact_email: deal.contactEmail.trim() || undefined,
        custom_values: Object.keys(custom).length ? custom : undefined,
      });
      await loadBoard(pipelineId);
    }, 'Não foi possível criar a oportunidade.');
  };

  const createPipeline = (e) => {
    e.preventDefault();
    run(async () => {
      const created = await ApiClient.post('/crm/pipelines', { name: nameDraft.trim(), is_default: pipelines.length === 0 });
      await loadPipelines(created?.id);
    }, 'Não foi possível criar o funil.');
  };

  const createStage = (e) => {
    e.preventDefault();
    run(async () => {
      await ApiClient.post(`/crm/pipelines/${pipelineId}/stages`, { name: nameDraft.trim(), color: stageColor, order_index: stages.length + 1 });
      await loadBoard(pipelineId);
    }, 'Não foi possível criar a etapa.');
  };

  const createField = (e) => {
    e.preventDefault();
    const options = fieldDraft.type === 'select' ? fieldDraft.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
    run(
      async () => {
        await ApiClient.post('/crm/custom-fields', { name: fieldDraft.name.trim(), field_type: fieldDraft.type, options });
        setFieldDraft({ name: '', type: 'text', options: '' });
        await loadBoard(pipelineId);
      },
      'Não foi possível criar o campo.',
      true
    );
  };

  const deleteField = async (field) => {
    if (!window.confirm(`Excluir o campo "${field.name}"?`)) return;
    try {
      await ApiClient.delete(`/crm/custom-fields/${field.id}`);
      await loadBoard(pipelineId);
    } catch (err) {
      setFormError(err.message || 'Não foi possível excluir o campo.');
    }
  };

  const moveCard = async (c, stageId, status) => {
    try {
      await ApiClient.patch(`/crm/cards/${c.id}/move`, { stage_id: stageId, status });
      if (card?.id === c.id) setCard((prev) => ({ ...prev, stage_id: stageId, status }));
      await loadBoard(pipelineId);
    } catch (err) {
      setError(err.message || 'Não foi possível mover o card.');
    }
  };

  const saveCardFields = (e) => {
    e.preventDefault();
    run(async () => {
      await ApiClient.patch(`/crm/cards/${card.id}`, { custom_values: card.custom_values });
      await loadBoard(pipelineId);
    }, 'Não foi possível salvar o card.');
  };

  const matches = (c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [c.title, c.contact?.name, c.contact?.phone, ...Object.values(parseValues(c.custom_values))]
      .some((v) => v && String(v).toLowerCase().includes(term));
  };

  const allCards = stages.flatMap((s) => (s.cards || []).map((c) => ({ ...c, stage: s })));
  const openValue = allCards.filter((c) => c.status === 'open').reduce((a, c) => a + (c.value || 0), 0);
  const wonCards = allCards.filter((c) => c.status === 'won');
  const wonValue = wonCards.reduce((a, c) => a + (c.value || 0), 0);
  const winRate = allCards.length ? ((wonCards.length / allCards.length) * 100).toFixed(1) : '0';
  const fieldByKey = Object.fromEntries(fields.map((f) => [f.key, f]));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.length > 0 && (
            <>
              <select
                aria-label="Funil"
                value={pipelineId}
                onChange={(e) => selectPipeline(e.target.value)}
                className="field w-auto max-w-[16rem] h-8"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => open('pipeline')} className="btn btn-secondary btn-icon" title="Novo funil" aria-label="Novo funil">
                <FolderPlus strokeWidth={1.75} />
              </button>
              <div className="segmented" role="group" aria-label="Visualização">
                <button type="button" aria-pressed={viewMode === 'kanban'} onClick={() => setViewMode('kanban')}>
                  <LayoutGrid strokeWidth={1.75} />
                  Kanban
                </button>
                <button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>
                  <TableIcon strokeWidth={1.75} />
                  Lista
                </button>
              </div>
            </>
          )}
        </div>
        {pipelines.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => open('fields')} className="btn btn-secondary">
              <SlidersHorizontal strokeWidth={1.75} />
              Campos
              <span className="text-slate-500 tabular-nums">{fields.length}</span>
            </button>
            <button type="button" onClick={() => open('stage')} className="btn btn-secondary">
              <Plus strokeWidth={1.75} />
              Nova etapa
            </button>
            <button type="button" onClick={() => open('deal')} disabled={stages.length === 0} className="btn btn-primary">
              <Plus strokeWidth={2} />
              Nova oportunidade
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="alert-error flex-shrink-0">{error}</p>}

      {pipelines.length === 0 ? (
        !error && (
          <div className="glass-card px-6 py-14 text-center space-y-3">
            <Kanban className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
            <h2 className="text-sm font-medium text-white">Nenhum funil ainda</h2>
            <p className="text-[13px] text-slate-400 max-w-md mx-auto">
              Um funil organiza suas oportunidades em etapas, do primeiro contato ao fechamento.
            </p>
            <button type="button" onClick={() => open('pipeline')} className="btn btn-primary mt-2">
              <Plus strokeWidth={2} />
              Criar funil
            </button>
          </div>
        )
      ) : (
        <>
          {/* Filters + summary */}
          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
              <input
                type="search"
                aria-label="Buscar oportunidades"
                placeholder="Buscar por título, contato ou campo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field h-8 pl-8"
              />
            </div>
            <div className="segmented" role="group" aria-label="Status">
              {[['all', 'Todos'], ['open', 'Em aberto'], ['won', 'Ganhos'], ['lost', 'Perdidos']].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={statusFilter === id} onClick={() => setStatusFilter(id)}>{label}</button>
              ))}
            </div>
            <p className="ml-auto text-xs text-slate-500 tabular-nums">
              {allCards.length} {allCards.length === 1 ? 'oportunidade' : 'oportunidades'} ·{' '}
              <span className="text-slate-300">{brl(openValue)}</span> em aberto ·{' '}
              <span className="text-emerald-300">{brl(wonValue)}</span> ganhos · {winRate}% conversão
            </p>
          </div>

          {stages.length === 0 ? (
            <div className="glass-card px-6 py-14 text-center space-y-3">
              <h2 className="text-sm font-medium text-white">Este funil ainda não tem etapas</h2>
              <p className="text-[13px] text-slate-400 max-w-md mx-auto">Adicione etapas como Novo lead, Proposta e Negociação.</p>
              <button type="button" onClick={() => open('stage')} className="btn btn-primary mt-2">
                <Plus strokeWidth={2} />
                Nova etapa
              </button>
            </div>
          ) : viewMode === 'kanban' ? (
            <div className={`flex-1 min-h-0 flex gap-3 overflow-x-auto pb-2 items-start transition-opacity ${boardLoading ? 'opacity-60' : ''}`}>
              {stages.map((stage) => {
                const cards = (stage.cards || []).filter(matches);
                const stageValue = (stage.cards || []).reduce((a, c) => a + (c.value || 0), 0);
                return (
                  <section key={stage.id} className="w-72 flex-shrink-0 max-h-full flex flex-col rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <header className="flex items-center gap-2 px-3 h-10 border-b border-white/[0.05]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color || '#7468bd' }} />
                      <h3 className="text-[13px] font-medium text-white truncate">{stage.name}</h3>
                      <span className="text-xs text-slate-500 tabular-nums">{cards.length}</span>
                      <span className="ml-auto text-xs text-slate-400 tabular-nums">{brl(stageValue)}</span>
                    </header>

                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                      {cards.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-600">Nenhuma oportunidade</p>
                      ) : (
                        cards.map((c) => {
                          const values = Object.entries(parseValues(c.custom_values)).filter(([, v]) => v !== '' && v != null);
                          return (
                            <article key={c.id} className="rounded-lg bg-surface border border-white/[0.06] hover:border-white/[0.14] transition-colors">
                              <button type="button" onClick={() => open('card', { ...c, stage_id: stage.id })} className="w-full text-left p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-[13px] text-white line-clamp-2">{c.title}</h4>
                                  <span className="text-xs text-slate-300 tabular-nums flex-shrink-0">{brl(c.value)}</span>
                                </div>
                                {c.contact?.name && <p className="text-xs text-slate-400 truncate">{c.contact.name}</p>}
                                {(values.length > 0 || c.status !== 'open') && (
                                  <div className="flex flex-wrap gap-1">
                                    {c.status !== 'open' && (
                                      <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${statusCls[c.status]}`}>{statusLabels[c.status]}</span>
                                    )}
                                    {values.slice(0, 2).map(([k, v]) => (
                                      <span key={k} className="px-1.5 h-5 inline-flex items-center rounded-md bg-white/[0.04] text-[11px] text-slate-300 max-w-full truncate">
                                        {formatValue(fieldByKey[k], v)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </button>
                              <div className="px-3 pb-2.5">
                                <select
                                  aria-label={`Mover ${c.title}`}
                                  value={stage.id}
                                  onChange={(e) => moveCard(c, e.target.value, c.status)}
                                  className="w-full h-7 rounded-md bg-transparent border border-white/[0.06] px-1.5 text-[11px] text-slate-400 focus:outline-none focus:border-accent-400"
                                >
                                  {stages.map((s) => (
                                    <option key={s.id} value={s.id}>{s.id === stage.id ? s.name : `Mover para ${s.name}`}</option>
                                  ))}
                                </select>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => open('deal', stage.id)}
                      className="flex items-center justify-center gap-1.5 h-9 border-t border-white/[0.05] text-xs text-slate-400 hover:text-white hover:bg-white/[0.02] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Adicionar
                    </button>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto glass-card">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-normal">Oportunidade</th>
                    <th className="px-4 py-2.5 font-normal">Contato</th>
                    <th className="px-4 py-2.5 font-normal">Etapa</th>
                    <th className="px-4 py-2.5 font-normal text-right">Valor</th>
                    <th className="px-4 py-2.5 font-normal">Status</th>
                    {fields.slice(0, 3).map((f) => (
                      <th key={f.id} className="px-4 py-2.5 font-normal">{f.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                  {allCards.filter(matches).map((c) => {
                    const values = parseValues(c.custom_values);
                    return (
                      <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => open('card', { ...c, stage_id: c.stage.id })} className="text-left text-slate-100 hover:text-white">
                            {c.title}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{c.contact?.name || '–'}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.stage.color || '#7468bd' }} />
                            {c.stage.name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-200 tabular-nums">{brl(c.value, 2)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${statusCls[c.status] || statusCls.open}`}>
                            {statusLabels[c.status] || c.status}
                          </span>
                        </td>
                        {fields.slice(0, 3).map((f) => (
                          <td key={f.id} className="px-4 py-2.5 text-slate-400">{values[f.key] ? formatValue(f, values[f.key]) : '–'}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal === 'deal' && (
        <Modal title="Nova oportunidade" size="lg" onClose={close} onSubmit={createDeal} submitting={submitting} submitLabel="Criar oportunidade" error={formError}>
          <div>
            <label htmlFor="deal-title" className="field-label">Título</label>
            <input id="deal-title" autoFocus required type="text" value={deal.title} onChange={(e) => setDeal({ ...deal, title: e.target.value })} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="deal-value" className="field-label">Valor (R$)</label>
              <input id="deal-value" type="number" min="0" step="0.01" value={deal.value} onChange={(e) => setDeal({ ...deal, value: e.target.value })} className="field tabular-nums" />
            </div>
            <div>
              <label htmlFor="deal-stage" className="field-label">Etapa</label>
              <select id="deal-stage" value={deal.stageId} onChange={(e) => setDeal({ ...deal, stageId: e.target.value })} className="field">
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="pt-4 border-t border-white/[0.06] space-y-3">
            <legend className="field-label">Contato <span className="text-slate-500">(opcional; se o telefone já estiver em Contatos, o card é ligado a ele)</span></legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input aria-label="Nome do contato" placeholder="Nome" value={deal.contactName} onChange={(e) => setDeal({ ...deal, contactName: e.target.value })} className="field" />
              <input aria-label="Telefone do contato" type="tel" placeholder="+55 11 99999-8888" value={deal.contactPhone} onChange={(e) => setDeal({ ...deal, contactPhone: e.target.value })} className="field tabular-nums" />
              <input aria-label="E-mail do contato" type="email" placeholder="E-mail" value={deal.contactEmail} onChange={(e) => setDeal({ ...deal, contactEmail: e.target.value })} className="field" />
            </div>
          </fieldset>
          {fields.length > 0 && (
            <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((f) => (
                <FieldInput key={f.id} field={f} value={deal.custom[f.key]} onChange={(v) => setDeal((d) => ({ ...d, custom: { ...d.custom, [f.key]: v } }))} />
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal === 'pipeline' && (
        <Modal title="Novo funil" onClose={close} onSubmit={createPipeline} submitting={submitting} submitLabel="Criar funil" error={formError}>
          <div>
            <label htmlFor="pipe-name" className="field-label">Nome</label>
            <input id="pipe-name" autoFocus required type="text" placeholder="Ex.: Vendas B2B" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="field" />
          </div>
        </Modal>
      )}

      {modal === 'stage' && (
        <Modal title="Nova etapa" onClose={close} onSubmit={createStage} submitting={submitting} submitLabel="Criar etapa" error={formError}>
          <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
            <div>
              <label htmlFor="stage-name" className="field-label">Nome</label>
              <input id="stage-name" autoFocus required type="text" placeholder="Ex.: Proposta enviada" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="field" />
            </div>
            <div>
              <label htmlFor="stage-color" className="field-label">Cor</label>
              <input id="stage-color" type="color" value={stageColor} onChange={(e) => setStageColor(e.target.value)} className="h-9 w-12 rounded-lg bg-transparent border border-white/[0.08] cursor-pointer" />
            </div>
          </div>
        </Modal>
      )}

      {modal === 'fields' && (
        <Modal title="Campos das oportunidades" size="lg" onClose={close} onSubmit={createField} submitting={submitting} submitLabel="Adicionar campo" error={formError}>
          {fields.length > 0 ? (
            <ul className="-mx-5 -mt-1 divide-y divide-white/[0.05] border-b border-white/[0.06]">
              {fields.map((f) => (
                <li key={f.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white">{f.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      <span className="font-mono">{f.key}</span> · {fieldTypes[f.field_type] || f.field_type}
                      {parseOptions(f.options).length > 0 && ` · ${parseOptions(f.options).join(', ')}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => deleteField(f)} className="btn btn-icon text-slate-500 hover:text-rose-300" aria-label={`Excluir campo ${f.name}`} title="Excluir">
                    <Trash2 strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-slate-400">Nenhum campo ainda. Campos aparecem no cadastro e nos cards das oportunidades.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="crm-field-name" className="field-label">Nome do campo</label>
              <input id="crm-field-name" required type="text" placeholder="Ex.: Previsão de fechamento" value={fieldDraft.name} onChange={(e) => setFieldDraft({ ...fieldDraft, name: e.target.value })} className="field" />
            </div>
            <div>
              <label htmlFor="crm-field-type" className="field-label">Tipo</label>
              <select id="crm-field-type" value={fieldDraft.type} onChange={(e) => setFieldDraft({ ...fieldDraft, type: e.target.value })} className="field">
                {Object.entries(fieldTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          </div>
          {fieldDraft.type === 'select' && (
            <div>
              <label htmlFor="crm-field-options" className="field-label">Opções, separadas por vírgula</label>
              <input id="crm-field-options" required type="text" value={fieldDraft.options} onChange={(e) => setFieldDraft({ ...fieldDraft, options: e.target.value })} className="field" />
            </div>
          )}
        </Modal>
      )}

      {modal === 'card' && card && (
        <Modal
          title={card.title}
          size="lg"
          onClose={close}
          onSubmit={saveCardFields}
          submitting={submitting}
          error={formError}
          footer={
            <>
              {onOpenChat && card.contact && (
                <button type="button" onClick={() => { setModal(null); onOpenChat(); }} className="btn btn-secondary mr-auto">
                  <MessageSquare strokeWidth={1.75} />
                  Ir para Conversas
                </button>
              )}
              <button type="button" onClick={close} className="btn btn-secondary">Fechar</button>
              {fields.length > 0 && (
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting && <Loader2 className="animate-spin" />}
                  Salvar campos
                </button>
              )}
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="field-label">Valor</p>
              <p className="h-9 flex items-center text-[15px] text-white tabular-nums">{brl(card.value, 2)}</p>
            </div>
            <div>
              <label htmlFor="card-stage" className="field-label">Etapa</label>
              <select id="card-stage" value={card.stage_id} onChange={(e) => moveCard(card, e.target.value, card.status)} className="field">
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="card-status" className="field-label">Status</label>
              <select id="card-status" value={card.status || 'open'} onChange={(e) => moveCard(card, card.stage_id, e.target.value)} className="field">
                {Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          </div>

          {card.contact && (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="field-label">Contato</p>
              <p className="text-[13px] text-white">{card.contact.name}</p>
              <p className="text-xs text-slate-400 tabular-nums">
                {[card.contact.phone, card.contact.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}

          {fields.length > 0 && (
            <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  value={card.custom_values?.[f.key]}
                  onChange={(v) => setCard((prev) => ({ ...prev, custom_values: { ...prev.custom_values, [f.key]: v } }))}
                />
              ))}
            </div>
          )}

          {card.created_at && (
            <p className="text-xs text-slate-500">Criada em {new Date(card.created_at).toLocaleString('pt-BR')}</p>
          )}
        </Modal>
      )}
    </div>
  );
};

export default CRM;
