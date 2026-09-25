import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Save,
  Loader2,
  Check,
  LayoutGrid,
  Play,
  Power,
  History,
  SlidersHorizontal,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  XCircle,
  Search,
  Plus,
  Info,
} from 'lucide-react';
import ApiClient from '../../api/client';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { CanvasContext, nodeTypes, edgeTypes } from './FlowNode';
import NodeInspector from './NodeInspector';
import {
  NODE_SPECS,
  TONES,
  PALETTE_GROUPS,
  EXECUTION_STATUS,
  NODE_WIDTH,
  toCanvas,
  toDefinition,
  validateFlow,
  problemList,
  autoLayout,
  newId,
} from './catalog';

const DRAG_MIME = 'application/wh-flow-step';
const statusLabels = { active: 'Ativo', draft: 'Rascunho', inactive: 'Inativo' };
const statusCls = (s) => (s === 'active' ? 'text-emerald-300 border-emerald-500/25' : 'text-slate-400 border-white/[0.08]');

const asList = (d, key) => (Array.isArray(d) ? d : Array.isArray(d?.[key]) ? d[key] : []);

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'agora';
  if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const timeUntil = (iso) => {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  if (diff <= 30) return 'em instantes';
  if (diff < 3600) return `em ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `em ${Math.round(diff / 3600)} h`;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const defaultEdgeOptions = {
  type: 'step',
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'rgba(255,255,255,0.35)' },
};

/* ------------------------------------------------------------------ */

const PaletteItem = ({ type, onAdd, disabled }) => {
  const spec = NODE_SPECS[type];
  const Icon = spec.icon;
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, type);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onAdd(type)}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
      title={`${spec.label}: ${spec.hint}. Clique ou arraste para o canvas.`}
    >
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${TONES[spec.tone].chip}`}>
        <Icon className="w-3.5 h-3.5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-5 text-slate-200 truncate">{spec.label}</span>
        <span className="block text-[11px] leading-4 text-slate-500 truncate">{spec.hint}</span>
      </span>
    </button>
  );
};

const Palette = ({ onAdd, disabled }) => (
  <aside className="hidden lg:flex w-56 2xl:w-60 flex-shrink-0 glass-card flex-col overflow-y-auto" aria-label="Etapas disponíveis">
    <p className="px-4 pt-3.5 pb-1 text-xs text-slate-400">Etapas</p>
    <p className="px-4 pb-2 text-[11px] leading-relaxed text-slate-500">Arraste para o canvas ou clique para adicionar após a etapa selecionada.</p>
    {PALETTE_GROUPS.map(({ group, types }) => (
      <div key={group} className="px-2 pb-2">
        <p className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-[0.08em] text-slate-500">{group}</p>
        {types.map((t) => (
          <PaletteItem key={t} type={t} onAdd={onAdd} disabled={disabled} />
        ))}
      </div>
    ))}
  </aside>
);

