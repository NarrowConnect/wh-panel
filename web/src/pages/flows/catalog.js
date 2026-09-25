import {
  Zap,
  MessageSquare,
  MessageCircleQuestion,
  Split,
  Hourglass,
  Layers,
  Tag,
  Kanban,
  Webhook,
  Sparkles,
  Flag,
} from 'lucide-react';

/*
 * Mirrors internal/flows/nodes.go: node types, their outputs (handles) and the
 * data keys the engine reads. Keep both sides in sync.
 */

export const TONES = {
  accent: { chip: 'bg-accent-500/15 text-accent-300', ring: 'ring-accent-400/60', dot: '#958bd0' },
  sky: { chip: 'bg-sky-500/10 text-sky-300', ring: 'ring-sky-400/50', dot: '#7fb6d4' },
  amber: { chip: 'bg-amber-500/10 text-amber-300', ring: 'ring-amber-400/50', dot: '#d9b06a' },
  emerald: { chip: 'bg-emerald-500/10 text-emerald-300', ring: 'ring-emerald-400/50', dot: '#6cc2a0' },
  slate: { chip: 'bg-white/[0.06] text-slate-300', ring: 'ring-white/30', dot: '#8b8d94' },
};

// Output colors: the "happy path" reads green, the fallback path rose.
const OK = '#6cc2a0';
const ALT = '#d98a98';
const NEUTRAL = '#8b8d94';

export const TRIGGER_EVENTS = [
  { id: 'new_conversation', label: 'Nova conversa', hint: 'Primeira mensagem de um contato em uma conversa nova.' },
  { id: 'every_message', label: 'Toda mensagem recebida', hint: 'Qualquer mensagem do contato quando nenhum bot está ativo.' },
  { id: 'keyword', label: 'Palavra-chave', hint: 'Mensagens que contêm uma das palavras informadas.' },
  { id: 'manual', label: 'Somente manual', hint: 'Só roda quando alguém inicia o fluxo em uma conversa.' },
];

export const CONDITION_OPERATORS = [
  { id: 'equals', label: 'é igual a' },
  { id: 'not_equals', label: 'é diferente de' },
  { id: 'contains', label: 'contém' },
  { id: 'not_contains', label: 'não contém' },
  { id: 'starts_with', label: 'começa com' },
  { id: 'in', label: 'é um de (lista)' },
  { id: 'contains_any', label: 'contém algum de (lista)' },
  { id: 'empty', label: 'está vazio', noValue: true },
  { id: 'not_empty', label: 'está preenchido', noValue: true },
  { id: 'gt', label: 'maior que' },
  { id: 'gte', label: 'maior ou igual a' },
  { id: 'lt', label: 'menor que' },
  { id: 'lte', label: 'menor ou igual a' },
];

export const WAIT_UNITS = [
  { id: 'seconds', label: 'segundos', short: 's' },
  { id: 'minutes', label: 'minutos', short: 'min' },
  { id: 'hours', label: 'horas', short: 'h' },
  { id: 'days', label: 'dias', short: 'd' },
];

