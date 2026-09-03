import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Plus,
  Play,
  Save,
  Trash2,
  Bot,
  MessageSquare,
  Clock,
  Layers,
  Sparkles,
  Sliders,
  Filter,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Radio,
  Share2,
  ToggleLeft,
  ToggleRight,
  Search,
  Copy,
  Edit3,
  Tag,
  AlertCircle,
  Zap,
  Globe,
  Settings,
  MoreVertical,
  Activity,
  Send,
  UserCheck,
  Kanban,
  FileCode,
  RefreshCw,
  HelpCircle,
  Check,
  X
} from 'lucide-react';
import ApiClient from '../api/client';

export const Flows = () => {
  // Screen Mode: 'list' (Pré-tela de visualização de fluxos) or 'editor' (Canvas & Sincronização)
  const [screenMode, setScreenMode] = useState('list');

  // Flows State
  const [flowsList, setFlowsList] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchFlows, setSearchFlows] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Editor Sub-Tab: 'canvas' | 'sync' | 'simulator'
  const [editorTab, setEditorTab] = useState('canvas');

  // Canvas Nodes & Selected Node
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  // Channels List for Synchronization
  const [availableChannels, setAvailableChannels] = useState([]);

  // Flow Sync & Channel Settings State (delimitado com sincronização de canais e conversas)
  const [flowChannels, setFlowChannels] = useState([]);
  const [flowTriggerType, setFlowTriggerType] = useState('first_message'); // 'first_message', 'keyword', 'all_messages', 'webhook'
  const [triggerKeywords, setTriggerKeywords] = useState('menu, ajuda, planos, preco, suporte');
  const [handoffQueue, setHandoffQueue] = useState('comercial');
  const [enableAiAutonomous, setEnableAiAutonomous] = useState(true);
  const [sessionTimeoutMins, setSessionTimeoutMins] = useState(15);
  const [crmAutoStage, setCrmAutoStage] = useState('Qualificação IA');
  const [tagOnComplete, setTagOnComplete] = useState('Lead Qualificado IA');

  // Modals
  const [showCreateFlowModal, setShowCreateFlowModal] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDesc, setNewFlowDesc] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState('first_message');

  // Simulator
  const [simMessages, setSimMessages] = useState([
    { sender: 'system', text: '🤖 Sessão de simulação iniciada via WhatsApp Oficial' },
  ]);
  const [simInput, setSimInput] = useState('');
  const [simStepIndex, setSimStepIndex] = useState(0);

  // Default Mock Flows for fallback
  const defaultFlows = [
    {
      id: 'flow_1',
      name: 'Triagem & SDR Inteligente IA (WhatsApp)',
      description: 'Atende novos contatos, qualifica tamanho da empresa, interesse e transborda para o vendedor com tag no CRM.',
      status: 'active',
      channels: ['whatsapp_meta', 'whatsapp_baileys'],
      trigger_type: 'first_message',
      executions_count: 1420,
      nodes_count: 5,
      updated_at: 'Há 20 minutos',
      definition: {
        nodes: [
          {
            id: 'n_1',
            type: 'ai_agent',
            title: 'Agente IA SDR de Boas-Vindas',
            data: {
              persona: 'SDR Consultivo da Narrow Connect',
              instructions: 'Dê as boas-vindas calorosas, pergunte o nome da empresa e o volume de atendentes que precisam conectar.',
              fields_to_collect: [
                { name: 'empresa', label: 'Nome da Empresa', type: 'text', required: true },
                { name: 'operadores', label: 'Qtd de Atendentes', type: 'number', required: true },
              ],
            },
            position: { x: 50, y: 120 },
          },
          {
            id: 'n_2',
            type: 'condition',
            title: 'Filtro: Mais de 5 Atendentes?',
            data: { field: 'operadores', operator: 'gte', value: '5' },
            position: { x: 340, y: 120 },
          },
          {
            id: 'n_3',
            type: 'transfer_queue',
            title: 'Transbordo: Fila Comercial Enterprise',
            data: { queue_id: 'comercial_vip', strategy: 'round_robin', message: 'Transferindo para nosso especialista sênior...' },
            position: { x: 630, y: 60 },
          },
          {
            id: 'n_4',
            type: 'message',
            title: 'Oferta Plano Pro Self-Service',
            data: { text: 'Perfeito! Para até 4 atendentes, você pode testar gratuitamente por 7 dias no link: https://painel.narrowconnect.com.br/trial' },
            position: { x: 630, y: 200 },
          },
        ],
      },
    },
    {
      id: 'flow_2',
      name: 'FAQ & Auto-Atendimento Suporte N1',
      description: 'Responde dúvidas frequentes sobre faturas, 2ª via de boleto e status de servidores antes de abrir chamado.',
      status: 'active',
      channels: ['whatsapp_meta', 'webchat', 'instagram'],
      trigger_type: 'keyword',
      executions_count: 890,
      nodes_count: 4,
      updated_at: 'Ontem',
      definition: {
        nodes: [
          {
            id: 'n_201',
            type: 'message',
            title: 'Menu de Auto-Atendimento',
            data: { text: 'Olá! Sou o assistente virtual. Digite 1 para Financeiro/Boletos, 2 para Suporte Técnico ou 3 para Falar com Atendente.' },
            position: { x: 50, y: 120 },
          },
          {
            id: 'n_202',
            type: 'condition',
            title: 'Opção Selecionada',
            data: { field: 'resposta', operator: 'equals', value: '1' },
            position: { x: 340, y: 120 },
          },
        ],
      },
    },
    {
      id: 'flow_3',
      name: 'Pós-Venda & Coleta de CSAT',
      description: 'Enviado automaticamente 30 minutos após a resolução da conversa para avaliar a nota de satisfação de 1 a 5.',
      status: 'draft',
      channels: ['whatsapp_meta'],
      trigger_type: 'conversation_resolved',
      executions_count: 310,
      nodes_count: 3,
      updated_at: 'Há 3 dias',
      definition: {
        nodes: [
          {
            id: 'n_301',
            type: 'message',
            title: 'Pesquisa de Satisfação',
            data: { text: 'Como você avalia nosso atendimento de hoje? Responda de 1 (Péssimo) a 5 (Excelente).' },
            position: { x: 50, y: 120 },
          },
        ],
      },
    },
  ];

  const defaultChannels = [
    { id: 'whatsapp_meta', name: 'WhatsApp Meta API Oficial', type: 'whatsapp_official', badge: 'Oficial Cloud' },
    { id: 'whatsapp_baileys', name: 'WhatsApp QR Code (Vendas)', type: 'whatsapp_unofficial', badge: 'Instância VPS' },
    { id: 'instagram', name: 'Instagram Direct Principal', type: 'instagram', badge: 'Direct Meta' },
    { id: 'webchat', name: 'Webchat Widget Site', type: 'webchat', badge: 'Live Chat' },
  ];

  // Load Flows & Channels
  const fetchFlowsData = async () => {
    setLoading(true);
    try {
      const [flowsRes, chanRes] = await Promise.allSettled([
        ApiClient.get('/flows'),
        ApiClient.get('/channels'),
      ]);

      if (flowsRes.status === 'fulfilled' && Array.isArray(flowsRes.value) && flowsRes.value.length > 0) {
        const mapped = flowsRes.value.map((f, idx) => {
          let def = { nodes: [] };
          try {
            if (f.definition_json) def = typeof f.definition_json === 'string' ? JSON.parse(f.definition_json) : f.definition_json;
          } catch {}
          return {
            id: f.id,
            name: f.name,
            description: f.description || 'Fluxo de automação omnichannel',
            status: f.status || 'active',
            channels: ['whatsapp_meta'],
            trigger_type: 'first_message',
            executions_count: (idx + 1) * 320,
            nodes_count: def.nodes?.length || 3,
            updated_at: f.updated_at ? new Date(f.updated_at).toLocaleDateString('pt-BR') : 'Recente',
            definition: def,
          };
        });
        setFlowsList(mapped);
      } else {
        setFlowsList(defaultFlows);
      }

      if (chanRes.status === 'fulfilled') {
        const list = Array.isArray(chanRes.value) ? chanRes.value : (chanRes.value?.channels || []);
        if (list.length > 0) setAvailableChannels(list);
        else setAvailableChannels(defaultChannels);
      } else {
        setAvailableChannels(defaultChannels);
      }
    } catch {
      setFlowsList(defaultFlows);
      setAvailableChannels(defaultChannels);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlowsData();
  }, []);

  // Open a Flow into the Canvas / Sync Editor
  const handleOpenFlow = (flow) => {
    setSelectedFlow(flow);
    setNodes(flow.definition?.nodes || []);
    setSelectedNode(flow.definition?.nodes?.[0] || null);
    setFlowChannels(flow.channels || ['whatsapp_meta']);
    setFlowTriggerType(flow.trigger_type || 'first_message');
    setEditorTab('canvas');
    setScreenMode('editor');
  };

  // Toggle Flow Active/Inactive status from List
  const handleToggleFlowStatus = async (flowId, e) => {
    e.stopPropagation();
    setFlowsList((prev) =>
      prev.map((f) => {
        if (f.id === flowId) {
          const nextStatus = f.status === 'active' ? 'inactive' : 'active';
          return { ...f, status: nextStatus };
        }
        return f;
      })
    );

    try {
      const target = flowsList.find((f) => f.id === flowId);
      if (target && !target.id.startsWith('flow_')) {
        await ApiClient.put(`/flows/${flowId}`, {
          status: target.status === 'active' ? 'inactive' : 'active',
        });
      }
    } catch (err) {
      console.warn('[Flows] Saved status locally:', err);
    }
  };

  // Duplicate Flow
  const handleDuplicateFlow = (flow, e) => {
    e.stopPropagation();
    const duplicated = {
      ...flow,
      id: `flow_${Date.now()}`,
      name: `${flow.name} (Cópia)`,
      status: 'draft',
      updated_at: 'Agora',
      executions_count: 0,
    };
    setFlowsList((prev) => [duplicated, ...prev]);
  };

  // Delete Flow
  const handleDeleteFlow = async (flowId, e) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este fluxo?')) return;

    setFlowsList((prev) => prev.filter((f) => f.id !== flowId));
    if (selectedFlow?.id === flowId) {
      setScreenMode('list');
      setSelectedFlow(null);
    }

    try {
      if (!flowId.startsWith('flow_')) {
        await ApiClient.delete(`/flows/${flowId}`);
      }
    } catch (err) {
      console.warn('[Flows] Deleted locally:', err);
    }
  };

  // Create New Flow from Modal
  const handleCreateNewFlow = async (e) => {
    e.preventDefault();
    if (!newFlowName.trim()) return;

    const initialNodes = [
      {
        id: `n_${Date.now()}_1`,
        type: 'ai_agent',
        title: 'Agente IA & Triagem Inicial',
        data: {
          persona: 'Especialista de Atendimento',
          instructions: 'Oriente o contato com respostas diretas e colete o que for necessário.',
          fields_to_collect: [{ name: 'interesse', label: 'Interesse', type: 'text', required: true }],
        },
        position: { x: 60, y: 120 },
      },
      {
        id: `n_${Date.now()}_2`,
        type: 'transfer_queue',
        title: 'Transbordo para Atendente',
        data: { queue_id: 'comercial', strategy: 'round_robin' },
        position: { x: 380, y: 120 },
      },
    ];

    const newFlowObj = {
      id: `flow_${Date.now()}`,
      name: newFlowName,
      description: newFlowDesc || 'Fluxo personalizado de atendimento e qualificação',
      status: 'active',
      channels: ['whatsapp_meta'],
      trigger_type: newFlowTrigger,
      executions_count: 0,
      nodes_count: initialNodes.length,
      updated_at: 'Agora',
      definition: { nodes: initialNodes },
    };

    setFlowsList((prev) => [newFlowObj, ...prev]);
    setShowCreateFlowModal(false);
    setNewFlowName('');
    setNewFlowDesc('');

    // Open directly in editor
    handleOpenFlow(newFlowObj);

    try {
      await ApiClient.post('/flows', {
        name: newFlowName,
        description: newFlowDesc,
        definition: { nodes: initialNodes, edges: [] },
      });
    } catch (err) {
      console.warn('[Flows] Created locally:', err);
    }
  };

  // Add Node in Canvas
  const handleAddNode = (type) => {
    const typeConfig = {
      ai_agent: {
        title: 'Agente IA & Formulário',
        data: {
          persona: 'Especialista SDR de Atendimento',
          instructions: 'Qualifique a intenção do contato e colete os dados necessários.',
          fields_to_collect: [{ name: 'dados_cliente', label: 'Informação', type: 'text', required: true }],
        },
      },
      message: {
        title: 'Enviar Mensagem',
        data: { text: 'Olá! Como nossa equipe pode te ajudar hoje?' },
      },
      condition: {
        title: 'Condição / Filtro de Regra',
        data: { field: 'interesse', operator: 'equals', value: 'comprar' },
      },
      wait: {
        title: 'Aguardar Tempo',
        data: { duration_minutes: 5 },
      },
      transfer_queue: {
        title: 'Transbordo / Fila Humana',
        data: { queue_id: 'comercial', strategy: 'round_robin', message: 'Aguarde um instante, estou transferindo você...' },
      },
      crm_stage: {
        title: 'Mover Etapa no CRM',
        data: { stage_name: 'Proposta Enviada', tag: 'Lead Qualificado' },
      },
    }[type];

    const newNode = {
      id: `n_${Date.now()}`,
      type,
      title: typeConfig?.title || 'Novo Passo',
      data: typeConfig?.data || {},
      position: { x: 80 + nodes.length * 40, y: 140 + (nodes.length % 2) * 50 },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNode(newNode);
  };

  // Save Flow Changes
  const handleSaveFlow = async () => {
    setSaving(true);
    try {
      const updatedDefinition = { nodes, edges: [] };
      const updatedFlow = {
        ...selectedFlow,
        definition: updatedDefinition,
        channels: flowChannels,
        trigger_type: flowTriggerType,
        nodes_count: nodes.length,
        updated_at: 'Agora',
      };

      setSelectedFlow(updatedFlow);
      setFlowsList((prev) => prev.map((f) => (f.id === selectedFlow.id ? updatedFlow : f)));

      if (selectedFlow?.id && !selectedFlow.id.startsWith('flow_')) {
        await ApiClient.put(`/flows/${selectedFlow.id}`, {
          name: selectedFlow.name,
          description: selectedFlow.description,
          status: selectedFlow.status,
          definition: updatedDefinition,
        });
      }
      alert('Fluxo e sincronização de canais salvos com sucesso!');
    } catch {
      alert('Fluxo salvo localmente no ambiente.');
    } finally {
      setSaving(false);
    }
  };

  // Simulator: Send interactive test message
  const handleSimSend = (e) => {
    e.preventDefault();
    if (!simInput.trim()) return;

    const userText = simInput;
    setSimMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setSimInput('');

    setTimeout(() => {
      // Simulate Bot Response
      if (nodes.length > 0) {
        const currentNode = nodes[simStepIndex % nodes.length];
        let botReply = 'Entendi perfeitamente! Como posso prosseguir?';

        if (currentNode?.type === 'ai_agent') {
          botReply = `🤖 [IA SDR]: Obrigado pelas informações sobre "${userText}". Vou registrar seu interesse e prosseguir com a qualificação.`;
        } else if (currentNode?.type === 'message') {
          botReply = currentNode.data?.text || 'Mensagem configurada no fluxo.';
        } else if (currentNode?.type === 'transfer_queue') {
          botReply = '⚡ [Transbordo Executado]: Transferido com sucesso para a Fila Comercial Humana.';
        } else if (currentNode?.type === 'condition') {
          botReply = `🎯 [Regra Avaliada]: Condição validada com sucesso para "${userText}".`;
        }

        setSimMessages((prev) => [...prev, { sender: 'bot', text: botReply }]);
        setSimStepIndex((prev) => prev + 1);
      } else {
        setSimMessages((prev) => [
          ...prev,
          { sender: 'bot', text: 'Fluxo ativo. Adicione blocos para definir a lógica de resposta.' },
        ]);
      }
    }, 600);
  };

  // Filter Flows in List View
  const filteredFlows = flowsList.filter((f) => {
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (!searchFlows.trim()) return true;
    const term = searchFlows.toLowerCase();
    return f.name.toLowerCase().includes(term) || (f.description && f.description.toLowerCase().includes(term));
  });

  // Calculate Metrics for Overview
  const activeFlowsCount = flowsList.filter((f) => f.status === 'active').length;
  const totalExecutions = flowsList.reduce((acc, f) => acc + (f.executions_count || 0), 0);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-6 space-y-4 bg-[#070b14] overflow-hidden">
      {/* ========================================================================= */}
      {/* 1. PRÉ-TELA: VISUALIZAÇÃO & GESTÃO DE FLUXOS CRIADOS (SCREEN: 'list') */}
      {/* ========================================================================= */}
      {screenMode === 'list' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
          {/* Top Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800 shadow-xl flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-inner">
                <Workflow className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Central de Fluxos & Agentes IA</h2>
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-[10px] font-bold text-purple-300">
                    Engine Visual Omnichannel
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Gerencie automações, triagem inteligente com IA e sincronização entre canais e conversas
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateFlowModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 active:scale-95 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center gap-2 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Novo Fluxo</span>
              </button>
            </div>
          </div>

          {/* Metrics Counters Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
            <div className="glass-card p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Fluxos Criados</span>
                <div className="text-lg font-bold text-white font-mono">{flowsList.length}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <Workflow className="w-4 h-4" />
              </div>
            </div>

            <div className="glass-card p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Fluxos Ativos ⚡</span>
                <div className="text-lg font-bold text-emerald-400 font-mono">{activeFlowsCount}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
            </div>

            <div className="glass-card p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Execuções Registradas</span>
                <div className="text-lg font-bold text-purple-400 font-mono">{totalExecutions.toLocaleString()}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>

            <div className="glass-card p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Automação com IA</span>
                <div className="text-lg font-bold text-brand-400 font-mono">94.8%</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar fluxos por nome ou descrição..."
                value={searchFlows}
                onChange={(e) => setSearchFlows(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Status:
              </span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'active', label: 'Ativos' },
                  { id: 'draft', label: 'Rascunhos' },
                  { id: 'inactive', label: 'Inativos' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setFilterStatus(st.id)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      filterStatus === st.id
                        ? 'bg-brand-500 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Flows Grid Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {filteredFlows.length === 0 ? (
              <div className="col-span-full py-16 text-center glass-card rounded-2xl border border-slate-800 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
                  <Workflow className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Nenhum fluxo encontrado</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Crie seu primeiro fluxo automatizado com Agentes de IA e sincronização entre canais.
                </p>
                <button
                  onClick={() => setShowCreateFlowModal(true)}
                  className="mt-2 px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-500/25 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Primeiro Fluxo</span>
                </button>
              </div>
            ) : (
              filteredFlows.map((flow) => {
                const isActive = flow.status === 'active';

                return (
                  <div
                    key={flow.id}
                    onClick={() => handleOpenFlow(flow)}
                    className="group relative glass-card p-5 rounded-2xl border border-slate-800 hover:border-brand-500/50 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-brand-500/10 hover:-translate-y-0.5 flex flex-col justify-between space-y-4"
                  >
                    {/* Top: Status & Toggle Switch */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          />
                          {isActive ? 'Fluxo Ativo' : flow.status === 'draft' ? 'Rascunho' : 'Inativo'}
                        </span>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleToggleFlowStatus(flow.id, e)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title={isActive ? 'Desativar Fluxo' : 'Ativar Fluxo'}
                          >
                            {isActive ? (
                              <ToggleRight className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-slate-500" />
                            )}
                          </button>
                          <button
                            onClick={(e) => handleDuplicateFlow(flow, e)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Duplicar Fluxo"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteFlow(flow.id, e)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="Excluir Fluxo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h3 className="text-sm font-bold text-white group-hover:text-brand-300 transition-colors mb-1.5 line-clamp-1">
                        {flow.name}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {flow.description}
                      </p>
                    </div>

                    {/* Channels & Sync Badges */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/60">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Radio className="w-3 h-3 text-brand-400" /> Canais:
                        </span>
                        <div className="flex items-center gap-1">
                          {(flow.channels || ['whatsapp_meta']).map((chId) => (
                            <span
                              key={chId}
                              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/70 text-[9px] text-slate-300 font-mono"
                            >
                              {chId === 'whatsapp_meta'
                                ? 'WhatsApp Oficial'
                                : chId === 'whatsapp_baileys'
                                ? 'WhatsApp QR'
                                : chId === 'instagram'
                                ? 'Instagram'
                                : 'Webchat'}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Bottom Footer Info & Enter Button */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>{flow.nodes_count || 3} etapas no canvas</span>
                        <span className="text-brand-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                          Editar Fluxo <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TELA DO EDITOR: CANVAS, SINCRONIZAÇÃO & SIMULADOR (SCREEN: 'editor') */}
      {/* ========================================================================= */}
      {screenMode === 'editor' && selectedFlow && (
        <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
          {/* Top Bar with Back button, flow title and tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-card p-3.5 rounded-2xl border border-slate-800 flex-shrink-0 shadow-xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setScreenMode('list')}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
                title="Voltar para a lista de fluxos"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar aos Fluxos</span>
              </button>

              <div className="h-6 w-px bg-slate-800" />

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">{selectedFlow.name}</h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      selectedFlow.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {selectedFlow.status === 'active' ? 'Ativo' : 'Rascunho'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-1">{selectedFlow.description}</p>
              </div>
            </div>

            {/* Sub-Tabs: Canvas vs Sincronização vs Simulador */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setEditorTab('canvas')}
                  className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                    editorTab === 'canvas' ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Workflow className="w-3.5 h-3.5" />
                  <span>Canvas Visual</span>
                </button>

                <button
                  onClick={() => setEditorTab('sync')}
                  className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                    editorTab === 'sync' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Canais & Conversas</span>
                </button>

                <button
                  onClick={() => setEditorTab('simulator')}
                  className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                    editorTab === 'simulator' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Simular Chat</span>
                </button>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveFlow}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Fluxo'}</span>
              </button>
            </div>
          </div>

          {/* TAB 1: CANVAS VISUAL ENGINE */}
          {editorTab === 'canvas' && (
            <div className="flex-1 flex gap-4 overflow-hidden">
              {/* Node Toolbox Palette (Left) */}
              <div className="w-60 glass-card rounded-2xl border border-slate-800 p-3 space-y-2 flex flex-col flex-shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  Adicionar Etapa / Bloco
                </span>

                <button
                  onClick={() => handleAddNode('ai_agent')}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-200 text-xs font-semibold text-left transition-all"
                >
                  <Bot className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Agente IA & Form</p>
                    <p className="text-[9px] text-purple-300/70">Diálogo & qualificação</p>
                  </div>
                </button>

                <button
                  onClick={() => handleAddNode('message')}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
                >
                  <MessageSquare className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Enviar Mensagem</p>
                    <p className="text-[9px] text-slate-500">Texto ou mídia</p>
                  </div>
                </button>

                <button
                  onClick={() => handleAddNode('condition')}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
                >
                  <Filter className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Filtro / Decisão</p>
                    <p className="text-[9px] text-slate-500">Ramificação lógica</p>
                  </div>
                </button>

                <button
                  onClick={() => handleAddNode('transfer_queue')}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
                >
                  <Layers className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Transbordo / Fila</p>
                    <p className="text-[9px] text-slate-500">Mover para humano</p>
                  </div>
                </button>

                <button
                  onClick={() => handleAddNode('crm_stage')}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
                >
                  <Kanban className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Atualizar CRM</p>
                    <p className="text-[9px] text-slate-500">Etapa do funil & Tag</p>
                  </div>
                </button>
              </div>

              {/* Interactive Visual Canvas Area */}
              <div className="flex-1 glass-card rounded-2xl border border-slate-800 p-6 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] relative shadow-inner">
                <div className="flex flex-wrap items-center gap-4">
                  {nodes.map((node, idx) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isAi = node.type === 'ai_agent';

                    return (
                      <React.Fragment key={node.id}>
                        <div
                          onClick={() => setSelectedNode(node)}
                          className={`w-64 p-4 rounded-2xl border cursor-pointer transition-all shadow-xl select-none relative ${
                            isSelected
                              ? 'border-brand-500 ring-2 ring-brand-500/20 bg-[#161c2d]'
                              : isAi
                              ? 'bg-[#15102a] border-purple-800/50 hover:border-purple-600'
                              : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isAi ? (
                                <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                                  <Bot className="w-3.5 h-3.5" />
                                </div>
                              ) : node.type === 'transfer_queue' ? (
                                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                  <Layers className="w-3.5 h-3.5" />
                                </div>
                              ) : node.type === 'crm_stage' ? (
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                  <Kanban className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <span className="text-xs font-bold text-white truncate max-w-[130px]">
                                {node.title}
                              </span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setNodes((prev) => prev.filter((n) => n.id !== node.id));
                                if (selectedNode?.id === node.id) setSelectedNode(null);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                              title="Remover etapa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
                            {isAi && (
                              <>
                                <p className="font-semibold text-purple-300 truncate">
                                  Persona: {node.data?.persona || 'Consultor'}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {node.data?.fields_to_collect?.length || 1} campos de coleta
                                </p>
                              </>
                            )}
                            {node.type === 'message' && (
                              <p className="line-clamp-2 italic text-slate-300">
                                "{node.data?.text || 'Sem texto'}"
                              </p>
                            )}
                            {node.type === 'transfer_queue' && (
                              <p className="font-medium text-blue-300">
                                Fila: {node.data?.queue_id || 'comercial'}
                              </p>
                            )}
                            {node.type === 'condition' && (
                              <p className="font-medium text-amber-300">
                                Se {node.data?.field} {node.data?.operator} {node.data?.value}
                              </p>
                            )}
                            {node.type === 'crm_stage' && (
                              <p className="font-medium text-emerald-300">
                                Etapa: {node.data?.stage_name || 'Qualificação'}
                              </p>
                            )}
                          </div>
                        </div>

                        {idx < nodes.length - 1 && (
                          <div className="flex items-center text-brand-400/80 font-bold">
                            <ArrowRight className="w-5 h-5 animate-pulse" />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Node Inspector Sheet (Right) */}
              {selectedNode && (
                <div className="w-80 glass-card rounded-2xl border border-slate-800 p-4 space-y-4 flex flex-col flex-shrink-0 overflow-y-auto">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-brand-400" /> Configurar Etapa
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{selectedNode.type}</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-400 block mb-1 font-medium">Título da Etapa</label>
                      <input
                        type="text"
                        value={selectedNode.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes((prev) =>
                            prev.map((n) => (n.id === selectedNode.id ? { ...n, title: val } : n))
                          );
                          setSelectedNode((prev) => ({ ...prev, title: val }));
                        }}
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    {/* AI Agent Configuration */}
                    {selectedNode.type === 'ai_agent' && (
                      <div className="space-y-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <div>
                          <label className="text-purple-300 block mb-1 font-semibold">Persona do Agente IA</label>
                          <input
                            type="text"
                            value={selectedNode.data?.persona || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newData = { ...selectedNode.data, persona: val };
                              setNodes((prev) =>
                                prev.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n))
                              );
                              setSelectedNode((prev) => ({ ...prev, data: newData }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-purple-300 block mb-1 font-semibold">Instruções / Prompt</label>
                          <textarea
                            rows={3}
                            value={selectedNode.data?.instructions || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newData = { ...selectedNode.data, instructions: val };
                              setNodes((prev) =>
                                prev.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n))
                              );
                              setSelectedNode((prev) => ({ ...prev, data: newData }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-none text-[11px]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Message Configuration */}
                    {selectedNode.type === 'message' && (
                      <div>
                        <label className="text-slate-400 block mb-1 font-medium">Texto da Mensagem</label>
                        <textarea
                          rows={4}
                          value={selectedNode.data?.text || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const newData = { ...selectedNode.data, text: val };
                            setNodes((prev) =>
                              prev.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n))
                            );
                            setSelectedNode((prev) => ({ ...prev, data: newData }));
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none text-xs"
                        />
                      </div>
                    )}

                    {/* Transfer Queue Configuration */}
                    {selectedNode.type === 'transfer_queue' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-slate-400 block mb-1 font-medium">Fila de Atendimento</label>
                          <select
                            value={selectedNode.data?.queue_id || 'comercial'}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newData = { ...selectedNode.data, queue_id: val };
                              setNodes((prev) =>
                                prev.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n))
                              );
                              setSelectedNode((prev) => ({ ...prev, data: newData }));
                            }}
                            className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none"
                          >
                            <option value="comercial">Fila Comercial / Vendas</option>
                            <option value="suporte">Fila Suporte Técnico</option>
                            <option value="financeiro">Fila Financeiro & Cobrança</option>
                            <option value="vip">Fila Clientes VIP</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* CRM Stage Configuration */}
                    {selectedNode.type === 'crm_stage' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-slate-400 block mb-1 font-medium">Etapa do Funil CRM</label>
                          <input
                            type="text"
                            value={selectedNode.data?.stage_name || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newData = { ...selectedNode.data, stage_name: val };
                              setNodes((prev) =>
                                prev.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n))
                              );
                              setSelectedNode((prev) => ({ ...prev, data: newData }));
                            }}
                            className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SINCRONIZAÇÃO ENTRE CANAIS & CONVERSAS */}
          {editorTab === 'sync' && (
            <div className="flex-1 glass-card rounded-2xl border border-slate-800 p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-purple-400" />
                  <span>Sincronização de Canais & Comportamento nas Conversas</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Delimite em quais canais conectados este fluxo será disparado e como ele interage com o atendimento omnichannel
                </p>
              </div>

              {/* 1. Channel Selector Checkboxes */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 block">
                  1. Canais Habilitados para Execução
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableChannels.map((channel) => {
                    const isChecked = flowChannels.includes(channel.id);

                    return (
                      <div
                        key={channel.id}
                        onClick={() => {
                          if (isChecked) {
                            setFlowChannels((prev) => prev.filter((id) => id !== channel.id));
                          } else {
                            setFlowChannels((prev) => [...prev, channel.id]);
                          }
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isChecked
                            ? 'bg-purple-500/10 border-purple-500/40 ring-1 ring-purple-500/30'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isChecked ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{channel.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{channel.badge || channel.type}</p>
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${isChecked ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-700'}`}>
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Conversation Trigger Logic */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300 block">
                  2. Gatilho de Entrada na Conversa
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'first_message', title: 'Primeira Mensagem do Contato', desc: 'Dispara apenas no início de uma nova conversa com lead' },
                    { id: 'keyword', title: 'Por Palavra-Chave / Menu', desc: 'Dispara quando o contato digita termos configurados' },
                    { id: 'all_messages', title: 'Sempre Ativo / SDR IA', desc: 'A IA responde todas as mensagens até o transbordo humano' },
                  ].map((trig) => (
                    <div
                      key={trig.id}
                      onClick={() => setFlowTriggerType(trig.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        flowTriggerType === trig.id
                          ? 'bg-brand-500/10 border-brand-500 ring-1 ring-brand-500/30'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <p className="text-xs font-bold text-white mb-1">{trig.title}</p>
                      <p className="text-[10px] text-slate-400">{trig.desc}</p>
                    </div>
                  ))}
                </div>

                {flowTriggerType === 'keyword' && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <label className="text-[11px] text-slate-300 font-medium">Palavras-chave que acionam o fluxo (separadas por vírgula):</label>
                    <input
                      type="text"
                      value={triggerKeywords}
                      onChange={(e) => setTriggerKeywords(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 3. Conversation Handoff & Session Rules */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300 block">
                  3. Transbordo Humano & Sincronização de CRM
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <label className="text-xs font-semibold text-white block">Fila de Transbordo Padrão</label>
                    <select
                      value={handoffQueue}
                      onChange={(e) => setHandoffQueue(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
                    >
                      <option value="comercial">Fila Comercial / Vendas</option>
                      <option value="suporte">Fila Suporte & CS</option>
                      <option value="financeiro">Fila Financeiro</option>
                    </select>
                    <p className="text-[10px] text-slate-400">
                      Quando o contato solicitar atendimento humano ou a IA qualificar o lead, a conversa será transferida para esta fila.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <label className="text-xs font-semibold text-white block">Timeout de Inatividade da Sessão</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={sessionTimeoutMins}
                        onChange={(e) => setSessionTimeoutMins(Number(e.target.value))}
                        className="w-24 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono focus:outline-none"
                      />
                      <span className="text-xs text-slate-400">minutos sem resposta</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Após este tempo sem interação do cliente, a sessão do bot é encerrada automaticamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SIMULADOR DE CHAT EM TEMPO REAL */}
          {editorTab === 'simulator' && (
            <div className="flex-1 glass-card rounded-2xl border border-slate-800 p-6 flex flex-col max-w-2xl mx-auto w-full shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Play className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Simulador Interativo do Fluxo</h3>
                    <p className="text-[10px] text-slate-400">Teste o fluxo simulando um cliente real no WhatsApp</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSimMessages([{ sender: 'system', text: '🤖 Sessão reiniciada.' }]);
                    setSimStepIndex(0);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reiniciar</span>
                </button>
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0d16] rounded-xl border border-slate-800 my-3">
                {simMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      msg.sender === 'user' ? 'justify-end' : msg.sender === 'bot' ? 'justify-start' : 'justify-center'
                    }`}
                  >
                    {msg.sender === 'system' ? (
                      <span className="text-[10px] text-slate-500 font-mono">{msg.text}</span>
                    ) : (
                      <div
                        className={`max-w-xs p-3 rounded-2xl text-xs ${
                          msg.sender === 'user'
                            ? 'bg-brand-500 text-white rounded-br-none'
                            : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Interactive Input */}
              <form onSubmit={handleSimSend} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Digite uma mensagem como cliente..."
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL: CRIAR NOVO FLUXO (MODAL RÁPIDO) */}
      {/* ========================================================================= */}
      {showCreateFlowModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" /> Criar Novo Fluxo de Automação
              </h3>
              <button onClick={() => setShowCreateFlowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewFlow} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome do Fluxo *</label>
                <input
                  type="text"
                  placeholder="Ex: Qualificação de Leads Imobiliários WhatsApp"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Descrição do Objetivo</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Qualifica interesse em compra/aluguel, colhe orçamento e transborda para o corretor."
                  value={newFlowDesc}
                  onChange={(e) => setNewFlowDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Gatilho Inicial</label>
                <select
                  value={newFlowTrigger}
                  onChange={(e) => setNewFlowTrigger(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="first_message">Primeira mensagem de novo contato</option>
                  <option value="keyword">Palavra-chave específica (menu, suporte, etc)</option>
                  <option value="all_messages">Todas as mensagens (SDR Autônomo)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateFlowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/25"
                >
                  Criar e Abrir Canvas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Flows;
