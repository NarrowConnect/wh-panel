import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Plus,
  Play,
  Save,
  Trash2,
  Bot,
  MessageSquare,
  Layers,
  Filter,
  ArrowRight,
  ArrowLeft,
  Search,
  Copy,
  Settings,
  Send,
  Kanban,
  RefreshCw,
  Loader2,
  Check
} from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const CONDITION_OPERATOR_LABELS = {
  equals: 'é igual a',
  not_equals: 'é diferente de',
  contains: 'contém',
  gte: 'é maior ou igual a',
  lte: 'é menor ou igual a',
};

const statusLabels = { active: 'Ativo', draft: 'Rascunho', inactive: 'Inativo' };

const defaultTitles = {
  message: 'Enviar mensagem',
  condition: 'Condição',
  transfer_queue: 'Transferir para fila',
  crm_stage: 'Mover no CRM',
  ai_agent: 'Agente IA',
};

const parseDefinition = (raw) => {
  try {
    const def = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Flows saved before titles were persisted come back without one.
    const nodes = (def?.nodes || []).map((n) => ({ ...n, title: n.title || defaultTitles[n.type] || 'Etapa', data: n.data || {} }));
    return { nodes, edges: def?.edges || [] };
  } catch {
    return { nodes: [], edges: [] };
  }
};

const toFlow = (f) => {
  const definition = parseDefinition(f.definition_json);
  return {
    id: f.id,
    name: f.name,
    description: f.description || '',
    status: f.status || 'draft',
    updated_at: f.updated_at,
    definition,
  };
};

// The engine walks edges from node to node; the canvas is a single line, so
// each step points to the next one.
const sequentialEdges = (nodes) =>
  nodes.slice(0, -1).map((n, i) => ({ id: `e_${n.id}_${nodes[i + 1].id}`, source: n.id, target: nodes[i + 1].id }));