export const AI_PROVIDERS = [
  { id: '', label: 'Automático (primeiro configurado)' },
  { id: 'anthropic', label: 'Anthropic (Claude)', model: 'claude-opus-5' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
];

export const NODE_SPECS = {
  trigger: {
    label: 'Início',
    hint: 'Quando o fluxo começa',
    group: 'Início',
    icon: Zap,
    tone: 'accent',
    outputs: [{ id: 'next', color: NEUTRAL }],
    defaults: () => ({ event: 'new_conversation', keywords: '', channel_ids: [] }),
    unique: true,
  },
  send_message: {
    label: 'Enviar mensagem',
    hint: 'Texto enviado ao contato',
    group: 'Conversa',
    icon: MessageSquare,
    tone: 'sky',
    outputs: [{ id: 'next', color: NEUTRAL }],
    defaults: () => ({ message: '' }),
  },
  ask: {
    label: 'Perguntar',
    hint: 'Espera a resposta do contato',
    group: 'Conversa',
    icon: MessageCircleQuestion,
    tone: 'sky',
    outputs: [
      { id: 'reply', label: 'Respondeu', color: OK },
      { id: 'timeout', label: 'Sem resposta', color: ALT },
    ],
    defaults: () => ({ message: '', save_to: '', variable: '', timeout_minutes: 60 }),
  },
  condition: {
    label: 'Condição',
    hint: 'Divide o caminho em Sim e Não',
    group: 'Lógica',
    icon: Split,
    tone: 'amber',
    outputs: [
      { id: 'true', label: 'Sim', color: OK },
      { id: 'false', label: 'Não', color: ALT },
    ],
    defaults: () => ({ field: 'message.text', operator: 'contains', value: '' }),
  },
  wait: {
    label: 'Aguardar',
    hint: 'Pausa antes da próxima etapa',
    group: 'Lógica',
    icon: Hourglass,
    tone: 'amber',
    outputs: [{ id: 'next', color: NEUTRAL }],
    defaults: () => ({ amount: 5, unit: 'minutes' }),
  },
  transfer_queue: {
    label: 'Transferir para fila',
    hint: 'Entrega a um atendente',
    group: 'Ações',
    icon: Layers,
    tone: 'emerald',
    outputs: [{ id: 'next', color: NEUTRAL }],
    defaults: () => ({ queue_id: '', message: '' }),
  },
  add_tag: {
    label: 'Adicionar tag',
    hint: 'Etiqueta a conversa',
    group: 'Ações',
    icon: Tag,
    tone: 'emerald',
    outputs: [{ id: 'next', color: NEUTRAL }],
    defaults: () => ({ tag: '' }),
  },
  crm_move: {
    label: 'Mover no CRM',
    hint: 'Cria ou move o card do contato',
    group: 'Ações',
    icon: Kanban,
    tone: 'emerald',
    outputs: [{ id: 'next', color: NEUTRAL }],
    defaults: () => ({ stage_id: '', stage_name: '', status: 'open', title: '', value: '' }),
  },
  webhook: {
    label: 'Webhook',
    hint: 'Chama um sistema externo',
    group: 'Ações',
    icon: Webhook,
    tone: 'emerald',
    outputs: [
      { id: 'next', label: 'Sucesso', color: OK },
      { id: 'error', label: 'Falhou', color: ALT },
    ],
    defaults: () => ({ method: 'POST', url: '', body: '' }),
  },
  ai_agent: {
    label: 'Agente de IA',
    hint: 'Conversa usando sua chave de IA',
    group: 'Inteligência',
    icon: Sparkles,
    tone: 'accent',
    outputs: [
      { id: 'done', label: 'Concluído', color: OK },
      { id: 'handoff', label: 'Transferir', color: ALT },
    ],
    defaults: () => ({ provider: '', model: '', instructions: '', max_turns: 10, timeout_minutes: 60 }),
  },
  end: {
    label: 'Encerrar',
    hint: 'Fim do fluxo',
    group: 'Fim',
    icon: Flag,
    tone: 'slate',
    outputs: [],
    defaults: () => ({ resolve: false }),
  },
};

export const PALETTE_GROUPS = ['Conversa', 'Lógica', 'Ações', 'Inteligência', 'Fim'].map((group) => ({
  group,
  types: Object.entries(NODE_SPECS)
    .filter(([, s]) => s.group === group)
    .map(([type]) => type),
}));

export const STATIC_FIELDS = [
  { id: 'message.text', label: 'Mensagem recebida' },
  { id: 'last_input', label: 'Última resposta do contato' },
  { id: 'contact.name', label: 'Nome do contato' },
  { id: 'contact.phone', label: 'Telefone do contato' },
  { id: 'contact.email', label: 'E-mail do contato' },
  { id: 'conversation.tags', label: 'Tags da conversa' },
  { id: 'conversation.channel_type', label: 'Tipo de canal' },
];

const LEGACY_TYPES = {
  message: 'send_message',
  collect: 'ask',
  collect_input: 'ask',
  delay: 'wait',
  http_request: 'webhook',
  call_integration: 'webhook',
  crm_stage: 'crm_move',
  update_card: 'crm_move',
  update_card_stage: 'crm_move',
};

const str = (v) => (v === undefined || v === null ? '' : String(v));
const truncate = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const fieldLabel = (field, customFields = []) => {
  if (!field) return '';
  const fixed = STATIC_FIELDS.find((f) => f.id === field);
  if (fixed) return fixed.label;
  if (field.startsWith('var.')) return `variável ${field.slice(4)}`;
  if (field.startsWith('contact.')) {
    const key = field.slice(8);
    return customFields.find((f) => f.key === key)?.name || key;
  }
  return field;
};

/** One-line description of what a configured node does, or '' when empty. */
export const summarize = (type, d = {}, ctx = {}) => {
  switch (type) {
    case 'trigger': {
      const ev = TRIGGER_EVENTS.find((e) => e.id === d.event) || TRIGGER_EVENTS[0];
      if (d.event === 'keyword') return d.keywords ? `Palavras: ${truncate(str(d.keywords), 70)}` : '';
      const channels = Array.isArray(d.channel_ids) ? d.channel_ids.length : 0;
      return channels ? `${ev.label} · ${channels} ${channels === 1 ? 'canal' : 'canais'}` : ev.label;
    }
    case 'send_message':
      return truncate(str(d.message));
    case 'ask': {
      const q = truncate(str(d.message), 70);
      if (!q) return '';
      return d.save_to ? `${q} → ${fieldLabel(d.save_to, ctx.customFields)}` : q;
    }
    case 'condition': {
      if (!d.field) return '';
      const op = CONDITION_OPERATORS.find((o) => o.id === d.operator);
      return truncate(`Se ${fieldLabel(d.field, ctx.customFields)} ${op?.label || d.operator || ''}${op?.noValue ? '' : ` "${str(d.value)}"`}`);
    }
    case 'wait': {
      const amount = Number(d.amount) || 0;
      if (!amount) return '';
      const unit = WAIT_UNITS.find((u) => u.id === d.unit) || WAIT_UNITS[0];
      return `Espera ${amount} ${unit.label}`;
    }
    case 'transfer_queue': {
      if (!d.queue_id) return '';
      const q = ctx.queues?.find((x) => x.id === d.queue_id);
      return `Fila ${q?.name || '(fila removida)'}`;
    }
    case 'add_tag':
      return d.tag ? `Tag “${truncate(str(d.tag), 40)}”` : '';
    case 'crm_move': {
      const stage = ctx.stages?.find((s) => s.id === d.stage_id);
      const name = stage ? `${stage.pipelineName} › ${stage.name}` : d.stage_name;
      if (!name) return '';
      const status = d.status === 'won' ? ' · ganho' : d.status === 'lost' ? ' · perdido' : '';
      return `${name}${status}`;
    }
    case 'webhook':
      return d.url ? `${str(d.method || 'POST').toUpperCase()} ${truncate(str(d.url).replace(/^https?:\/\//, ''), 60)}` : '';
    case 'ai_agent':
      return truncate(str(d.instructions));
    case 'end':
      return d.resolve ? 'Encerra e resolve a conversa' : 'Encerra o fluxo';
    default:
      return '';
  }
};

const isHttpUrl = (u) => {
  try {
    const url = new URL(u);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.host;
  } catch {
    return false;
  }
};

/**
 * Client copy of the engine's Validate, keyed by node so problems can be shown
 * on the canvas. `blocking` problems stop activation; `warnings` don't.
 */
export const validateFlow = (nodes, edges) => {
  const byNode = {};
  const global = [];
  const add = (id, msg) => {
    (byNode[id] ||= []).push(msg);
  };
  const ids = new Set(nodes.map((n) => n.id));
  const triggers = nodes.filter((n) => n.type === 'trigger');

  for (const n of nodes) {
    const d = n.data?.config || {};
    switch (n.type) {
      case 'trigger':
        if (d.event === 'keyword' && !str(d.keywords).trim()) add(n.id, 'Informe ao menos uma palavra-chave');
        break;
      case 'send_message':
        if (!str(d.message).trim()) add(n.id, 'A mensagem está vazia');
        break;
      case 'ask':
        if (!str(d.message).trim()) add(n.id, 'Escreva a pergunta');
        break;
      case 'condition':
        if (!d.field) add(n.id, 'Escolha o campo a comparar');
        break;
      case 'wait':
        if (!(Number(d.amount) > 0)) add(n.id, 'Informe quanto tempo esperar');
        break;
      case 'transfer_queue':
        if (!d.queue_id) add(n.id, 'Escolha a fila');
        break;
      case 'add_tag':
        if (!str(d.tag).trim()) add(n.id, 'Informe a tag');
        break;
      case 'crm_move':
        if (!d.stage_id && !d.stage_name) add(n.id, 'Escolha a etapa do CRM');
        break;
      case 'webhook':
        if (!isHttpUrl(str(d.url))) add(n.id, 'Informe uma URL http(s) válida');
        break;
      case 'ai_agent':
        if (!str(d.instructions).trim()) add(n.id, 'Escreva as instruções do agente');
        break;
      default:
        break;
    }
  }

  if (triggers.length === 0) global.push('Adicione a etapa Início para definir quando o fluxo começa');
  if (triggers.length > 1) global.push('O fluxo deve ter apenas uma etapa Início');
  if (edges.some((e) => !ids.has(e.source) || !ids.has(e.target))) global.push('Há uma conexão apontando para uma etapa que não existe mais');
  const start = triggers[0];
  if (start && nodes.length > 1 && !edges.some((e) => e.source === start.id)) add(start.id, 'Conecte o Início à primeira ação');

  // Steps nothing leads to never run. Not blocking, but worth pointing out.
  const warnings = {};
  if (start) {
    const reach = new Set([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const cur = queue.shift();
      for (const e of edges) {
        if (e.source === cur && !reach.has(e.target)) {
          reach.add(e.target);
          queue.push(e.target);
        }
      }
    }
    for (const n of nodes) if (!reach.has(n.id)) warnings[n.id] = 'Nenhum caminho chega a esta etapa';
  }

  const count = global.length + Object.values(byNode).reduce((s, l) => s + l.length, 0);
  return { byNode, global, warnings, count };
};

/** Lists problems as the flat, readable strings shown in the overview. */
export const problemList = (validation, nodes) => {
  const titleOf = (id) => nodes.find((n) => n.id === id)?.data?.title || 'Etapa';
  return [
    ...validation.global.map((text) => ({ text })),
    ...Object.entries(validation.byNode).flatMap(([id, list]) => list.map((text) => ({ id, text: `${titleOf(id)}: ${text}` }))),
  ];
};

let seq = 0;
export const newId = (prefix = 'n') => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Converts a stored definition (canonical or legacy) into React Flow state. */
export const toCanvas = (definition) => {
  let def = definition;
  if (typeof def === 'string') {
    try {
      def = JSON.parse(def);
    } catch {
      def = {};
    }
  }
  const rawNodes = Array.isArray(def?.nodes) ? def.nodes : [];
  const rawEdges = Array.isArray(def?.edges) ? def.edges : [];

  const nodes = rawNodes
    .filter((n) => n && n.id)
    .map((n) => {
      const type = LEGACY_TYPES[n.type] || n.type;
      const config = { ...(n.data || {}) };
      if (n.type === 'message' && !config.message) config.message = config.text || '';
      if ((n.type === 'collect' || n.type === 'collect_input') && !config.save_to) config.save_to = config.field || '';
      if (type === 'wait' && !config.unit) {
        config.amount = Number(config.seconds || config.delay) || 0;
        config.unit = 'seconds';
      }
      const spec = NODE_SPECS[type];
      const hasPos = n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y);
      return {
        id: String(n.id),
        type: spec ? type : 'send_message',
        position: hasPos ? { x: n.position.x, y: n.position.y } : { x: 0, y: 0 },
        data: { title: n.title || spec?.label || 'Etapa', config: spec ? { ...spec.defaults(), ...config } : config },
        deletable: type !== 'trigger',
        __needsLayout: !hasPos,
      };
    });

  const ids = new Set(nodes.map((n) => n.id));
  const edges = rawEdges
    .filter((e) => e && ids.has(String(e.source)) && ids.has(String(e.target)))
    .map((e) => {
      const source = nodes.find((n) => n.id === String(e.source));
      const outputs = NODE_SPECS[source.type]?.outputs || [];
      const handle = e.sourceHandle && outputs.some((o) => o.id === e.sourceHandle) ? e.sourceHandle : outputs[0]?.id;
      return {
        id: e.id ? String(e.id) : newId('e'),
        source: String(e.source),
        target: String(e.target),
        sourceHandle: handle,
      };
    });

  // Flows built before triggers existed start at their first root node.
  if (nodes.length && !nodes.some((n) => n.type === 'trigger')) {
    const targets = new Set(edges.map((e) => e.target));
    const root = nodes.find((n) => !targets.has(n.id)) || nodes[0];
    const trigger = {
      id: newId('start'),
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { title: 'Início', config: { ...NODE_SPECS.trigger.defaults(), event: 'manual' } },
      deletable: false,
      __needsLayout: true,
    };
    nodes.unshift(trigger);
    edges.push({ id: newId('e'), source: trigger.id, target: root.id, sourceHandle: 'next' });
  }

  const needsLayout = nodes.some((n) => n.__needsLayout);
  const clean = nodes.map(({ __needsLayout, ...n }) => n);
  return { nodes: needsLayout ? autoLayout(clean, edges) : clean, edges };
};

/** Serializes React Flow state into the definition the API stores. */
export const toDefinition = (nodes, edges) => ({
  nodes: nodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.data?.title || NODE_SPECS[n.type]?.label || '',
    data: n.data?.config || {},
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
  })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}) })),
});

