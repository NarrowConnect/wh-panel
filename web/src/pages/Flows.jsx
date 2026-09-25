import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Workflow, Plus, Trash2, Search, Copy, Loader2, Zap } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { starterDefinition, summarize, toCanvas, toDefinition } from './flows/catalog';

// The canvas library is only downloaded when a flow is opened.
const FlowEditor = lazy(() => import('./flows/FlowEditor'));

const statusLabels = { active: 'Ativo', draft: 'Rascunho', inactive: 'Inativo' };
const statusCls = (s) => (s === 'active' ? 'text-emerald-300 border-emerald-500/25' : 'text-slate-400 border-white/[0.08]');

// List rows only need the step count and what starts the flow.
const describe = (f) => {
  const { nodes } = toCanvas(f.definition_json);
  const trigger = nodes.find((n) => n.type === 'trigger');
  return {
    steps: nodes.filter((n) => n.type !== 'trigger').length,
    trigger: trigger ? summarize('trigger', trigger.data.config) : '',
  };
};

export const Flows = () => {
  const [flowsList, setFlowsList] = useState([]);
  const [openFlow, setOpenFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [searchFlows, setSearchFlows] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDesc, setNewFlowDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchFlows = async () => {
    try {
      const data = await ApiClient.get('/flows');
      setFlowsList((Array.isArray(data) ? data : []).map((f) => ({ ...f, description: f.description || '', status: f.status || 'draft', ...describe(f) })));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Não foi possível carregar os fluxos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  const withBusy = async (flowId, fn, fallback) => {
    setBusyId(flowId);
    try {
      await fn();
      await fetchFlows();
    } catch (err) {
      const problems = Array.isArray(err.data?.problems) ? ` ${err.data.problems.join(' · ')}` : '';
      setLoadError(`${err.message || fallback}${problems}`);
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = (flow) => {
    const status = flow.status === 'active' ? 'inactive' : 'active';
    withBusy(flow.id, () => ApiClient.put(`/flows/${flow.id}`, { status }), 'Não foi possível alterar o status.');
  };

  const duplicate = (flow) => {
    const { nodes, edges } = toCanvas(flow.definition_json);
    withBusy(
      flow.id,
      () => ApiClient.post('/flows', { name: `${flow.name} (cópia)`, description: flow.description || null, definition: toDefinition(nodes, edges) }),
      'Não foi possível duplicar o fluxo.'
    );
  };

  const remove = (flow) => {
    if (!window.confirm(`Excluir o fluxo "${flow.name}"? Execuções em andamento serão encerradas.`)) return;
    withBusy(flow.id, () => ApiClient.delete(`/flows/${flow.id}`), 'Não foi possível excluir o fluxo.');
  };

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const created = await ApiClient.post('/flows', {
        name: newFlowName.trim(),
        description: newFlowDesc.trim() || null,
        definition: starterDefinition(),
      });
      setShowCreate(false);
      setNewFlowName('');
      setNewFlowDesc('');
      fetchFlows();
      if (created?.id) setOpenFlow(created);
    } catch (err) {
      setCreateError(err.message || 'Não foi possível criar o fluxo.');
    } finally {
      setCreating(false);
    }
  };

  const filtered = flowsList.filter((f) => {
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (!searchFlows.trim()) return true;
    const term = searchFlows.toLowerCase();
    return f.name.toLowerCase().includes(term) || f.description.toLowerCase().includes(term);
  });
  const activeCount = flowsList.filter((f) => f.status === 'active').length;

  if (openFlow) {
    return (
      <div className="h-full flex flex-col p-4 md:p-6 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando editor" />
            </div>
          }
        >
          <FlowEditor
            key={openFlow.id}
            flow={openFlow}
            onSaved={fetchFlows}
            onBack={() => {
              setOpenFlow(null);
              fetchFlows();
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4 overflow-y-auto">
      <PageHeader
        description="Automações que atendem sozinhas: dão boas-vindas, fazem perguntas, decidem o caminho, chamam a IA e entregam a conversa para a fila certa."
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setShowCreate(true);
            }}
            className="btn btn-primary"
          >
            <Plus strokeWidth={2} />
            Novo fluxo
          </button>
        }
      />

      {loadError && <p role="alert" className="alert-error">{loadError}</p>}

      {flowsList.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
            <input
              type="search"
              aria-label="Buscar fluxos"
              placeholder="Buscar por nome ou descrição"
              value={searchFlows}
              onChange={(e) => setSearchFlows(e.target.value)}
              className="field h-8 pl-8"
            />
          </div>
          <div className="segmented" role="group" aria-label="Status">
            {[
              ['all', 'Todos'],
              ['active', 'Ativos'],
              ['draft', 'Rascunhos'],
              ['inactive', 'Inativos'],
            ].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filterStatus === id} onClick={() => setFilterStatus(id)}>
                {label}
              </button>
            ))}
          </div>
          <p className="ml-auto text-xs text-slate-500 tabular-nums">
            {flowsList.length} {flowsList.length === 1 ? 'fluxo' : 'fluxos'} · {activeCount} {activeCount === 1 ? 'ativo' : 'ativos'}
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
        </div>
      ) : filtered.length === 0 ? (
        !loadError && (
          <div className="glass-card px-6 py-14 text-center space-y-3">
            <Workflow className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
            <h2 className="text-sm font-medium text-white">{flowsList.length ? 'Nenhum fluxo encontrado' : 'Nenhum fluxo ainda'}</h2>
            <p className="text-[13px] text-slate-400 max-w-md mx-auto">
              {flowsList.length
                ? 'Ajuste a busca ou o filtro de status.'
                : 'Monte no canvas o caminho que uma conversa percorre antes de chegar a um atendente: boas-vindas, perguntas, condições e IA.'}
            </p>
            {!flowsList.length && (
              <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary mt-2">
                <Plus strokeWidth={2} />
                Novo fluxo
              </button>
            )}
          </div>
        )
      ) : (
        <ul className="glass-card divide-y divide-white/[0.05]">
          {filtered.map((flow) => {
            const isActive = flow.status === 'active';
            return (
              <li key={flow.id} className="px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" onClick={() => setOpenFlow(flow)} className="min-w-0 flex-1 text-left group">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white group-hover:underline underline-offset-4 decoration-white/30 truncate">{flow.name}</span>
                    <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${statusCls(flow.status)}`}>{statusLabels[flow.status] || flow.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                    {flow.trigger && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Zap className="w-3 h-3" strokeWidth={1.9} />
                        {flow.trigger}
                      </span>
                    )}
                    <span>
                      {flow.trigger && '· '}
                      {flow.steps} {flow.steps === 1 ? 'etapa' : 'etapas'}
                      {flow.updated_at && ` · atualizado em ${new Date(flow.updated_at).toLocaleDateString('pt-BR')}`}
                      {flow.description && ` · ${flow.description}`}
                    </span>
                  </p>
                </button>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={busyId === flow.id} onClick={() => toggleStatus(flow)} className="btn btn-secondary">
                    {busyId === flow.id && <Loader2 className="animate-spin" />}
                    {isActive ? 'Desativar' : 'Ativar'}
                  </button>
                  <button type="button" disabled={busyId === flow.id} onClick={() => duplicate(flow)} className="btn btn-icon text-slate-500 hover:text-white" aria-label={`Duplicar ${flow.name}`} title="Duplicar">
                    <Copy strokeWidth={1.75} />
                  </button>
                  <button type="button" disabled={busyId === flow.id} onClick={() => remove(flow)} className="btn btn-icon text-slate-500 hover:text-rose-300" aria-label={`Excluir ${flow.name}`} title="Excluir">
                    <Trash2 strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && (
        <Modal
          title="Novo fluxo"
          onClose={() => !creating && setShowCreate(false)}
          onSubmit={create}
          submitting={creating}
          submitLabel="Criar e abrir"
          error={createError}
        >
          <div>
            <label htmlFor="flow-name" className="field-label">Nome</label>
            <input id="flow-name" autoFocus required type="text" maxLength={120} placeholder="Ex.: Triagem de novos contatos" value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="flow-desc" className="field-label">
              Descrição <span className="text-slate-500">(opcional)</span>
            </label>
            <textarea id="flow-desc" rows={2} value={newFlowDesc} onChange={(e) => setNewFlowDesc(e.target.value)} className="field" />
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Flows;
