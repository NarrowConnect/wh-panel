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
  Sparkles,
  Search,
  Sliders,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Tag,
  Edit3,
  Trash2,
  ExternalLink,
  ChevronRight,
  Table as TableIcon,
  LayoutGrid,
  Settings,
  HelpCircle,
  Check,
  X,
  Building,
  Mail,
  FolderPlus,
  RefreshCw,
  Trophy,
  Award
} from 'lucide-react';
import ApiClient from '../api/client';

export const CRM = ({ onOpenChat }) => {
  // Pipelines & Stages
  const [pipelines, setPipelines] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  // View Mode: 'kanban' or 'list'
  const [viewMode, setViewMode] = useState('kanban');

  // Custom Fields
  const [customFields, setCustomFields] = useState([]);
  const [showCustomFieldsModal, setShowCustomFieldsModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState('text'); // 'text', 'number', 'date', 'select', 'boolean'
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Modals & Popovers
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [showAddPipelineModal, setShowAddPipelineModal] = useState(false);
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null); // 360 view inspector

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'open', 'won', 'lost'

  // New Deal Form State
  const [newDealTitle, setNewDealTitle] = useState('');
  const [newDealValue, setNewDealValue] = useState('');
  const [newDealContactName, setNewDealContactName] = useState('');
  const [newDealContactPhone, setNewDealContactPhone] = useState('');
  const [newDealContactEmail, setNewDealContactEmail] = useState('');
  const [newDealStageId, setNewDealStageId] = useState('');
  const [newDealCustomValues, setNewDealCustomValues] = useState({});

  // New Pipeline Form State
  const [newPipelineName, setNewPipelineName] = useState('');

  // New Stage Form State
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#6366F1');

  // Contacts List for quick select
  const [contactsList, setContactsList] = useState([]);

  // Default Mock Data for immediate demo if backend is empty
  const defaultCustomFields = [
    { id: 'cf_segment', name: 'Segmento', key: 'segmento', field_type: 'select', options: '["Tecnologia", "Varejo", "Saúde", "Imobiliário", "Financeiro"]' },
    { id: 'cf_origin', name: 'Origem do Lead', key: 'origem', field_type: 'select', options: '["WhatsApp Meta", "Instagram Ads", "Google Ads", "Indicação", "Site"]' },
    { id: 'cf_decision', name: 'Decisor Principal', key: 'decisor', field_type: 'text', options: '[]' },
    { id: 'cf_deadline', name: 'Previsão de Fechamento', key: 'data_fechamento', field_type: 'date', options: '[]' },
  ];

  const defaultPipelines = [
    { id: 'pipe_1', name: 'Funil Comercial B2B (Padrão)', is_default: true },
    { id: 'pipe_2', name: 'Pós-Venda & Onboarding', is_default: false },
    { id: 'pipe_3', name: 'Renovação & CS', is_default: false },
  ];

  const defaultStages = [
    {
      id: 'stg_1',
      name: 'Novo Lead',
      color: '#3B82F6',
      order_index: 1,
      cards: [
        {
          id: 'card_101',
          title: 'Implantação Omnichannel 20 Operadores',
          value: 12500,
          status: 'open',
          created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          updated_at: 'Há 1 hora',
          contact: { name: 'Lucas Ferreira', phone: '+55 11 99999-8888', email: 'lucas@empresa.com' },
          custom_values: { segmento: 'Tecnologia', origem: 'WhatsApp Meta', decisor: 'Lucas Ferreira (CEO)', data_fechamento: '2026-09-15' },
        },
        {
          id: 'card_102',
          title: 'Licença WhatsApp API Oficial Meta',
          value: 3900,
          status: 'open',
          created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
          updated_at: 'Há 3 horas',
          contact: { name: 'Amanda Castro', phone: '+55 21 98888-7777', email: 'amanda@lojasmoda.com.br' },
          custom_values: { segmento: 'Varejo', origem: 'Instagram Ads', decisor: 'Amanda (Diretora)', data_fechamento: '2026-09-20' },
        },
      ],
    },
    {
      id: 'stg_2',
      name: 'Qualificação IA',
      color: '#8B5CF6',
      order_index: 2,
      cards: [
        {
          id: 'card_103',
          title: 'Integração CRM + Chatbot IA',
          value: 8400,
          status: 'open',
          created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
          updated_at: 'Há 1 dia',
          contact: { name: 'Roberto Lima', phone: '+55 31 97777-5555', email: 'roberto@saudeplus.med.br' },
          custom_values: { segmento: 'Saúde', origem: 'Site', decisor: 'Dr. Roberto', data_fechamento: '2026-09-18' },
        },
      ],
    },
    {
      id: 'stg_3',
      name: 'Proposta Enviada',
      color: '#F59E0B',
      order_index: 3,
      cards: [
        {
          id: 'card_104',
          title: 'Contrato Anual Enterprise 50 Canais',
          value: 36000,
          status: 'open',
          created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
          updated_at: 'Há 2 dias',
          contact: { name: 'Juliana Paes', phone: '+55 41 96666-4444', email: 'juliana@imobcuritiba.com' },
          custom_values: { segmento: 'Imobiliário', origem: 'Indicação', decisor: 'Juliana Paes (Sócia)', data_fechamento: '2026-09-10' },
        },
      ],
    },
    {
      id: 'stg_4',
      name: 'Negociação',
      color: '#EC4899',
      order_index: 4,
      cards: [
        {
          id: 'card_105',
          title: 'Migração de Servidor WAHA + Multi-Tenant',
          value: 15800,
          status: 'open',
          created_at: new Date(Date.now() - 3600000 * 96).toISOString(),
          updated_at: 'Ontem',
          contact: { name: 'Felipe Alencar', phone: '+55 85 95555-3333', email: 'felipe@fintechce.com.br' },
          custom_values: { segmento: 'Financeiro', origem: 'Google Ads', decisor: 'Felipe (CTO)', data_fechamento: '2026-09-08' },
        },
      ],
    },
    {
      id: 'stg_5',
      name: 'Fechado / Ganho 🏆',
      color: '#10B981',
      order_index: 5,
      cards: [
        {
          id: 'card_106',
          title: 'Plano Pro 10 Atendentes + IA',
          value: 6200,
          status: 'won',
          created_at: new Date(Date.now() - 3600000 * 120).toISOString(),
          updated_at: 'Há 3 dias',
          contact: { name: 'Beatriz Ramos', phone: '+55 19 94444-2222', email: 'beatriz@grupoedu.com.br' },
          custom_values: { segmento: 'Tecnologia', origem: 'WhatsApp Meta', decisor: 'Beatriz Ramos', data_fechamento: '2026-09-01' },
        },
      ],
    },
  ];

  // Fetch initial CRM data
  const fetchCRMData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Custom Fields
      const [fieldsRes, pipesRes, contactsRes] = await Promise.allSettled([
        ApiClient.get('/custom-fields'),
        ApiClient.get('/crm/pipelines'),
        ApiClient.get('/contacts'),
      ]);

      if (fieldsRes.status === 'fulfilled' && Array.isArray(fieldsRes.value) && fieldsRes.value.length > 0) {
        setCustomFields(fieldsRes.value);
      } else {
        setCustomFields(defaultCustomFields);
      }

      if (contactsRes.status === 'fulfilled') {
        const clist = Array.isArray(contactsRes.value) ? contactsRes.value : (contactsRes.value?.contacts || []);
        setContactsList(clist);
      }

      // 2. Fetch Pipelines
      if (pipesRes.status === 'fulfilled' && Array.isArray(pipesRes.value) && pipesRes.value.length > 0) {
        const pipeList = pipesRes.value;
        setPipelines(pipeList);
        const currentPipe = pipeList[0];
        setActivePipeline(currentPipe);
        await loadPipelineKanban(currentPipe.id);
      } else {
        setPipelines(defaultPipelines);
        setActivePipeline(defaultPipelines[0]);
        setStages(defaultStages);
      }
    } catch (err) {
      console.error('[CRM] Fallback loading:', err);
      setPipelines(defaultPipelines);
      setActivePipeline(defaultPipelines[0]);
      setStages(defaultStages);
      setCustomFields(defaultCustomFields);
    } finally {
      setLoading(false);
    }
  };

  const loadPipelineKanban = async (pipelineId) => {
    try {
      const data = await ApiClient.get(`/crm/pipelines/${pipelineId}/kanban`);
      if (Array.isArray(data) && data.length > 0) {
        setStages(data);
      } else {
        setStages(defaultStages);
      }
    } catch {
      setStages(defaultStages);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, []);

  // Handle Pipeline Change
  const handleSelectPipeline = (pipeline) => {
    setActivePipeline(pipeline);
    loadPipelineKanban(pipeline.id);
  };

  // Move Card between stages
  const handleMoveCard = async (cardId, targetStageId, newStatus = 'open') => {
    let movedCard = null;

    setStages((prevStages) => {
      // Find and remove card from source stage
      const newStages = prevStages.map((stg) => {
        const found = stg.cards?.find((c) => c.id === cardId);
        if (found) {
          movedCard = { ...found, stage_id: targetStageId, status: newStatus };
          return {
            ...stg,
            cards: stg.cards.filter((c) => c.id !== cardId),
          };
        }
        return stg;
      });

      // Add to target stage
      if (movedCard) {
        return newStages.map((stg) => {
          if (stg.id === targetStageId) {
            return {
              ...stg,
              cards: [movedCard, ...(stg.cards || [])],
            };
          }
          return stg;
        });
      }
      return newStages;
    });

    if (selectedCard && selectedCard.id === cardId) {
      setSelectedCard((prev) => ({ ...prev, stage_id: targetStageId, status: newStatus }));
    }

    try {
      await ApiClient.patch(`/crm/cards/${cardId}/move`, {
        stage_id: targetStageId,
        status: newStatus,
      });
    } catch (err) {
      console.warn('[CRM] Could not persist card move on backend, local state kept:', err);
    }
  };

  // Create New Deal
  const handleCreateDeal = async (e) => {
    e.preventDefault();
    if (!newDealTitle.trim()) return;

    const targetStageId = newDealStageId || stages[0]?.id;
    const cardValue = parseFloat(newDealValue) || 0;

    const newCardObj = {
      id: `card_${Date.now()}`,
      title: newDealTitle,
      value: cardValue,
      status: 'open',
      stage_id: targetStageId,
      created_at: new Date().toISOString(),
      updated_at: 'Agora',
      contact: {
        name: newDealContactName || 'Lead Sem Nome',
        phone: newDealContactPhone || '+55 11 99999-0000',
        email: newDealContactEmail || '',
      },
      custom_values: { ...newDealCustomValues },
    };

    // Optimistic UI update
    setStages((prev) =>
      prev.map((s) => (s.id === targetStageId ? { ...s, cards: [newCardObj, ...(s.cards || [])] } : s))
    );

    setShowAddDealModal(false);
    setNewDealTitle('');
    setNewDealValue('');
    setNewDealContactName('');
    setNewDealContactPhone('');
    setNewDealContactEmail('');
    setNewDealCustomValues({});

    try {
      const payload = {
        pipeline_id: activePipeline?.id,
        stage_id: targetStageId,
        title: newDealTitle,
        value: cardValue,
        contact_name: newDealContactName || undefined,
        contact_phone: newDealContactPhone || undefined,
        contact_email: newDealContactEmail || undefined,
        custom_values: Object.keys(newDealCustomValues).length ? newDealCustomValues : undefined,
      };
      const created = await ApiClient.post('/crm/cards', payload);
      // Replace optimistic card id with real id from backend
      if (created && created.id) {
        setStages((prev) => prev.map((s) => s.id === targetStageId ? { ...s, cards: s.cards.map((c) => c.id === newCardObj.id ? { ...c, id: created.id } : c) } : s));
      }
    } catch (err) {
      console.warn('[CRM] Saved locally:', err);
    }
  };

  // Create New Custom Field
  const handleCreateCustomField = async (e) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    const key = newFieldKey.trim() || newFieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let optionsArray = [];
    if (newFieldType === 'select' && newFieldOptions.trim()) {
      optionsArray = newFieldOptions.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const newField = {
      id: `cf_${Date.now()}`,
      name: newFieldName,
      key,
      field_type: newFieldType,
      options: JSON.stringify(optionsArray),
    };

    setCustomFields((prev) => [...prev, newField]);
    setNewFieldName('');
    setNewFieldKey('');
    setNewFieldOptions('');
    setShowCustomFieldsModal(false);

    try {
      await ApiClient.post('/custom-fields', {
        name: newFieldName,
        key,
        field_type: newFieldType,
        options: optionsArray,
      });
    } catch (err) {
      console.warn('[CRM] Custom field created locally:', err);
    }
  };

  // Delete Custom Field
  const handleDeleteCustomField = async (fieldId) => {
    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
    try {
      await ApiClient.delete(`/custom-fields/${fieldId}`);
    } catch (err) {
      console.warn('[CRM] Custom field deleted locally:', err);
    }
  };

  // Create New Pipeline
  const handleCreatePipeline = async (e) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;

    const newPipe = {
      id: `pipe_${Date.now()}`,
      name: newPipelineName,
      is_default: false,
    };

    setPipelines((prev) => [...prev, newPipe]);
    setActivePipeline(newPipe);
    setShowAddPipelineModal(false);
    setNewPipelineName('');

    try {
      await ApiClient.post('/crm/pipelines', {
        name: newPipelineName,
        is_default: false,
      });
    } catch (err) {
      console.warn('[CRM] Pipeline created locally:', err);
    }
  };

  // Create New Stage
  const handleCreateStage = async (e) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    const newStage = {
      id: `stg_${Date.now()}`,
      name: newStageName,
      color: newStageColor || '#6366F1',
      order_index: stages.length + 1,
      cards: [],
    };

    setStages((prev) => [...prev, newStage]);
    setShowAddStageModal(false);
    setNewStageName('');

    try {
      if (activePipeline?.id) {
        await ApiClient.post(`/crm/pipelines/${activePipeline.id}/stages`, {
          name: newStageName,
          color: newStageColor,
          order_index: stages.length + 1,
        });
      }
    } catch (err) {
      console.warn('[CRM] Stage created locally:', err);
    }
  };

  // Parse Options for Select Custom Fields
  const getFieldOptions = (optionsStr) => {
    try {
      if (Array.isArray(optionsStr)) return optionsStr;
      return JSON.parse(optionsStr || '[]');
    } catch {
      return [];
    }
  };

  // Filter Cards based on search and status
  const getFilteredCards = (cardsList = []) => {
    return cardsList.filter((c) => {
      // Status filter
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;

      // Search term
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      const titleMatch = c.title?.toLowerCase().includes(term);
      const contactMatch = c.contact?.name?.toLowerCase().includes(term);
      const phoneMatch = c.contact?.phone?.toLowerCase().includes(term);
      const customValuesMatch = Object.values(c.custom_values || {}).some((v) =>
        String(v).toLowerCase().includes(term)
      );

      return titleMatch || contactMatch || phoneMatch || customValuesMatch;
    });
  };

  // Calculate Pipeline Metrics
  const allCards = stages.flatMap((s) => s.cards || []);
  const totalDeals = allCards.length;
  const totalPipelineValue = allCards.reduce((acc, c) => acc + (c.value || 0), 0);
  const wonCards = allCards.filter((c) => c.status === 'won');
  const totalWonValue = wonCards.reduce((acc, c) => acc + (c.value || 0), 0);
  const winRate = totalDeals > 0 ? ((wonCards.length / totalDeals) * 100).toFixed(1) : '0';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-6 space-y-4 overflow-hidden bg-[#070b14]">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800 shadow-xl flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-inner">
            <Kanban className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">CRM & Pipelines de Vendas</h2>
              <span className="px-2 py-0.5 rounded bg-brand-500/20 border border-brand-500/30 text-[10px] font-bold text-brand-300">
                WH Panel Pro
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Gerencie oportunidades, campos customizados e funis integrados ao WhatsApp
            </p>
          </div>

          {/* Pipeline Selector Switcher */}
          <div className="flex items-center gap-2 pl-0 sm:pl-4 sm:border-l sm:border-slate-800">
            <select
              value={activePipeline?.id || ''}
              onChange={(e) => {
                const pipe = pipelines.find((p) => p.id === e.target.value);
                if (pipe) handleSelectPipeline(pipe);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-brand-500 cursor-pointer shadow-inner"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.is_default ? '(Padrão)' : ''}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowAddPipelineModal(true)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
              title="Criar Novo Pipeline / Funil"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle: Kanban vs List */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                viewMode === 'kanban' ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                viewMode === 'list' ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          {/* Manage Custom Fields Button */}
          <button
            onClick={() => setShowCustomFieldsModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>Campos Personalizados ({customFields.length})</span>
          </button>

          {/* Add Stage Button */}
          <button
            onClick={() => setShowAddStageModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            <span>Nova Etapa</span>
          </button>

          {/* Add Deal Button */}
          <button
            onClick={() => {
              setNewDealStageId(stages[0]?.id || '');
              setShowAddDealModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Oportunidade</span>
          </button>
        </div>
      </div>

      {/* 2. Pipeline Summary & Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
        <div className="glass-card p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">Oportunidades no Funil</span>
            <div className="text-lg font-bold text-white font-mono">{totalDeals}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <Kanban className="w-4 h-4" />
          </div>
        </div>

        <div className="glass-card p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">Valor Total em Negociação</span>
            <div className="text-lg font-bold text-brand-400 font-mono">
              R$ {totalPipelineValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="glass-card p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">Ganhos / Fechados 🏆</span>
            <div className="text-lg font-bold text-emerald-400 font-mono">
              R$ {totalWonValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
            <Trophy className="w-4 h-4" />
          </div>
        </div>

        <div className="glass-card p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">Taxa de Conversão</span>
            <div className="text-lg font-bold text-purple-400 font-mono">{winRate}%</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por negócio, contato, telefone ou campo customizado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'open', label: 'Em Aberto' },
              { id: 'won', label: 'Ganhos 🏆' },
              { id: 'lost', label: 'Perdidos ❌' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === st.id ? 'bg-brand-500 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Main Board Area: Kanban OR List View */}
      {viewMode === 'kanban' ? (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-2 items-start select-none">
          {stages.map((stage) => {
            const filteredCards = getFilteredCards(stage.cards || []);
            const stageTotalValue = (stage.cards || []).reduce((acc, c) => acc + (c.value || 0), 0);

            return (
              <div
                key={stage.id}
                className="w-80 flex-shrink-0 flex flex-col rounded-2xl bg-slate-900/70 border border-slate-800 max-h-full overflow-hidden shadow-lg"
              >
                {/* Stage Header */}
                <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: stage.color || '#6366F1' }}
                    />
                    <h3 className="text-xs font-bold text-white tracking-wide">{stage.name}</h3>
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] font-semibold">
                      {filteredCards.length}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                    R$ {stageTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[calc(100vh-19rem)]">
                  {filteredCards.length === 0 ? (
                    <div className="py-8 text-center text-slate-600 text-xs border border-dashed border-slate-800/60 rounded-xl">
                      Nenhum card nesta etapa
                    </div>
                  ) : (
                    filteredCards.map((card) => (
                      <div
                        key={card.id}
                        onClick={() => setSelectedCard(card)}
                        className="group relative p-3.5 rounded-xl bg-[#0e121e] border border-slate-800 hover:border-brand-500/60 transition-all duration-200 cursor-pointer shadow-md hover:shadow-brand-500/10 hover:-translate-y-0.5 space-y-2.5"
                      >
                        {/* Title & Value */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-white group-hover:text-brand-300 transition-colors line-clamp-2">
                            {card.title}
                          </h4>
                          <span className="text-xs font-mono font-bold text-emerald-400 flex-shrink-0">
                            R$ {(card.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                          </span>
                        </div>

                        {/* Contact info pill */}
                        {card.contact && (
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                            <div className="flex items-center gap-1.5 truncate">
                              <div className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center text-[9px] font-bold">
                                {card.contact.name?.slice(0, 2).toUpperCase() || 'LD'}
                              </div>
                              <span className="truncate text-slate-300">{card.contact.name}</span>
                            </div>

                            {onOpenChat && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenChat();
                                }}
                                className="p-1 rounded bg-brand-500/15 hover:bg-brand-500/30 text-brand-300 text-[10px] flex items-center gap-1 transition-colors"
                                title="Abrir conversa no WhatsApp"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Custom Fields Preview Chips */}
                        {card.custom_values && Object.keys(card.custom_values).length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {Object.entries(card.custom_values).map(([k, val]) => {
                              if (!val) return null;
                              const field = customFields.find((f) => f.key === k);
                              const label = field?.name || k;
                              const displayVal = field?.field_type === 'date' && !isNaN(Date.parse(val))
                                ? new Date(val).toLocaleDateString('pt-BR')
                                : String(val);
                              return (
                                <span
                                  key={k}
                                  className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[9px] font-medium"
                                >
                                  {label}: {displayVal}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Card Footer: Status & Quick Stage Mover */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/40">
                          <span>{card.updated_at || 'Atualizado'}</span>

                          <div className="flex items-center gap-1">
                            {/* Quick Move Next Stage */}
                            <select
                              value={stage.id}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleMoveCard(card.id, e.target.value, card.status);
                              }}
                              className="bg-slate-900 text-[10px] text-slate-400 border border-slate-700/60 rounded px-1 py-0.5 focus:outline-none"
                            >
                              {stages.map((s) => (
                                <option key={s.id} value={s.id}>
                                  Mover: {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Stage Quick Add Card Footer */}
                <button
                  onClick={() => {
                    setNewDealStageId(stage.id);
                    setShowAddDealModal(true);
                  }}
                  className="p-2.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 border-t border-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Card</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* List / Table View */
        <div className="flex-1 overflow-y-auto glass-card rounded-2xl border border-slate-800 p-4 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 font-medium">Oportunidade</th>
                <th className="pb-3 font-medium">Contato</th>
                <th className="pb-3 font-medium">Etapa do Funil</th>
                <th className="pb-3 font-medium">Valor (R$)</th>
                <th className="pb-3 font-medium">Status</th>
                {customFields.slice(0, 3).map((f) => (
                  <th key={f.id} className="pb-3 font-medium">
                    {f.name}
                  </th>
                ))}
                <th className="pb-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {stages.flatMap((stg) =>
                getFilteredCards(stg.cards || []).map((card) => (
                  <tr
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: stg.color || '#6366F1' }}
                        />
                        <span>{card.title}</span>
                      </div>
                    </td>
                    <td className="py-3 text-slate-300">
                      {card.contact ? (
                        <div>
                          <p className="font-semibold text-white">{card.contact.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{card.contact.phone}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                        style={{
                          backgroundColor: `${stg.color || '#6366F1'}20`,
                          borderColor: `${stg.color || '#6366F1'}40`,
                          color: stg.color || '#6366F1',
                        }}
                      >
                        {stg.name}
                      </span>
                    </td>
                    <td className="py-3 font-mono font-bold text-emerald-400">
                      R$ {(card.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3">
                      {card.status === 'won' && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          Ganho 🏆
                        </span>
                      )}
                      {card.status === 'lost' && (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                          Perdido ❌
                        </span>
                      )}
                      {card.status === 'open' && (
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                          Em Aberto
                        </span>
                      )}
                    </td>

                    {/* Custom fields values columns */}
                    {customFields.slice(0, 3).map((f) => (
                      <td key={f.id} className="py-3 text-slate-400 text-[11px]">
                        {card.custom_values?.[f.key] || '-'}
                      </td>
                    ))}

                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat()}
                            className="p-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/40 text-brand-300 transition-colors"
                            title="Conversar no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedCard(card)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Inspecionar"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. MODAL: Nova Oportunidade com Campos Customizados */}
      {showAddDealModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Criar Nova Oportunidade no CRM</h3>
              </div>
              <button
                onClick={() => setShowAddDealModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Título do Negócio *</label>
                <input
                  type="text"
                  placeholder="Ex: Contrato Anual 10 Licenças WhatsApp"
                  value={newDealTitle}
                  onChange={(e) => setNewDealTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Valor Previsto (R$)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={newDealValue}
                    onChange={(e) => setNewDealValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Etapa Inicial</label>
                  <select
                    value={newDealStageId}
                    onChange={(e) => setNewDealStageId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Contact Information */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-400" /> Contato Associado
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Nome do contato / decisor"
                    value={newDealContactName}
                    onChange={(e) => setNewDealContactName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="WhatsApp (+55 11 9...)"
                    value={newDealContactPhone}
                    onChange={(e) => setNewDealContactPhone(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              {/* Dynamic Custom Fields */}
              {customFields.length > 0 && (
                <div className="space-y-3 pt-1">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-purple-400" /> Campos Personalizados
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {customFields.map((field) => {
                      const options = getFieldOptions(field.options);

                      return (
                        <div key={field.id}>
                          <label className="text-[11px] text-slate-400 block mb-1 font-medium">{field.name}</label>
                          {field.field_type === 'select' ? (
                            <select
                              value={newDealCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setNewDealCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                            >
                              <option value="">Selecione uma opção</option>
                              {options.map((opt, idx) => (
                                <option key={idx} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : field.field_type === 'date' ? (
                            <input
                              type="date"
                              value={newDealCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setNewDealCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                            />
                          ) : field.field_type === 'number' ? (
                            <input
                              type="number"
                              value={newDealCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setNewDealCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                            />
                          ) : (
                            <input
                              type="text"
                              value={newDealCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setNewDealCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddDealModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 text-white text-xs font-bold shadow-lg shadow-brand-500/25 transition-all"
                >
                  Salvar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: Gerenciar / Criar Campos Personalizados */}
      {showCustomFieldsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Campos Personalizados (CRM & Contatos)</h3>
                  <p className="text-[11px] text-slate-400">
                    Defina campos dinâmicos para capturar dados do cliente e negócio
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomFieldsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List Existing Custom Fields */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <span className="text-xs font-bold text-slate-300 block">Campos Ativos ({customFields.length})</span>
              {customFields.map((f) => (
                <div
                  key={f.id}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold">
                      {f.field_type}
                    </span>
                    <span className="font-bold text-white">{f.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">key: {f.key}</span>
                  </div>

                  <button
                    onClick={() => handleDeleteCustomField(f.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Excluir campo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Custom Field Form */}
            <form onSubmit={handleCreateCustomField} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-xs font-bold text-purple-300 block flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Criar Novo Campo Customizado
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Nome do Campo *</label>
                  <input
                    type="text"
                    placeholder="Ex: Faturamento Estimado"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tipo de Dado</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="text">Texto Simples (Text)</option>
                    <option value="number">Número / Valor (Number)</option>
                    <option value="date">Data (Date)</option>
                    <option value="select">Seleção Única (Dropdown / Select)</option>
                    <option value="boolean">Sim / Não (Boolean)</option>
                  </select>
                </div>
              </div>

              {newFieldType === 'select' && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Opções da Lista (separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pequena, Média, Grande Empresa, Enterprise"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20"
              >
                Adicionar Campo ao CRM
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: Criar Novo Pipeline */}
      {showAddPipelineModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-brand-400" /> Criar Novo Pipeline de Vendas
              </h3>
              <button onClick={() => setShowAddPipelineModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePipeline} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome do Pipeline *</label>
                <input
                  type="text"
                  placeholder="Ex: Parcerias & Afiliados B2B"
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPipelineModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold"
                >
                  Criar Pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: Criar Nova Etapa (Stage) */}
      {showAddStageModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" /> Criar Nova Etapa do Funil
              </h3>
              <button onClick={() => setShowAddStageModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStage} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome da Etapa *</label>
                <input
                  type="text"
                  placeholder="Ex: Demonstração Agendada"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Cor Identificadora</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newStageColor}
                    onChange={(e) => setNewStageColor(e.target.value)}
                    className="w-9 h-9 rounded-lg bg-transparent border-0 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newStageColor}
                    onChange={(e) => setNewStageColor(e.target.value)}
                    className="w-28 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStageModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold"
                >
                  Adicionar Etapa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: 360 Deal Inspector & Detail View */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono text-[10px] font-bold">
                    Oportunidade CRM
                  </span>
                  <span className="text-xs text-slate-400 font-mono">ID: {selectedCard.id}</span>
                </div>
                <h3 className="text-base font-bold text-white">{selectedCard.title}</h3>
              </div>
              <button
                onClick={() => setSelectedCard(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Status & Stage Switcher */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">
                  Valor Negócio
                </label>
                <div className="text-base font-bold text-emerald-400 font-mono">
                  R$ {(selectedCard.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">
                  Etapa Atual
                </label>
                <select
                  value={selectedCard.stage_id || stages[0]?.id}
                  onChange={(e) => handleMoveCard(selectedCard.id, e.target.value, selectedCard.status)}
                  className="w-full px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none cursor-pointer"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">
                  Status de Fechamento
                </label>
                <select
                  value={selectedCard.status || 'open'}
                  onChange={(e) => handleMoveCard(selectedCard.id, selectedCard.stage_id, e.target.value)}
                  className="w-full px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none cursor-pointer font-semibold"
                >
                  <option value="open">🔵 Em Negociação</option>
                  <option value="won">🏆 Ganho / Fechado</option>
                  <option value="lost">❌ Perdido</option>
                </select>
              </div>
            </div>

            {/* Contact 360 Card */}
            {selectedCard.contact && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                    {selectedCard.contact.name?.slice(0, 2).toUpperCase() || 'LD'}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{selectedCard.contact.name}</h4>
                    <p className="text-xs text-slate-400 font-mono">{selectedCard.contact.phone}</p>
                    {selectedCard.contact.email && (
                      <p className="text-[11px] text-slate-500">{selectedCard.contact.email}</p>
                    )}
                  </div>
                </div>

                {onOpenChat && (
                  <button
                    onClick={() => {
                      setSelectedCard(null);
                      onOpenChat();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-brand-500/25 transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Abrir Chat WhatsApp</span>
                  </button>
                )}
              </div>
            )}

            {/* Custom Fields Inspector */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" /> Dados & Campos Personalizados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {customFields.map((f) => {
                  const rawVal = selectedCard.custom_values?.[f.key] || '';
                  const val = f.field_type === 'date' && rawVal && !isNaN(Date.parse(rawVal))
                    ? new Date(rawVal).toLocaleDateString('pt-BR')
                    : rawVal;
                  return (
                    <div key={f.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-semibold mb-0.5">{f.name}</span>
                      <span className="text-xs font-bold text-purple-200 font-mono">
                        {val || <span className="text-slate-600 italic font-normal">Não informado</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                Criado em: {new Date(selectedCard.created_at || Date.now()).toLocaleString('pt-BR')}
              </span>
              <button
                onClick={() => setSelectedCard(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRM;