export const NODE_WIDTH = 264;
const COL_GAP = 340;
const ROW_GAP = 150;

/**
 * Left-to-right layered layout: columns by distance from the start, rows in
 * the order outputs are declared (Sim above Não), so branches fan out evenly.
 */
export const autoLayout = (nodes, edges) => {
  if (!nodes.length) return nodes;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const outputsOrder = (e) => {
    const outs = NODE_SPECS[byId[e.source]?.type]?.outputs || [];
    const i = outs.findIndex((o) => o.id === e.sourceHandle);
    return i < 0 ? 0 : i;
  };
  const children = {};
  for (const e of edges) (children[e.source] ||= []).push(e);
  for (const k of Object.keys(children)) children[k].sort((a, b) => outputsOrder(a) - outputsOrder(b));

  const targets = new Set(edges.map((e) => e.target));
  const roots = [
    ...nodes.filter((n) => n.type === 'trigger'),
    ...nodes.filter((n) => n.type !== 'trigger' && !targets.has(n.id)),
  ];
  const depth = {};
  const order = [];
  const queue = roots.map((r) => r.id);
  for (const id of queue) depth[id] = 0;
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const e of children[id] || []) {
      if (depth[e.target] === undefined) {
        depth[e.target] = depth[id] + 1;
        queue.push(e.target);
      }
    }
  }
  // Cycles without an entry point: park them after the deepest column.
  const maxDepth = Math.max(0, ...Object.values(depth));
  for (const n of nodes) {
    if (depth[n.id] === undefined) {
      depth[n.id] = maxDepth + 1;
      order.push(n.id);
    }
  }

  const columns = {};
  for (const id of order) (columns[depth[id]] ||= []).push(id);
  const pos = {};
  for (const [col, ids] of Object.entries(columns)) {
    const offset = ((ids.length - 1) * ROW_GAP) / 2;
    ids.forEach((id, i) => {
      pos[id] = { x: Number(col) * COL_GAP, y: i * ROW_GAP - offset };
    });
  }
  return nodes.map((n) => ({ ...n, position: pos[n.id] || n.position }));
};

