import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Users,
  Shuffle,
  Shield,
  Clock,
  ArrowRight,
  Settings,
  ToggleLeft,
  ToggleRight,
  Filter,
  CheckCircle2,
  GitFork
} from 'lucide-react';
import ApiClient from '../api/client';

export const Queues = () => {
  const [queues, setQueues] = useState([]);
  const [activeTab, setActiveTab] = useState('queues'); // 'queues' or 'rules'
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Queue Form
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('round_robin');

  // Pre-Triage Rules State (3.7)
  const [rules, setRules] = useState([
    { id: 'r1', name: 'Leads VIP -> Fila Comercial VIP', condition: 'Tag contém #VIP OU Faturamento > R$ 50k', targetQueue: 'Comercial & Vendas', priority: 1, active: true },
    { id: 'r2', name: 'Clientes Existentes -> Fila Suporte N1', condition: 'Contato já possui atendimentos anteriores', targetQueue: 'Suporte Técnico N1', priority: 2, active: true },
    { id: 'r3', name: 'Canal Instagram -> Fila de Triagem Rápida', condition: 'Canal de Origem é Instagram Direct', targetQueue: 'Comercial & Vendas', priority: 3, active: true },
  ]);

  const [ruleName, setRuleName] = useState('');
  const [ruleCondition, setRuleCondition] = useState('');
  const [ruleTargetQueue, setRuleTargetQueue] = useState('');

  const defaultQueues = [
    { id: 'q1', name: 'Comercial & Vendas', strategy: 'round_robin', attendants_count: 5, active_conversations: 12, max_load: 10 },
    { id: 'q2', name: 'Suporte Técnico N1', strategy: 'less_busy', attendants_count: 8, active_conversations: 19, max_load: 8 },
    { id: 'q3', name: 'Financeiro & Cobrança', strategy: 'manual', attendants_count: 3, active_conversations: 4, max_load: 5 },
  ];

  const fetchQueues = async () => {
    try {
      const data = await ApiClient.get('/queues');
      setQueues(data && data.length > 0 ? data : defaultQueues);
    } catch {
      setQueues(defaultQueues);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, []);

  const handleCreateQueue = (e) => {
    e.preventDefault();
    const newQ = {
      id: `q_${Date.now()}`,
      name,
      strategy,
      attendants_count: 1,
      active_conversations: 0,
      max_load: 8,
    };
    setQueues((prev) => [...prev, newQ]);
    setShowModal(false);
    setName('');
  };

  const handleCreateRule = (e) => {
    e.preventDefault();
    const newR = {
      id: `r_${Date.now()}`,
      name: ruleName,
      condition: ruleCondition,
      targetQueue: ruleTargetQueue || queues[0]?.name || 'Geral',
      priority: rules.length + 1,
      active: true,
    };
    setRules((prev) => [...prev, newR]);
    setShowRuleModal(false);
    setRuleName('');
    setRuleCondition('');
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.7 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Filas de Atendimento & Regras de Triagem (3.7)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Distribuição automática com Round-Robin, menor carga e roteamento inteligente por tags/canais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('queues')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'queues' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Filas
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'rules' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Regras de Triagem
            </button>
          </div>

          {activeTab === 'queues' ? (
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Nova Fila</span>
            </button>
          ) : (
            <button
              onClick={() => setShowRuleModal(true)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-purple-500/25 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Regra de Triagem</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'queues' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {queues.map((q) => (
            <div key={q.id} className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-start justify-between">
                <h4 className="text-sm font-bold text-white">{q.name}</h4>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                  {q.strategy === 'round_robin' ? 'Round-Robin' : q.strategy === 'less_busy' ? 'Menor Carga' : 'Manual'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900">
                  <span className="text-slate-500 block text-[10px]">Atendentes</span>
                  <span className="text-sm font-bold text-white">{q.attendants_count || 1}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900">
                  <span className="text-slate-500 block text-[10px]">Em Aberto</span>
                  <span className="text-sm font-bold text-brand-400">{q.active_conversations || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Pre-Triage Rules List (3.7) */
        <div className="glass-card rounded-2xl border border-slate-800 p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <GitFork className="w-4 h-4 text-purple-400" />
            <span>Regras de Roteamento Automático de Clientes</span>
          </h3>

          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 font-bold flex items-center justify-center text-[10px]">
                      {rule.priority}
                    </span>
                    <span className="font-bold text-white text-sm">{rule.name}</span>
                  </div>
                  <p className="text-slate-400 font-mono text-[11px]">{rule.condition}</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px]">Fila de Destino:</span>
                    <span className="font-semibold text-brand-400">{rule.targetQueue}</span>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                    Ativa
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Queue Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-400" />
              <span>Nova Fila de Atendimento</span>
            </h3>

            <form onSubmit={handleCreateQueue} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome da Fila</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Comercial WhatsApp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Estratégia de Distribuição</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="round_robin">Round-Robin (Distribuição Circular Igualitária)</option>
                  <option value="less_busy">Menor Carga Atual (Menos atendimentos)</option>
                  <option value="manual">Manual (Puxar por demanda)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold"
                >
                  Criar Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Pre-Triage Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-400" />
              <span>Nova Regra de Pré-Triagem Automática</span>
            </h3>

            <form onSubmit={handleCreateRule} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome da Regra</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Roteamento VIP por Tag"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Condição de Gatilho</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tag contém #VIP OU Canal é WhatsApp Comercial"
                  value={ruleCondition}
                  onChange={(e) => setRuleCondition(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Fila de Destino</label>
                <select
                  value={ruleTargetQueue}
                  onChange={(e) => setRuleTargetQueue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.name}>{q.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold"
                >
                  Salvar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Queues;
