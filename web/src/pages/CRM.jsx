import React, { useState, useEffect } from 'react';
import {
  Kanban,
  Plus,
  DollarSign,
  User,
  Phone,
  MessageSquare,
  ArrowRight,
  Filter,
  MoreHorizontal,
  Layers,
  Sparkles
} from 'lucide-react';
import ApiClient from '../api/client';

export const CRM = ({ onOpenChat }) => {
  const [pipelines, setPipelines] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null);
  const [stages, setStages] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState('');
  const [newDealValue, setNewDealValue] = useState('');
  const [newDealContact, setNewDealContact] = useState('');

  const fetchPipelines = async () => {
    try {
      const data = await ApiClient.get('/crm/pipelines');
      const list = Array.isArray(data) ? data : (data?.pipelines || []);
      if (list.length > 0) {
        setPipelines(list);
        setActivePipeline(list[0]);
        loadPipelineStages(list[0].id);
      } else {
        // Fallback default demo pipeline if empty
        const defaultStages = [
          { id: '1', name: 'Lead Novo', order: 1, color: 'border-blue-500' },
          { id: '2', name: 'Qualificação IA', order: 2, color: 'border-purple-500' },
          { id: '3', name: 'Proposta Enviada', order: 3, color: 'border-amber-500' },
          { id: '4', name: 'Negociação', order: 4, color: 'border-emerald-500' },
          { id: '5', name: 'Fechado / Ganho', order: 5, color: 'border-brand-500' },
        ];
        setStages(defaultStages);
        setCards([
          { id: 'c1', title: 'Contrato Anual Enterprise', stage_id: '1', value: 12000, contact_name: 'Carlos Mendes', contact_phone: '+55 11 98888-7777', updated_at: 'Há 10 min' },
          { id: 'c2', title: 'Expansão 50 Atendentes', stage_id: '2', value: 4500, contact_name: 'Mariana Rocha', contact_phone: '+55 21 99999-1234', updated_at: 'Há 35 min' },
          { id: 'c3', title: 'Migração API Meta Oficial', stage_id: '3', value: 2800, contact_name: 'Roberto Lima', contact_phone: '+55 31 97777-5555', updated_at: 'Há 2h' },
        ]);
      }
    } catch (err) {
      console.error('[CRM] Error fetching pipelines:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPipelineStages = async (pipelineId) => {
    try {
      const stageData = await ApiClient.get(`/crm/pipelines/${pipelineId}/stages`);
      const stageList = Array.isArray(stageData) ? stageData : (stageData?.stages || []);
      setStages(stageList);
      const cardData = await ApiClient.get(`/crm/pipelines/${pipelineId}/cards`);
      const cardList = Array.isArray(cardData) ? cardData : (cardData?.cards || []);
      setCards(cardList);
    } catch (err) {
      console.error('[CRM] Error loading stages:', err);
    }
  };

  useEffect(() => {
    fetchPipelines();
  }, []);

  const handleMoveCard = async (cardId, targetStageId) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, stage_id: targetStageId } : c))
    );
    try {
      await ApiClient.patch(`/crm/cards/${cardId}/stage`, { stage_id: targetStageId });
    } catch (err) {
      console.error('Error moving card:', err);
    }
  };

  const handleAddDeal = (e) => {
    e.preventDefault();
    if (!newDealTitle.trim()) return;

    const firstStageId = stages[0]?.id || '1';
    const newCard = {
      id: `card_${Date.now()}`,
      title: newDealTitle,
      value: parseFloat(newDealValue) || 0,
      contact_name: newDealContact || 'Novo Contato',
      contact_phone: '+55 11 90000-0000',
      stage_id: firstStageId,
      updated_at: 'Agora',
    };

    setCards((prev) => [...prev, newCard]);
    setNewDealTitle('');
    setNewDealValue('');
    setNewDealContact('');
    setShowAddDealModal(false);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-6 space-y-5 overflow-hidden bg-[#070b14]">
      {/* Top Bar: Pipeline Selector & Add Deal Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Funil de Vendas CRM</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">
                Kommo Integration
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Gerencie oportunidades diretamente conectadas às conversas do WhatsApp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddDealModal(true)}
            className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Oportunidade</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-4 items-start">
        {(Array.isArray(stages) ? stages : []).map((stage) => {
          const stageCards = (Array.isArray(cards) ? cards : []).filter((c) => String(c.stage_id) === String(stage.id));
          const totalValue = stageCards.reduce((acc, c) => acc + (Number(c.value) || 0), 0);

          return (
            <div
              key={stage.id}
              className="w-72 sm:w-80 flex-shrink-0 flex flex-col max-h-full glass-card rounded-2xl border border-slate-800/80 bg-[#0c1222]/90"
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    {stage.name}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {stageCards.length}
                  </span>
                </div>

                <span className="text-[11px] font-bold text-emerald-400 font-mono">
                  R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </span>
              </div>

              {/* Cards List in Stage */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {stageCards.length === 0 ? (
                  <div className="py-8 text-center text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
                    Sem oportunidades nesta etapa
                  </div>
                ) : (
                  stageCards.map((card) => (
                    <div
                      key={card.id}
                      className="p-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all shadow-md space-y-2 group"
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-brand-400 transition-colors">
                          {card.title}
                        </h4>
                        <span className="text-xs font-black text-emerald-400 font-mono">
                          R$ {Number(card.value || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-300">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="truncate">{card.contact_name}</span>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-mono">{card.contact_phone}</span>

                        {/* Quick Jump to WhatsApp Chat */}
                        <button
                          onClick={() => onOpenChat && onOpenChat(card)}
                          className="px-2 py-0.5 rounded bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 font-medium flex items-center gap-1 transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Abrir Chat</span>
                        </button>
                      </div>

                      {/* Quick Move Selector */}
                      <div className="pt-1 flex items-center gap-1 overflow-x-auto">
                        <span className="text-[10px] text-slate-500">Mover:</span>
                        {stages.map((st) => (
                          <button
                            key={st.id}
                            onClick={() => handleMoveCard(card.id, st.id)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${
                              String(card.stage_id) === String(st.id)
                                ? 'bg-brand-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            {st.name.slice(0, 4)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Deal Modal */}
      {showAddDealModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-400" />
              <span>Criar Oportunidade no CRM</span>
            </h3>

            <form onSubmit={handleAddDeal} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Título do Negócio</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Contrato Anual de Atendimento"
                  value={newDealTitle}
                  onChange={(e) => setNewDealTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Valor Estimado (R$)</label>
                <input
                  type="number"
                  placeholder="3500"
                  value={newDealValue}
                  onChange={(e) => setNewDealValue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Cliente</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Lucas Ferreira"
                  value={newDealContact}
                  onChange={(e) => setNewDealContact(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddDealModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 shadow-md shadow-brand-500/25"
                >
                  Salvar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRM;