/** A fresh flow: just the start step. */
export const starterDefinition = () => ({
  nodes: [{ id: 'start', type: 'trigger', title: 'Início', data: NODE_SPECS.trigger.defaults(), position: { x: 0, y: 0 } }],
  edges: [],
});

export const TEMPLATE_VARS = [
  { token: '{{first_name}}', label: 'Primeiro nome' },
  { token: '{{contact.name}}', label: 'Nome completo' },
  { token: '{{contact.phone}}', label: 'Telefone' },
  { token: '{{contact.email}}', label: 'E-mail' },
  { token: '{{last_input}}', label: 'Última resposta' },
];

export const EXECUTION_STATUS = {
  running: { label: 'Executando', cls: 'text-sky-300 border-sky-500/25', active: true },
  waiting_input: { label: 'Aguardando resposta', cls: 'text-amber-300 border-amber-500/25', active: true },
  waiting_delay: { label: 'Aguardando tempo', cls: 'text-amber-300 border-amber-500/25', active: true },
  completed: { label: 'Concluída', cls: 'text-emerald-300 border-emerald-500/25' },
  failed: { label: 'Falhou', cls: 'text-rose-300 border-rose-500/25' },
  cancelled: { label: 'Cancelada', cls: 'text-slate-400 border-white/[0.08]' },
};
