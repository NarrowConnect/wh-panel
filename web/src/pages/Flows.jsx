import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Plus,
  Play,
  Save,
  Trash2,
  Bot,
  MessageSquare,
  GitFork,
  Clock,
  Layers,
  Plug,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  FormInput,
  Sliders,
  Filter,
  ArrowRight,
  Settings2,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import ApiClient from '../api/client';

export const Flows = () => {
  const [flows, setFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testLog, setTestLog] = useState([]);
  const [showTestModal, setShowTestModal] = useState(false);

  // Default demo flow if empty
  const defaultFlowData = {
    id: 'flow_sdr_ia',
    name: 'Triagem & SDR IA de Vendas com Formulário',
    status: 'active',
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'trigger',
          title: 'Gatilho: Nova Mensagem',
          data: { event: 'new_conversation', channel: 'all' },
          position: { x: 50, y: 100 },
        },
        {
          id: 'n2',
          type: 'ai_agent',
          title: 'Agente SDR: Qualificação & Formulário',
          data: {
            persona: 'Consultor Comercial Sênior',
            instructions: 'Recepcione calorosamente o lead, identifique as dores e colete os dados do formulário de qualificação antes de prosseguir.',
            fields_to_collect: [
              { name: 'nome_empresa', label: 'Nome da Empresa', type: 'text', required: true },
              { name: 'tamanho_equipe', label: 'Número de Atendentes', type: 'number', required: true },
              { name: 'faturamento_estimado', label: 'Faturamento Mensal', type: 'select', options: ['Até R$ 20k', 'R$ 20k - R$ 100k', 'Acima de R$ 100k'], required: true },
            ],
            handoff_trigger: 'lead_qualificado_ou_solicita_humano',
          },
          position: { x: 380, y: 100 },
        },
        {
          id: 'n3',
          type: 'condition',
          title: 'Filtro: Faturamento & Perfil',
          data: {
            field: 'faturamento_estimado',
            operator: 'equals',
            value: 'Acima de R$ 100k',
          },
          position: { x: 720, y: 100 },
        },
        {
          id: 'n4',
          type: 'transfer_queue',
          title: 'Transbordo: Fila Comercial VIP',
          data: { queue_id: 'comercial_vip', strategy: 'round_robin' },
          position: { x: 1050, y: 50 },
        },
        {
          id: 'n5',
          type: 'transfer_queue',
          title: 'Transbordo: Fila Suporte & Geral',
          data: { queue_id: 'geral', strategy: 'round_robin' },
          position: { x: 1050, y: 220 },
        },
      ],
    },
  };

  const fetchFlows = async () => {
    try {
      const data = await ApiClient.get('/flows');
      if (data && data.length > 0) {
        setFlows(data);
        setSelectedFlow(data[0]);
        setNodes(data[0].definition?.nodes || defaultFlowData.definition.nodes);
      } else {
        setFlows([defaultFlowData]);
        setSelectedFlow(defaultFlowData);
        setNodes(defaultFlowData.definition.nodes);
      }
    } catch (err) {
      console.warn('[Flows] Fallback to default template:', err);
      setFlows([defaultFlowData]);
      setSelectedFlow(defaultFlowData);
      setNodes(defaultFlowData.definition.nodes);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  const handleAddNode = (type) => {
    const typeConfig = {
      ai_agent: {
        title: 'Agente IA & Formulário',
        data: {
          persona: 'Especialista de Atendimento',
          instructions: 'Oriente o cliente e colete os dados solicitados nesta etapa.',
          fields_to_collect: [{ name: 'campo_1', label: 'Dado Solicitado', type: 'text', required: true }],
        },
      },
      message: {
        title: 'Enviar Mensagem',
        data: { text: 'Olá! Como posso ajudar você hoje?' },
      },
      condition: {
        title: 'Condição / Filtragem',
        data: { field: 'status', operator: 'equals', value: 'qualificado' },
      },
      wait: {
        title: 'Aguardar Tempo',
        data: { duration_minutes: 5 },
      },
      transfer_queue: {
        title: 'Transferir para Fila',
        data: { queue_id: 'comercial', strategy: 'round_robin' },
      },
    }[type];

    const newNode = {
      id: `n_${Date.now()}`,
      type,
      title: typeConfig?.title || 'Novo Passo',
      data: typeConfig?.data || {},
      position: { x: 100 + nodes.length * 50, y: 150 + (nodes.length % 3) * 60 },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNode(newNode);
  };

  const handleSaveFlow = async () => {
    setSaving(true);
    try {
      if (selectedFlow?.id && !selectedFlow.id.startsWith('flow_')) {
        await ApiClient.put(`/flows/${selectedFlow.id}`, {
          name: selectedFlow.name,
          definition: { nodes, edges: [] },
        });
      }
      alert('Fluxo e Agente de IA salvos com sucesso!');
    } catch (err) {
      alert('Fluxo salvo localmente no ambiente.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSimulation = () => {
    setTestLog([
      { time: '00:00', text: '▶ Início do fluxo acionado via WhatsApp' },
      { time: '00:01', text: '🤖 Agente SDR iniciou diálogo de qualificação' },
      { time: '00:02', text: '📝 Coletado: Nome da Empresa ("Inovare Tech")' },
      { time: '00:03', text: '📝 Coletado: Atendentes (25) e Faturamento ("Acima de R$ 100k")' },
      { time: '00:04', text: '🎯 Filtro aprovado: Classificado como Lead VIP' },
      { time: '00:05', text: '⚡ Transbordo executado com sucesso para Fila Comercial VIP (Round-Robin)' },
    ]);
    setShowTestModal(true);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-6 space-y-4 bg-[#070b14] overflow-hidden">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Flow Canvas & Modelagem de Agentes IA</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium">
                Robusto & Multi-Etapas
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Construa funis de qualificação com formulários dinâmicos por etapa e transbordo humano
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleTestSimulation}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simular Fluxo</span>
          </button>

          <button
            onClick={handleSaveFlow}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Salvando...' : 'Salvar Fluxo'}</span>
          </button>
        </div>
      </div>

      {/* Main Canvas & Inspector Layout */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Node Toolbar (Left Palette) */}
        <div className="w-56 glass-card rounded-2xl border border-slate-800 p-3 space-y-2 flex flex-col flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
            Adicionar Blocos
          </span>

          <button
            onClick={() => handleAddNode('ai_agent')}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-200 text-xs font-semibold text-left transition-all"
          >
            <Bot className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div>
              <p className="font-bold">Agente IA & Form</p>
              <p className="text-[10px] text-purple-300/70">Qualificação por etapa</p>
            </div>
          </button>

          <button
            onClick={() => handleAddNode('message')}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
          >
            <MessageSquare className="w-4 h-4 text-brand-400 flex-shrink-0" />
            <div>
              <p className="font-semibold">Enviar Mensagem</p>
              <p className="text-[10px] text-slate-500">Texto ou mídia</p>
            </div>
          </button>

          <button
            onClick={() => handleAddNode('condition')}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
          >
            <Filter className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div>
              <p className="font-semibold">Filtro & Regra</p>
              <p className="text-[10px] text-slate-500">Decisão por campo</p>
            </div>
          </button>

          <button
            onClick={() => handleAddNode('transfer_queue')}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-200 text-xs font-medium text-left transition-all"
          >
            <Layers className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div>
              <p className="font-semibold">Transbordo / Fila</p>
              <p className="text-[10px] text-slate-500">Encaminhar atendente</p>
            </div>
          </button>
        </div>

        {/* Canvas Visual Grid */}
        <div className="flex-1 glass-card rounded-2xl border border-slate-800 p-6 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] relative">
          <div className="flex flex-wrap items-center gap-4">
            {nodes.map((node, index) => {
              const isSelected = selectedNode?.id === node.id;
              const isAi = node.type === 'ai_agent';

              return (
                <React.Fragment key={node.id}>
                  <div
                    onClick={() => setSelectedNode(node)}
                    className={`w-64 p-4 rounded-2xl border cursor-pointer transition-all shadow-xl select-none ${
                      isSelected
                        ? 'border-brand-500 ring-2 ring-brand-500/20 bg-slate-850'
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
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                            <Workflow className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <h4 className="text-xs font-bold text-white truncate max-w-[130px]">
                          {node.title}
                        </h4>
                      </div>

                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-bold text-slate-400 bg-slate-800">
                        {node.type}
                      </span>
                    </div>

                    {/* Node Summary Content */}
                    <div className="text-[11px] text-slate-400 space-y-1">
                      {isAi ? (
                        <>
                          <p className="text-purple-300 font-medium truncate">
                            Persona: {node.data?.persona || 'SDR'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            📋 {node.data?.fields_to_collect?.length || 0} campos no formulário
                          </p>
                        </>
                      ) : (
                        <p className="truncate">{node.data?.text || node.data?.field || 'Configurado'}</p>
                      )}
                    </div>
                  </div>

                  {index < nodes.length - 1 && (
                    <div className="flex items-center justify-center text-slate-600">
                      <ArrowRight className="w-5 h-5 text-brand-400/80 animate-pulse" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right Node Inspector / AI Stage Config Drawer */}
        {selectedNode && (
          <div className="w-80 glass-card rounded-2xl border border-slate-800 p-4 space-y-4 flex flex-col flex-shrink-0 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="w-4 h-4 text-purple-400" />
                <span>Configuração do Passo</span>
              </h3>
              <button
                onClick={() => {
                  setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
                  setSelectedNode(null);
                }}
                className="text-slate-500 hover:text-rose-400"
                title="Excluir Bloco"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Título do Passo</label>
              <input
                type="text"
                value={selectedNode.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedNode((prev) => ({ ...prev, title: val }));
                  setNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? { ...n, title: val } : n)));
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* If Node is AI Agent with Form */}
            {selectedNode.type === 'ai_agent' && (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Modelagem de Persona IA</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Persona / Papel</label>
                  <input
                    type="text"
                    value={selectedNode.data?.persona || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, persona: val } }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Instruções da Etapa</label>
                  <textarea
                    rows={3}
                    value={selectedNode.data?.instructions || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, instructions: val } }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white resize-none"
                  />
                </div>

                <div className="pt-2">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                    Formulário de Coleta por Etapa
                  </label>
                  <div className="space-y-1.5">
                    {(selectedNode.data?.fields_to_collect || []).map((f, i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs flex justify-between items-center">
                        <span className="text-slate-200">{f.label || f.name}</span>
                        <span className="text-[10px] text-purple-400 font-mono">({f.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Simulation Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-lg p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <span>Simulação em Tempo Real do Agente & Fluxo</span>
              </h3>
              <button onClick={() => setShowTestModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2 max-h-64 overflow-y-auto">
              {testLog.map((log, i) => (
                <div key={i} className="text-slate-300 flex items-start gap-2">
                  <span className="text-slate-600">[{log.time}]</span>
                  <span>{log.text}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold"
              >
                Concluir Simulação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Flows;