const AddMenu = ({ onAdd, disabled }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative lg:hidden">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="btn btn-secondary" aria-expanded={open}>
        <Plus strokeWidth={1.75} />
        Etapa
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-64 max-h-[60vh] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#16171c] p-1.5 shadow-2xl">
          {PALETTE_GROUPS.flatMap(({ types }) => types).map((t) => (
            <PaletteItem
              key={t}
              type={t}
              onAdd={(type) => {
                setOpen(false);
                onAdd(type);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Overview = ({ meta, onMeta, problems, serverProblems, onFocus, counts, canEdit }) => {
  // The local list points at the offending step; the server's is the fallback.
  const list = problems.length ? problems : (serverProblems || []).map((text) => ({ text }));
  return (
    <div className="space-y-5">
      <fieldset disabled={!canEdit} className="space-y-4">
        <div>
          <label htmlFor="flow-meta-name" className="field-label">Nome do fluxo</label>
          <input id="flow-meta-name" type="text" maxLength={120} value={meta.name} onChange={(e) => onMeta({ name: e.target.value })} className="field" />
        </div>
        <div>
          <label htmlFor="flow-meta-desc" className="field-label">
            Descrição <span className="text-slate-500">(opcional)</span>
          </label>
          <textarea id="flow-meta-desc" rows={2} value={meta.description} onChange={(e) => onMeta({ description: e.target.value })} className="field resize-y" />
        </div>
      </fieldset>

      <section>
        <h3 className="text-xs text-slate-400 mb-2">Pendências</h3>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-emerald-300">
            <Check className="w-3.5 h-3.5" strokeWidth={2} />
            Pronto para ativar
          </p>
        ) : (
          <ul className="space-y-1">
            {list.map((p, i) => (
              <li key={`${p.id || 'g'}-${i}`}>
                <button
                  type="button"
                  disabled={!p.id}
                  onClick={() => p.id && onFocus(p.id)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 -mx-2 rounded-md text-left text-xs text-amber-200 enabled:hover:bg-white/[0.03]"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" strokeWidth={1.9} />
                  <span className="flex-1">{p.text}</span>
                  {p.id && <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" strokeWidth={1.75} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs text-slate-400 mb-2">Últimas 50 execuções</h3>
        <dl className="grid grid-cols-3 gap-2">
          {[
            ['Em andamento', (counts.running || 0) + (counts.waiting_input || 0) + (counts.waiting_delay || 0), 'text-amber-300'],
            ['Concluídas', counts.completed || 0, 'text-emerald-300'],
            ['Falhas', counts.failed || 0, counts.failed ? 'text-rose-300' : 'text-slate-300'],
          ].map(([label, value, cls]) => (
            <div key={label} className="rounded-lg border border-white/[0.06] px-3 py-2">
              <dd className={`text-lg leading-6 tabular-nums ${cls}`}>{value}</dd>
              <dt className="text-[11px] text-slate-500">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="text-[11.5px] leading-relaxed text-slate-500 space-y-1">
        <p className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" strokeWidth={1.75} />
          <span>
            Conecte a bolinha à direita de uma etapa à próxima. Etapas com duas saídas seguem caminhos diferentes. Selecione uma conexão para removê-la.
          </span>
        </p>
        <p className="pl-5">
          Atalhos: <kbd className="font-mono text-slate-400">Ctrl+S</kbd> salvar · <kbd className="font-mono text-slate-400">Ctrl+D</kbd> duplicar ·{' '}
          <kbd className="font-mono text-slate-400">Delete</kbd> excluir
        </p>
      </section>
    </div>
  );
};

const RunsPanel = ({ executions, loading, error, onRefresh, onCancel, cancelling, onFocus, nodeTitle, canEdit }) => {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Atualiza a cada 15 s</p>
        <button type="button" onClick={onRefresh} className="btn btn-icon text-slate-400 hover:text-white" aria-label="Atualizar execuções" title="Atualizar">
          <RefreshCw strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <p role="alert" className="alert-error">{error}</p>}
      {!error && executions.length === 0 && !loading && (
        <div className="py-10 text-center space-y-2">
          <History className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
          <p className="text-[13px] text-slate-300">Nenhuma execução ainda</p>
          <p className="text-xs text-slate-500 max-w-[240px] mx-auto">Ative o fluxo ou use Testar para rodá-lo em uma conversa.</p>
        </div>
      )}
      <ul className="space-y-1.5">
        {executions.map((ex) => {
          const st = EXECUTION_STATUS[ex.status] || EXECUTION_STATUS.cancelled;
          const open = openId === ex.id;
          const trace = Array.isArray(ex.trace) ? ex.trace : [];
          return (
            <li key={ex.id} className="rounded-lg border border-white/[0.06]">
              <button type="button" onClick={() => setOpenId(open ? null : ex.id)} className="w-full px-3 py-2.5 text-left" aria-expanded={open}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-white truncate flex-1">{ex.contact_name || ex.contact_phone || 'Contato'}</span>
                  <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] flex-shrink-0 ${st.cls}`}>{st.label}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
                  {timeAgo(ex.created_at)}
                  {st.active && ex.current_node_id && ` · em “${nodeTitle(ex.current_node_id)}”`}
                  {ex.status === 'waiting_delay' && ex.resume_at && ` · continua ${timeUntil(ex.resume_at)}`}
                </p>
                {ex.last_error && ex.status !== 'completed' && <p className="mt-1 text-[11.5px] text-rose-300/90 line-clamp-2">{ex.last_error}</p>}
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-3">
                  {trace.length > 0 ? (
                    <ol className="relative border-l border-white/[0.08] ml-1.5 space-y-2">
                      {trace.map((t, i) => (
                        <li key={`${t.node}-${i}`} className="pl-3.5 relative">
                          <span
                            className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full"
                            style={{ background: TONES[NODE_SPECS[t.type]?.tone || 'slate'].dot }}
                          />
                          <button type="button" onClick={() => onFocus(t.node)} className="text-left group">
                            <span className="text-xs text-slate-200 group-hover:underline underline-offset-2 decoration-white/30">{t.title || NODE_SPECS[t.type]?.label || t.node}</span>
                            <span className="block text-[11px] text-slate-500">
                              {t.result === 'ok' ? 'executada' : t.result}
                              {t.at && ` · ${new Date(t.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-slate-500">Sem etapas registradas.</p>
                  )}
                  {ex.vars && Object.keys(ex.vars).length > 0 && (
                    <dl className="rounded-md bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 space-y-0.5">
                      {Object.entries(ex.vars).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[11px]">
                          <dt className="font-mono text-slate-500">{k}</dt>
                          <dd className="text-slate-300 truncate">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {st.active && canEdit && (
                    <button type="button" disabled={cancelling === ex.id} onClick={() => onCancel(ex.id)} className="btn btn-secondary w-full hover:text-rose-300">
                      {cancelling === ex.id ? <Loader2 className="animate-spin" /> : <XCircle strokeWidth={1.75} />}
                      Parar execução
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const TestRunModal = ({ flowName, onClose, onRun }) => {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ status: 'all', limit: '20' });
      if (q.trim()) params.set('search', q.trim());
      ApiClient.get(`/conversations?${params}`)
        .then((d) => alive && setItems(asList(d, 'conversations')))
        .catch((err) => alive && setError(err.message || 'Não foi possível carregar as conversas.'))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const submit = async (e) => {
    e.preventDefault();
    if (!picked) {
      setError('Escolha uma conversa.');
      return;
    }
    setRunning(true);
    setError('');
    try {
      await onRun(picked);
    } catch (err) {
      setError(err.message || 'Não foi possível iniciar o fluxo.');
      setRunning(false);
    }
  };

  return (
    <Modal title="Testar em uma conversa" onClose={() => !running && onClose()} onSubmit={submit} submitting={running} submitDisabled={!picked} submitLabel="Iniciar fluxo" error={error}>
      <p className="text-[13px] text-slate-400">
        “{flowName}” roda agora na conversa escolhida, com mensagens reais enviadas ao contato. Se outro bot estiver ativo nela, ele é substituído.
      </p>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
        <input type="search" autoFocus aria-label="Buscar conversa" placeholder="Buscar por nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} className="field pl-8" />
      </div>
      <ul className="max-h-64 overflow-y-auto -mx-1 space-y-0.5" role="listbox" aria-label="Conversas">
        {loading && (
          <li className="py-6 flex justify-center">
            <Loader2 className="w-4 h-4 text-slate-500 animate-spin" aria-label="Carregando" />
          </li>
        )}
        {!loading && items.length === 0 && <li className="py-6 text-center text-xs text-slate-500">Nenhuma conversa encontrada.</li>}
        {!loading &&
          items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={picked === c.id}
                onClick={() => setPicked(c.id)}
                className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${picked === c.id ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : 'hover:bg-white/[0.04]'}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[13px] text-white truncate flex-1">{c.contact?.name || c.contact?.phone || 'Contato'}</span>
                  <span className="text-[11px] text-slate-500">{c.status === 'resolved' ? 'Resolvida' : c.status === 'pending' ? 'Pendente' : 'Aberta'}</span>
                </span>
                {c.last_message_preview && <span className="block text-[11.5px] text-slate-500 truncate">{c.last_message_preview}</span>}
              </button>
            </li>
          ))}
      </ul>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const EditorInner = ({ flow, onBack, onSaved }) => {
  const { user } = useAuth();
  const canEdit = !user?.role || ['admin', 'supervisor'].includes(user.role);
  const rf = useReactFlow();
  const wrapperRef = useRef(null);

  const initial = useMemo(() => toCanvas(flow.definition_json ?? flow.definition), [flow.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges.map((e) => ({ ...e, type: 'step' })));
  const [meta, setMeta] = useState({ name: flow.name, description: flow.description || '', status: flow.status || 'draft' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: 'error'|'ok', text }
  const [serverProblems, setServerProblems] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [panel, setPanel] = useState('config');
  const [focusId, setFocusId] = useState(null);
  const [showTest, setShowTest] = useState(false);

  const [lookups, setLookups] = useState({});
  const [executions, setExecutions] = useState([]);
  const [execCounts, setExecCounts] = useState({});
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState('');
  const [cancelling, setCancelling] = useState(null);

  // Everything the inspector needs to offer real choices instead of free text.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [queues, tags, customFields, channels, aiProviders, pipelines] = await Promise.allSettled([
        ApiClient.get('/queues'),
        ApiClient.get('/tags'),
        ApiClient.get('/custom-fields'),
        ApiClient.get('/channels'),
        ApiClient.get('/billing/ai-providers'),
        ApiClient.get('/crm/pipelines'),
      ]).then((rs) => rs.map((r) => (r.status === 'fulfilled' ? r.value : null)));
      const pipelineList = asList(pipelines, 'pipelines');
      const details = await Promise.allSettled(pipelineList.map((p) => ApiClient.get(`/crm/pipelines/${p.id}`)));
      const stages = details.flatMap((r, i) =>
        r.status === 'fulfilled' && Array.isArray(r.value?.stages)
          ? r.value.stages.map((s) => ({ id: s.id, name: s.name, pipelineId: pipelineList[i].id, pipelineName: pipelineList[i].name }))
          : []
      );
      if (!alive) return;
      setLookups({
        queues: asList(queues, 'queues'),
        tags: asList(tags, 'tags'),
        customFields: asList(customFields, 'fields'),
        channels: asList(channels, 'channels'),
        aiProviders: asList(aiProviders, 'providers'),
        stages,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadExecutions = useCallback(async () => {
    setExecLoading(true);
    try {
      const d = await ApiClient.get(`/flows/${flow.id}/executions`);
      setExecutions(asList(d, 'executions'));
      setExecCounts(d?.counts || {});
      setExecError('');
    } catch (err) {
      setExecError(err.message || 'Não foi possível carregar as execuções.');
    } finally {
      setExecLoading(false);
    }
  }, [flow.id]);

  useEffect(() => {
    loadExecutions();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadExecutions();
    }, 15000);
    return () => clearInterval(t);
  }, [loadExecutions]);

  // Validation only reruns when the structure changes, not on every drag frame.
  const structRef = useRef({ key: [], value: null });
  const key = [edges, ...nodes.flatMap((n) => [n.id, n.type, n.data])];
  if (structRef.current.key.length !== key.length || key.some((k, i) => k !== structRef.current.key[i])) {
    structRef.current = { key, value: validateFlow(nodes, edges) };
  }
  const validation = structRef.current.value;
  const problems = useMemo(() => problemList(validation, nodes), [validation]); // eslint-disable-line react-hooks/exhaustive-deps

  const parked = useMemo(() => {
    const m = {};
    for (const ex of executions) if (EXECUTION_STATUS[ex.status]?.active && ex.current_node_id) m[ex.current_node_id] = (m[ex.current_node_id] || 0) + 1;
    return m;
  }, [executions]);

  const variables = useMemo(
    () => [...new Set(nodes.filter((n) => n.type === 'ask' && n.data.config?.variable).map((n) => n.data.config.variable))],
    [nodes]
  );

  const ctx = useMemo(
    () => ({ lookups, problems: validation.byNode, warnings: validation.warnings, parked, focusId }),
    [lookups, validation, parked, focusId]
  );

  const markDirty = useCallback(() => {
    setDirty(true);
    setServerProblems(null);
    setNotice(null);
  }, []);

  const handleNodesChange = useCallback(
    (changes) => {
      const safe = canEdit ? changes : changes.filter((c) => c.type === 'select' || c.type === 'dimensions');
      onNodesChange(safe);
      if (safe.some((c) => c.type === 'remove' || c.type === 'add' || (c.type === 'position' && c.dragging))) markDirty();
    },
    [onNodesChange, markDirty, canEdit]
  );

  const handleEdgesChange = useCallback(
    (changes) => {
      const safe = canEdit ? changes : changes.filter((c) => c.type === 'select');
      onEdgesChange(safe);
      if (safe.some((c) => c.type === 'remove' || c.type === 'add')) markDirty();
    },
    [onEdgesChange, markDirty, canEdit]
  );

  // One connection per output: reconnecting an output replaces its old edge.
  const onConnect = useCallback(
    (conn) => {
      setEdges((eds) => [
        ...eds.filter((e) => !(e.source === conn.source && (e.sourceHandle || null) === (conn.sourceHandle || null))),
        { ...conn, id: newId('e'), type: 'step' },
      ]);
      markDirty();
    },
    [setEdges, markDirty]
  );

  const isValidConnection = useCallback(
    (conn) => {
      if (conn.source === conn.target) return false;
      const target = rf.getNode(conn.target);
      return target?.type !== 'trigger';
    },
    [rf]
  );

  const onSelectionChange = useCallback(({ nodes: sel }) => {
    setSelectedId(sel.length === 1 ? sel[0].id : null);
    if (sel.length === 1) setPanel('config');
  }, []);

  const selectOnly = useCallback(
    (id) => {
      setNodes((ns) => ns.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })));
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
    },
    [setNodes, setEdges]
  );

  const focusNode = useCallback(
    (id) => {
      const n = rf.getNode(id);
      if (!n) return;
      selectOnly(id);
      setSelectedId(id);
      setPanel('config');
      setFocusId(id);
      rf.setCenter(n.position.x + NODE_WIDTH / 2, n.position.y + 60, { zoom: Math.max(rf.getZoom(), 1), duration: 450 });
      setTimeout(() => setFocusId((cur) => (cur === id ? null : cur)), 1600);
    },
    [rf, selectOnly]
  );

  const addNode = useCallback(
    (type, position) => {
      if (!canEdit) return;
      const spec = NODE_SPECS[type];
      const id = newId(type.slice(0, 3));
      const anchor = selectedId ? rf.getNode(selectedId) : null;
      let pos = position;
      let autoEdge = null;
      if (!pos && anchor) {
        const outs = NODE_SPECS[anchor.type]?.outputs || [];
        const current = rf.getEdges();
        const free = outs.find((o) => !current.some((e) => e.source === anchor.id && (e.sourceHandle || outs[0]?.id) === o.id));
        const siblings = current.filter((e) => e.source === anchor.id).length;
        pos = { x: anchor.position.x + 340, y: anchor.position.y + siblings * 150 };
        if (free) autoEdge = { id: newId('e'), type: 'step', source: anchor.id, sourceHandle: free.id, target: id };
      }
      if (!pos) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        pos = rect
          ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2 - NODE_WIDTH / 2, y: rect.top + rect.height / 2 - 50 })
          : { x: 0, y: 0 };
      }
      // Don't drop a step on top of another one.
      const others = rf.getNodes();
      for (let i = 0; i < 12 && others.some((o) => Math.abs(o.position.x - pos.x) < NODE_WIDTH - 40 && Math.abs(o.position.y - pos.y) < 100); i++) {
        pos = { ...pos, y: pos.y + 130 };
      }
      const node = { id, type, position: pos, data: { title: spec.label, config: spec.defaults() }, selected: true };
      setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node]);
      if (autoEdge) setEdges((es) => [...es, autoEdge]);
      setSelectedId(id);
      setPanel('config');
      markDirty();
    },
    [canEdit, selectedId, rf, setNodes, setEdges, markDirty]
  );

  const onDrop = useCallback(
    (e) => {
      const type = e.dataTransfer.getData(DRAG_MIME);
      if (!type || !NODE_SPECS[type]) return;
      e.preventDefault();
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, { x: p.x - NODE_WIDTH / 2, y: p.y - 30 });
    },
    [rf, addNode]
  );

  const updateSelected = useCallback(
    (fn) => {
      setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: fn(n.data) } : n)));
      markDirty();
    },
    [selectedId, setNodes, markDirty]
  );

  const duplicateSelected = useCallback(() => {
    const n = rf.getNode(selectedId);
    if (!n || n.type === 'trigger' || !canEdit) return;
    const id = newId(n.type.slice(0, 3));
    const copy = {
      id,
      type: n.type,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      data: { title: `${n.data.title} (cópia)`.slice(0, 60), config: JSON.parse(JSON.stringify(n.data.config || {})) },
      selected: true,
    };
    setNodes((ns) => [...ns.map((x) => (x.selected ? { ...x, selected: false } : x)), copy]);
    setSelectedId(id);
    markDirty();
  }, [rf, selectedId, canEdit, setNodes, markDirty]);

  const deleteSelected = useCallback(() => {
    const n = rf.getNode(selectedId);
    if (!n || n.type === 'trigger') return;
    rf.deleteElements({ nodes: [{ id: n.id }] });
  }, [rf, selectedId]);

  // Fit once the laid-out positions are committed, not before.
  const [pendingFit, setPendingFit] = useState(false);
  useEffect(() => {
    if (!pendingFit) return;
    setPendingFit(false);
    rf.fitView({ padding: 0.2, maxZoom: 1.1, duration: 400 });
  }, [pendingFit, nodes, rf]);

  const arrange = useCallback(() => {
    setNodes((ns) => autoLayout(ns, rf.getEdges()));
    setPendingFit(true);
    markDirty();
  }, [rf, setNodes, markDirty]);

  const persist = useCallback(
    async (nextStatus) => {
      if (!meta.name.trim()) {
        setNotice({ tone: 'error', text: 'Dê um nome ao fluxo antes de salvar.' });
        setSelectedId(null);
        return false;
      }
      setSaving(true);
      setNotice(null);
      setServerProblems(null);
      try {
        const updated = await ApiClient.put(`/flows/${flow.id}`, {
          name: meta.name.trim(),
          description: meta.description.trim(),
          status: nextStatus || meta.status,
          definition: toDefinition(rf.getNodes(), rf.getEdges()),
        });
        setMeta((m) => ({ ...m, status: updated?.status || nextStatus || m.status }));
        setDirty(false);
        setSavedAt(new Date());
        onSaved?.();
        return true;
      } catch (err) {
        if (Array.isArray(err.data?.problems)) {
          setServerProblems(err.data.problems);
          setSelectedId(null);
          setPanel('config');
          setNotice({
            tone: 'error',
            text: nextStatus === 'active' || meta.status !== 'active' ? err.message : 'O fluxo está ativo e tem pendências. Corrija-as ou desative o fluxo para salvar.',
          });
        } else {
          setNotice({ tone: 'error', text: err.message || 'Não foi possível salvar.' });
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [flow.id, meta, rf, onSaved]
  );

  const toggleActive = () => persist(meta.status === 'active' ? 'inactive' : 'active');

  // Keyboard: Ctrl+S saves, Ctrl+D duplicates (outside text fields).
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canEdit && !saving) persist();
      }
      if (mod && e.key.toLowerCase() === 'd') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [persist, duplicateSelected, canEdit, saving]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const leave = () => {
    if (dirty && !window.confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    onBack();
  };

  const runTest = async (conversationId) => {
    if (dirty) {
      const ok = await persist();
      if (!ok) throw new Error('Salve o fluxo antes de testar.');
    }
    await ApiClient.post(`/flows/${flow.id}/execute`, { conversation_id: conversationId });
    setShowTest(false);
    setSelectedId(null);
    setPanel('runs');
    setNotice({ tone: 'ok', text: 'Fluxo iniciado na conversa.' });
    loadExecutions();
  };

  const cancelRun = async (id) => {
    setCancelling(id);
    try {
      await ApiClient.post(`/flows/executions/${id}/cancel`, {});
      await loadExecutions();
    } catch (err) {
      setExecError(err.message || 'Não foi possível parar a execução.');
    } finally {
      setCancelling(null);
    }
  };

  const nodeTitle = useCallback((id) => rf.getNode(id)?.data?.title || 'etapa removida', [rf]);
  const selectedNode = nodes.find((n) => n.id === selectedId);
  const isActive = meta.status === 'active';
  const onlyTrigger = nodes.length <= 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <button type="button" onClick={leave} className="btn btn-secondary">
          <ArrowLeft strokeWidth={1.75} />
          Fluxos
        </button>
        <div className="min-w-0 flex items-center gap-2 mr-auto">
          <h2 className="text-[13px] font-medium text-white truncate max-w-[16rem]">{meta.name || 'Sem nome'}</h2>
          <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] flex-shrink-0 ${statusCls(meta.status)}`}>{statusLabels[meta.status] || meta.status}</span>
          <span role="status" className="text-xs text-slate-500 inline-flex items-center gap-1.5 whitespace-nowrap">
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
              </>
            ) : dirty ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300" /> Não salvo
              </>
            ) : savedAt ? (
              <>
                <Check className="w-3 h-3 text-emerald-300" strokeWidth={2} /> Salvo às {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : null}
          </span>
        </div>

        <AddMenu onAdd={(t) => addNode(t)} disabled={!canEdit} />
        {validation.count > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              selectOnly(null);
              setPanel('config');
            }}
            className="btn text-amber-300 hover:bg-amber-500/[0.06]"
            title="Ver pendências"
          >
            <AlertTriangle strokeWidth={1.9} />
            {validation.count} {validation.count === 1 ? 'pendência' : 'pendências'}
          </button>
        )}
        <button type="button" onClick={arrange} disabled={!canEdit} className="btn btn-icon btn-secondary" aria-label="Organizar etapas" title="Organizar automaticamente">
          <LayoutGrid strokeWidth={1.75} />
        </button>
        <button type="button" onClick={() => setShowTest(true)} disabled={!canEdit || onlyTrigger} className="btn btn-secondary" title="Rodar em uma conversa real">
          <Play strokeWidth={1.75} />
          Testar
        </button>
        <button type="button" onClick={() => persist()} disabled={!canEdit || saving || (!dirty && !!savedAt)} className="btn btn-secondary">
          <Save strokeWidth={1.75} />
          Salvar
        </button>
        <button type="button" onClick={toggleActive} disabled={!canEdit || saving} className={`btn ${isActive ? 'btn-secondary' : 'btn-primary'}`}>
          <Power strokeWidth={1.9} />
          {isActive ? 'Desativar' : dirty ? 'Salvar e ativar' : 'Ativar'}
        </button>
      </div>

      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'alert-error' : 'text-[13px] text-emerald-300'}>
          {notice.text}
        </p>
      )}

      <div className="relative flex-1 min-h-0 flex gap-3 overflow-hidden">
        <Palette onAdd={(t) => addNode(t)} disabled={!canEdit} />

        <div
          ref={wrapperRef}
          className="flow-canvas relative flex-1 min-w-0 glass-card overflow-hidden"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={onDrop}
        >
          <CanvasContext.Provider value={ctx}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
              deleteKeyCode={canEdit ? ['Delete', 'Backspace'] : null}
              colorMode="dark"
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
              minZoom={0.25}
              maxZoom={1.75}
              snapToGrid
              snapGrid={[8, 8]}
              connectionRadius={28}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="rgba(255,255,255,0.07)" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(n) => TONES[NODE_SPECS[n.type]?.tone || 'slate'].dot}
                nodeStrokeWidth={0}
                nodeBorderRadius={6}
                maskColor="rgba(11,12,15,0.72)"
                style={{ width: 156, height: 100 }}
                className="!hidden xl:!block"
                ariaLabel="Minimapa do fluxo"
              />
            </ReactFlow>
          </CanvasContext.Provider>

          {onlyTrigger && canEdit && (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4">
              <p className="rounded-lg border border-white/[0.08] bg-[#15161b]/95 px-4 py-2.5 text-xs text-slate-300 text-center max-w-sm">
                Configure o Início e arraste as próximas etapas da lista à esquerda. Ligue a bolinha de saída de uma etapa à entrada da seguinte.
              </p>
            </div>
          )}
        </div>

        {/* Side panel; on phones it floats over the canvas while a step is selected. */}
        <aside
          className={`${selectedNode ? 'flex' : 'hidden'} md:flex flex-col overflow-hidden glass-card flex-shrink-0 md:w-[300px] xl:w-[320px] 2xl:w-[340px] max-md:absolute max-md:inset-x-3 max-md:bottom-3 max-md:h-[58%] max-md:z-20 max-md:shadow-2xl`}
          aria-label="Painel do fluxo"
        >
          <div className="px-3 pt-3 pb-2 flex items-center gap-2 border-b border-white/[0.06]">
            <div className="segmented w-full" role="tablist" aria-label="Painel">
              <button type="button" role="tab" aria-selected={panel === 'config'} onClick={() => setPanel('config')} className="flex-1 justify-center">
                <SlidersHorizontal strokeWidth={1.75} />
                {selectedNode ? 'Etapa' : 'Fluxo'}
              </button>
              <button type="button" role="tab" aria-selected={panel === 'runs'} onClick={() => setPanel('runs')} className="flex-1 justify-center">
                <History strokeWidth={1.75} />
                Execuções
                {Object.keys(parked).length > 0 && (
                  <span className="ml-0.5 px-1 rounded bg-amber-500/15 text-[10.5px] text-amber-300 tabular-nums">
                    {Object.values(parked).reduce((a, b) => a + b, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {panel === 'runs' ? (
              <RunsPanel
                executions={executions}
                loading={execLoading}
                error={execError}
                onRefresh={loadExecutions}
                onCancel={cancelRun}
                cancelling={cancelling}
                onFocus={focusNode}
                nodeTitle={nodeTitle}
                canEdit={canEdit}
              />
            ) : selectedNode ? (
              <NodeInspector
                key={selectedNode.id}
                node={selectedNode}
                lookups={lookups}
                variables={variables}
                problems={validation.byNode[selectedNode.id]}
                warning={validation.warnings[selectedNode.id]}
                canEdit={canEdit}
                onTitle={(title) => updateSelected((d) => ({ ...d, title }))}
                onConfig={(patch) => updateSelected((d) => ({ ...d, config: { ...d.config, ...patch } }))}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            ) : (
              <Overview
                meta={meta}
                onMeta={(patch) => {
                  setMeta((m) => ({ ...m, ...patch }));
                  markDirty();
                }}
                problems={problems}
                serverProblems={serverProblems}
                onFocus={focusNode}
                counts={execCounts}
                canEdit={canEdit}
              />
            )}
          </div>
        </aside>
      </div>

      {showTest && <TestRunModal flowName={meta.name} onClose={() => setShowTest(false)} onRun={runTest} />}
    </div>
  );
};

export const FlowEditor = (props) => (
  <ReactFlowProvider>
    <EditorInner {...props} />
  </ReactFlowProvider>
);

export default FlowEditor;