export const Flows = () => {
  // 'list' shows the flows; 'editor' opens one on the canvas.
  const [screenMode, setScreenMode] = useState('list');

  const [flowsList, setFlowsList] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState(null); // { ok, text }
  const [busyId, setBusyId] = useState(null);
  const [searchFlows, setSearchFlows] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Editor sub-tab: 'canvas' | 'simulator'
  const [editorTab, setEditorTab] = useState('canvas');

  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [queues, setQueues] = useState([]);

  const [showCreateFlowModal, setShowCreateFlowModal] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDesc, setNewFlowDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const simIntro = { sender: 'system', text: 'Pré-visualização iniciada' };
  const [simMessages, setSimMessages] = useState([simIntro]);
  const [simInput, setSimInput] = useState('');
  const [simStepIndex, setSimStepIndex] = useState(0);

  const fetchFlowsData = async () => {
    try {
      const data = await ApiClient.get('/flows');
      setFlowsList((Array.isArray(data) ? data : []).map(toFlow));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Não foi possível carregar os fluxos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlowsData();
    ApiClient.get('/queues')
      .then((d) => setQueues(Array.isArray(d) ? d : d?.queues || []))
      .catch(() => {});
  }, []);

  const handleOpenFlow = (flow) => {
    setSelectedFlow(flow);
    setNodes(flow.definition?.nodes || []);
    setSelectedNode(flow.definition?.nodes?.[0] || null);
    setEditorTab('canvas');
    setSaveState(null);
    setSimMessages([simIntro]);
    setSimStepIndex(0);
    setScreenMode('editor');
  };

  const withBusy = async (flowId, fn, fallback) => {
    setBusyId(flowId);
    try {
      await fn();
      await fetchFlowsData();
    } catch (err) {
      setLoadError(err.message || fallback);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleFlowStatus = (flow, e) => {
    e.stopPropagation();
    const status = flow.status === 'active' ? 'inactive' : 'active';
    withBusy(flow.id, () => ApiClient.put(`/flows/${flow.id}`, { name: flow.name, description: flow.description, status }), 'Não foi possível alterar o status.');
  };

  const handleDuplicateFlow = (flow, e) => {
    e.stopPropagation();
    withBusy(
      flow.id,
      () => ApiClient.post('/flows', { name: `${flow.name} (cópia)`, description: flow.description, definition: flow.definition }),
      'Não foi possível duplicar o fluxo.'
    );
  };

  const handleDeleteFlow = (flow, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir o fluxo "${flow.name}"?`)) return;
    withBusy(flow.id, () => ApiClient.delete(`/flows/${flow.id}`), 'Não foi possível excluir o fluxo.');
  };

  const handleCreateNewFlow = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const created = await ApiClient.post('/flows', {
        name: newFlowName.trim(),
        description: newFlowDesc.trim() || null,
        definition: { nodes: [], edges: [] },
      });
      setShowCreateFlowModal(false);
      setNewFlowName('');
      setNewFlowDesc('');
      await fetchFlowsData();
      if (created?.id) handleOpenFlow(toFlow(created));
    } catch (err) {
      setCreateError(err.message || 'Não foi possível criar o fluxo.');
    } finally {
      setCreating(false);
    }
  };

  const handleAddNode = (type) => {
    const typeConfig = {
      ai_agent: {
        title: 'Agente IA',
        data: { persona: '', instructions: '' },
      },
      message: {
        title: 'Enviar mensagem',
        data: { text: '' },
      },
      condition: {
        title: 'Condição',
        data: { field: '', operator: 'equals', value: '' },
      },
      transfer_queue: {
        title: 'Transferir para fila',
        data: { queue_id: queues[0]?.id || '' },
      },
      crm_stage: {
        title: 'Mover no CRM',
        data: { stage_name: '' },
      },
    }[type];

    const newNode = {
      id: `n_${Date.now()}`,
      type,
      title: typeConfig?.title || 'Nova etapa',
      data: typeConfig?.data || {},
      position: { x: 80 + nodes.length * 40, y: 140 + (nodes.length % 2) * 50 },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNode(newNode);
  };

  const updateNode = (patch) => {
    const next = { ...selectedNode, ...patch };
    setNodes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
    setSelectedNode(next);
    setSaveState(null);
  };

  const updateNodeData = (patch) => updateNode({ data: { ...selectedNode.data, ...patch } });

  const handleSaveFlow = async () => {
    setSaving(true);
    setSaveState(null);
    const definition = { nodes, edges: sequentialEdges(nodes) };
    try {
      await ApiClient.put(`/flows/${selectedFlow.id}`, {
        name: selectedFlow.name,
        description: selectedFlow.description,
        status: selectedFlow.status,
        definition,
      });
      setSelectedFlow((prev) => ({ ...prev, definition }));
      setSaveState({ ok: true, text: 'Salvo' });
      fetchFlowsData();
    } catch (err) {
      setSaveState({ ok: false, text: err.message || 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  // Local walk-through of the configured steps; nothing is sent or executed.
  const handleSimSend = (e) => {
    e.preventDefault();
    if (!simInput.trim()) return;

    const userText = simInput;
    setSimMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setSimInput('');

    const node = nodes[simStepIndex];
    let reply;
    if (!node) {
      reply = { sender: 'system', text: nodes.length ? 'Fim do fluxo' : 'Adicione etapas ao fluxo para pré-visualizar' };
    } else if (node.type === 'message') {
      reply = { sender: 'bot', text: node.data?.text || '(mensagem vazia)' };
    } else if (node.type === 'ai_agent') {
      reply = { sender: 'system', text: `Etapa "${node.title}": o agente de IA responderia aqui` };
    } else if (node.type === 'transfer_queue') {
      const q = queues.find((x) => x.id === node.data?.queue_id);
      reply = { sender: 'system', text: `Transferência para a fila ${q?.name || 'não definida'}` };
    } else if (node.type === 'condition') {
      reply = { sender: 'system', text: `Condição: ${node.data?.field || '?'} ${CONDITION_OPERATOR_LABELS[node.data?.operator] || ''} ${node.data?.value || ''}` };
    } else if (node.type === 'crm_stage') {
      reply = { sender: 'system', text: `Card movido para a etapa ${node.data?.stage_name || 'não definida'}` };
    } else {
      reply = { sender: 'system', text: `Etapa "${node.title}"` };
    }
    setSimMessages((prev) => [...prev, reply]);
    setSimStepIndex((prev) => prev + 1);
  };

  const filteredFlows = flowsList.filter((f) => {
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (!searchFlows.trim()) return true;
    const term = searchFlows.toLowerCase();
    return f.name.toLowerCase().includes(term) || f.description.toLowerCase().includes(term);
  });

  const activeFlowsCount = flowsList.filter((f) => f.status === 'active').length;

  const statusCls = (s) =>
    s === 'active' ? 'text-emerald-300 border-emerald-500/25' : 'text-slate-400 border-white/[0.08]';

  return (
    <div className="h-full flex flex-col p-6 gap-4 overflow-hidden">
      {screenMode === 'list' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
          <PageHeader
            description="Fluxos automatizam etapas da conversa: mensagens, condições, transferência para filas e movimentação no CRM."
            actions={
              <button type="button" onClick={() => { setCreateError(''); setShowCreateFlowModal(true); }} className="btn btn-primary">
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
                {[['all', 'Todos'], ['active', 'Ativos'], ['draft', 'Rascunhos'], ['inactive', 'Inativos']].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={filterStatus === id} onClick={() => setFilterStatus(id)}>{label}</button>
                ))}
              </div>
              <p className="ml-auto text-xs text-slate-500 tabular-nums">
                {flowsList.length} {flowsList.length === 1 ? 'fluxo' : 'fluxos'} · {activeFlowsCount} {activeFlowsCount === 1 ? 'ativo' : 'ativos'}
              </p>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
            </div>
          ) : filteredFlows.length === 0 ? (
            !loadError && (
              <div className="glass-card px-6 py-14 text-center space-y-3">
                <Workflow className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
                <h2 className="text-sm font-medium text-white">{flowsList.length ? 'Nenhum fluxo encontrado' : 'Nenhum fluxo ainda'}</h2>
                <p className="text-[13px] text-slate-400 max-w-md mx-auto">
                  {flowsList.length
                    ? 'Ajuste a busca ou o filtro de status.'
                    : 'Monte a sequência de etapas que uma conversa deve percorrer antes de chegar a um atendente.'}
                </p>
                {!flowsList.length && (
                  <button type="button" onClick={() => setShowCreateFlowModal(true)} className="btn btn-primary mt-2">
                    <Plus strokeWidth={2} />
                    Novo fluxo
                  </button>
                )}
              </div>
            )
          ) : (
            <ul className="glass-card divide-y divide-white/[0.05]">
              {filteredFlows.map((flow) => {
                const isActive = flow.status === 'active';
                const steps = flow.definition?.nodes?.length || 0;
                return (
                  <li key={flow.id} className="px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button type="button" onClick={() => handleOpenFlow(flow)} className="min-w-0 flex-1 text-left group">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white group-hover:underline underline-offset-4 decoration-white/30 truncate">{flow.name}</span>
                        <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${statusCls(flow.status)}`}>{statusLabels[flow.status] || flow.status}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {steps} {steps === 1 ? 'etapa' : 'etapas'}
                        {flow.updated_at && ` · atualizado em ${new Date(flow.updated_at).toLocaleDateString('pt-BR')}`}
                        {flow.description && ` · ${flow.description}`}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={busyId === flow.id} onClick={(e) => handleToggleFlowStatus(flow, e)} className="btn btn-secondary">
                        {isActive ? 'Desativar' : 'Ativar'}
                      </button>
                      <button type="button" disabled={busyId === flow.id} onClick={(e) => handleDuplicateFlow(flow, e)} className="btn btn-icon text-slate-500 hover:text-white" aria-label={`Duplicar ${flow.name}`} title="Duplicar">
                        <Copy strokeWidth={1.75} />
                      </button>
                      <button type="button" disabled={busyId === flow.id} onClick={(e) => handleDeleteFlow(flow, e)} className="btn btn-icon text-slate-500 hover:text-rose-300" aria-label={`Excluir ${flow.name}`} title="Excluir">
                        <Trash2 strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {screenMode === 'editor' && selectedFlow && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={() => setScreenMode('list')} className="btn btn-secondary">
                <ArrowLeft strokeWidth={1.75} />
                Fluxos
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-medium text-white truncate">{selectedFlow.name}</h2>
                  <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${statusCls(selectedFlow.status)}`}>
                    {statusLabels[selectedFlow.status] || selectedFlow.status}
                  </span>
                </div>
                {selectedFlow.description && <p className="text-xs text-slate-500 truncate">{selectedFlow.description}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {saveState && (
                <span role="status" className={`text-xs ${saveState.ok ? 'text-emerald-300' : 'text-rose-300'} inline-flex items-center gap-1`}>
                  {saveState.ok && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                  {saveState.text}
                </span>
              )}
              <div className="segmented" role="group" aria-label="Editor">
                <button type="button" aria-pressed={editorTab === 'canvas'} onClick={() => setEditorTab('canvas')}>
                  <Workflow strokeWidth={1.75} />
                  Etapas
                </button>
                <button type="button" aria-pressed={editorTab === 'simulator'} onClick={() => setEditorTab('simulator')}>
                  <Play strokeWidth={1.75} />
                  Pré-visualizar
                </button>
              </div>
              <button type="button" onClick={handleSaveFlow} disabled={saving} className="btn btn-primary">
                {saving ? <Loader2 className="animate-spin" /> : <Save strokeWidth={1.75} />}
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>

          {editorTab === 'canvas' && (
            <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
              {/* Step palette */}
              <div className="w-56 glass-card p-2 flex flex-col gap-px flex-shrink-0 overflow-y-auto">
                <p className="px-2 pt-1 pb-2 text-xs text-slate-400">Adicionar etapa</p>
                {[
                  ['message', MessageSquare, 'Enviar mensagem', 'Texto para o contato'],
                  ['condition', Filter, 'Condição', 'Compara um campo do contato'],
                  ['transfer_queue', Layers, 'Transferir para fila', 'Entrega a um atendente'],
                  ['crm_stage', Kanban, 'Mover no CRM', 'Muda a etapa do card'],
                  ['ai_agent', Bot, 'Agente IA', 'Instruções para o agente'],
                ].map(([type, Icon, label, hint]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleAddNode(type)}
                    className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <Icon className="w-4 h-4 mt-px text-slate-400 flex-shrink-0" strokeWidth={1.75} />
                    <span>
                      <span className="block text-[13px] text-slate-200">{label}</span>
                      <span className="block text-[11px] text-slate-500">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              {/* Interactive Visual Canvas Area */}
              <div className="flex-1 glass-card p-6 overflow-auto bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:16px_16px] relative">
                {nodes.length === 0 && (
                  <div className="h-full flex items-center justify-center text-center">
                    <p className="text-[13px] text-slate-500 max-w-xs">
                      Nenhuma etapa ainda. Escolha uma etapa à esquerda; elas são executadas na ordem em que aparecem aqui.
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  {nodes.map((node, idx) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isAi = node.type === 'ai_agent';

                    return (
                      <React.Fragment key={node.id}>
                        <div
                          onClick={() => setSelectedNode(node)}
                          className={`w-64 p-3.5 rounded-xl border cursor-pointer transition-colors select-none relative bg-surface ${
                            isSelected ? 'border-accent-400' : 'border-white/[0.08] hover:border-white/[0.16]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 text-[11px] text-slate-500 tabular-nums">{idx + 1}</span>
                              {React.createElement(
                                { ai_agent: Bot, transfer_queue: Layers, crm_stage: Kanban, condition: Filter }[node.type] || MessageSquare,
                                { className: 'w-3.5 h-3.5 text-slate-400 flex-shrink-0', strokeWidth: 1.75 }
                              )}
                              <span className="text-[13px] text-white truncate">{node.title}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNodes((prev) => prev.filter((n) => n.id !== node.id));
                                if (selectedNode?.id === node.id) setSelectedNode(null);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-300 rounded transition-colors"
                              title="Remover etapa"
                              aria-label={`Remover ${node.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
                          </div>

                          <p className="text-xs text-slate-400 line-clamp-2">
                            {isAi && (node.data?.persona || node.data?.instructions || 'Sem instruções')}
                            {node.type === 'message' && (node.data?.text ? `"${node.data.text}"` : 'Sem texto')}
                            {node.type === 'transfer_queue' && `Fila: ${queues.find((q) => q.id === node.data?.queue_id)?.name || 'não definida'}`}
                            {node.type === 'condition' &&
                              `Se ${node.data?.field || '?'} ${CONDITION_OPERATOR_LABELS[node.data?.operator] || node.data?.operator || ''} ${node.data?.value || ''}`}
                            {node.type === 'crm_stage' && `Etapa: ${node.data?.stage_name || 'não definida'}`}
                          </p>
                        </div>

                        {idx < nodes.length - 1 && <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" strokeWidth={1.75} />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {selectedNode && (
                <aside className="w-72 glass-card p-4 space-y-4 flex-shrink-0 overflow-y-auto" aria-label="Configurar etapa">
                  <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                    Configurar etapa
                  </h3>

                  <div>
                    <label htmlFor="node-title" className="field-label">Título</label>
                    <input id="node-title" type="text" value={selectedNode.title} onChange={(e) => updateNode({ title: e.target.value })} className="field" />
                  </div>

                  {selectedNode.type === 'ai_agent' && (
                    <>
                      <div>
                        <label htmlFor="node-persona" className="field-label">Persona</label>
                        <input id="node-persona" type="text" value={selectedNode.data?.persona || ''} onChange={(e) => updateNodeData({ persona: e.target.value })} className="field" />
                      </div>
                      <div>
                        <label htmlFor="node-instr" className="field-label">Instruções</label>
                        <textarea id="node-instr" rows={5} value={selectedNode.data?.instructions || ''} onChange={(e) => updateNodeData({ instructions: e.target.value })} className="field" />
                      </div>
                    </>
                  )}

                  {selectedNode.type === 'message' && (
                    <div>
                      <label htmlFor="node-text" className="field-label">Mensagem</label>
                      <textarea id="node-text" rows={5} value={selectedNode.data?.text || ''} onChange={(e) => updateNodeData({ text: e.target.value })} className="field" />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Use <code className="font-mono text-slate-300">{'{{contact.name}}'}</code> para o nome do contato.
                      </p>
                    </div>
                  )}

                  {selectedNode.type === 'transfer_queue' && (
                    <div>
                      <label htmlFor="node-queue" className="field-label">Fila</label>
                      {queues.length > 0 ? (
                        <select id="node-queue" value={selectedNode.data?.queue_id || ''} onChange={(e) => updateNodeData({ queue_id: e.target.value })} className="field">
                          <option value="">Selecione uma fila</option>
                          {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                        </select>
                      ) : (
                        <p className="text-[13px] text-slate-400">Nenhuma fila criada. Crie filas em Filas & Triagem.</p>
                      )}
                    </div>
                  )}

                  {selectedNode.type === 'condition' && (
                    <>
                      <div>
                        <label htmlFor="node-field" className="field-label">Campo</label>
                        <input id="node-field" type="text" placeholder="contact.name ou contact.<chave>" value={selectedNode.data?.field || ''} onChange={(e) => updateNodeData({ field: e.target.value })} className="field font-mono text-xs" />
                      </div>
                      <div>
                        <label htmlFor="node-op" className="field-label">Operador</label>
                        <select id="node-op" value={selectedNode.data?.operator || 'equals'} onChange={(e) => updateNodeData({ operator: e.target.value })} className="field">
                          {Object.entries(CONDITION_OPERATOR_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="node-value" className="field-label">Valor</label>
                        <input id="node-value" type="text" value={selectedNode.data?.value || ''} onChange={(e) => updateNodeData({ value: e.target.value })} className="field" />
                      </div>
                    </>
                  )}

                  {selectedNode.type === 'crm_stage' && (
                    <div>
                      <label htmlFor="node-stage" className="field-label">Nome da etapa no CRM</label>
                      <input id="node-stage" type="text" value={selectedNode.data?.stage_name || ''} onChange={(e) => updateNodeData({ stage_name: e.target.value })} className="field" />
                    </div>
                  )}
                </aside>
              )}
            </div>
          )}

          {editorTab === 'simulator' && (
            <div className="flex-1 min-h-0 glass-card flex flex-col max-w-2xl mx-auto w-full">
              <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-[13px] font-medium text-white">Pré-visualização</h3>
                  <p className="text-xs text-slate-500">Percorre as etapas localmente, uma por mensagem. Nada é enviado nem executado.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSimMessages([simIntro]);
                    setSimStepIndex(0);
                  }}
                  className="btn btn-secondary"
                >
                  <RefreshCw strokeWidth={1.75} />
                  Reiniciar
                </button>
              </header>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {simMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : msg.sender === 'bot' ? 'justify-start' : 'justify-center'}`}
                  >
                    {msg.sender === 'system' ? (
                      <span className="text-[11px] text-slate-500">{msg.text}</span>
                    ) : (
                      <div
                        className={`max-w-xs px-3 py-2 rounded-xl text-[13px] ${
                          msg.sender === 'user' ? 'bg-accent-500 text-white rounded-br-sm' : 'bg-white/[0.05] text-slate-200 rounded-bl-sm'
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSimSend} className="flex gap-2 p-3 border-t border-white/[0.06]">
                <input
                  type="text"
                  aria-label="Mensagem do contato"
                  placeholder="Escreva como se fosse o contato"
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  className="field flex-1"
                />
                <button type="submit" className="btn btn-primary h-9">
                  <Send strokeWidth={1.75} />
                  Enviar
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {showCreateFlowModal && (
        <Modal
          title="Novo fluxo"
          onClose={() => !creating && setShowCreateFlowModal(false)}
          onSubmit={handleCreateNewFlow}
          submitting={creating}
          submitLabel="Criar e abrir"
          error={createError}
        >
          <div>
            <label htmlFor="flow-name" className="field-label">Nome</label>
            <input id="flow-name" autoFocus required type="text" placeholder="Ex.: Triagem de novos contatos" value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)} className="field" />
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