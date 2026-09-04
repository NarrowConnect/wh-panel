import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Smile,
  Users,
  Radio,
  Filter,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  RefreshCw,
  Sliders,
  Layers,
  Tag,
  ChevronDown,
  Zap,
  ShieldAlert,
  Play,
  Share2,
  ExternalLink,
  Plus
} from 'lucide-react';
import ApiClient from '../api/client';

export const Dashboard = () => {
  const [kpis, setKpis] = useState(null);
  const [channels, setChannels] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [periodPreset, setPeriodPreset] = useState('24h');
  const [timelineMonth, setTimelineMonth] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async (period = periodPreset) => {
    setLoading(true);
    try {
      const params = { period };
      const [kpiRes, chanRes, attRes, sentRes, funRes] = await Promise.allSettled([
        ApiClient.get('/dashboard/kpis', params),
        ApiClient.get('/dashboard/channels-volume', params),
        ApiClient.get('/dashboard/attendants-performance', params),
        ApiClient.get('/dashboard/sentiment-analysis', params),
        ApiClient.get('/dashboard/funnel', params),
      ]);

      if (kpiRes.status === 'fulfilled') setKpis(kpiRes.value || {});
      if (chanRes.status === 'fulfilled') {
        const list = Array.isArray(chanRes.value) ? chanRes.value : (chanRes.value?.channels || []);
        setChannels(list);
      }
      if (attRes.status === 'fulfilled') {
        const list = Array.isArray(attRes.value) ? attRes.value : (attRes.value?.attendants || []);
        setAttendants(list);
      }
      if (sentRes.status === 'fulfilled') setSentiment(sentRes.value || {});
      if (funRes.status === 'fulfilled') {
        const list = Array.isArray(funRes.value) ? funRes.value : (funRes.value?.funnel || []);
        setFunnel(list);
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(periodPreset);
  }, [periodPreset]);

  const totalConversations = kpis?.total_conversations || 0;
  const openConversations = kpis?.open_conversations || 0;
  const resolvedConversations = kpis?.resolved_conversations || 0;
  const resolutionRate = totalConversations > 0 ? ((resolvedConversations / totalConversations) * 100).toFixed(1) : '0.0';
  const avgFirstResp = kpis?.avg_first_response_minutes ? `${kpis.avg_first_response_minutes.toFixed(1)} min` : '-';
  const avgResMins = kpis?.avg_resolution_minutes ? `${kpis.avg_resolution_minutes.toFixed(1)} min` : '-';
  const sentimentScore = kpis?.overall_sentiment_score ? Number(kpis.overall_sentiment_score).toFixed(2) : '0.00';

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)] bg-[#07080c] select-none">
      {/* 1. Header & Filters Section (Stakent Style) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
            <span>Métricas em tempo real</span>
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span className="px-2 py-0.5 rounded-full bg-[#141620] border border-white/[0.06] text-[10px] text-slate-300 font-bold">
              {channels.length} {channels.length === 1 ? 'Canal Ativo' : 'Canais Ativos'}
            </span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight font-sans">
            Desempenho & Ativos Omnichannel
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#12141c] p-1 rounded-full border border-white/[0.06]">
            {['24h', '7d', '30d'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriodPreset(p)}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
                  periodPreset === p
                    ? 'bg-[#202434] text-white shadow-sm border border-white/[0.08]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchDashboardData(periodPreset)}
            className="p-2 rounded-full bg-[#12141c] hover:bg-[#181b26] border border-white/[0.06] text-slate-400 hover:text-white transition-colors"
            title="Atualizar Métricas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards & Liquid IA Engine Banner (Stakent Style 3+1 Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Conversas */}
        <div className="p-4 rounded-3xl bg-[#0e1017] border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Volume</p>
                <p className="text-xs font-bold text-white">Total de Conversas</p>
              </div>
            </div>
            <span className="p-1.5 rounded-full bg-[#151722] text-slate-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 font-medium">Conversas no Período</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-white tracking-tight">{totalConversations}</span>
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {openConversations} abertas
              </span>
            </div>
          </div>

          <div className="relative pt-2">
            <div className="w-full bg-[#181a26] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: totalConversations > 0 ? `${Math.min(100, (resolvedConversations / totalConversations) * 100)}%` : '0%' }}
              />
            </div>
            <div className="flex justify-between text-[9px] font-bold text-slate-500 mt-1">
              <span>{resolvedConversations} resolvidas</span>
              <span>{resolutionRate}% taxa</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tempo Médio de 1ª Resposta */}
        <div className="p-4 rounded-3xl bg-[#0e1017] border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold text-xs border border-purple-500/20">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agilidade</p>
                <p className="text-xs font-bold text-white">TMPR (1ª Resposta)</p>
              </div>
            </div>
            <span className="p-1.5 rounded-full bg-[#151722] text-slate-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 font-medium">Média de Espera do Cliente</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-white tracking-tight">{avgFirstResp}</span>
              <span className="text-[11px] font-bold text-purple-400 flex items-center gap-0.5">
                TMR: {avgResMins}
              </span>
            </div>
          </div>

          <div className="relative pt-2">
            <div className="w-full bg-[#181a26] h-1.5 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full rounded-full w-[70%]" />
            </div>
            <div className="flex justify-between text-[9px] font-bold text-slate-500 mt-1">
              <span>Resolução: {avgResMins}</span>
              <span>Meta: &lt; 2 min</span>
            </div>
          </div>
        </div>

        {/* Card 3: Satisfação & Sentimento */}
        <div className="p-4 rounded-3xl bg-[#0e1017] border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/20">
                <Smile className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qualidade</p>
                <p className="text-xs font-bold text-white">Sentimento do Cliente</p>
              </div>
            </div>
            <span className="p-1.5 rounded-full bg-[#151722] text-slate-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 font-medium">Score Médio</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-white tracking-tight">{sentimentScore}</span>
              <span className="text-[11px] font-bold text-emerald-400">
                {sentiment?.positive_count || 0} positivos
              </span>
            </div>
          </div>

          <div className="relative pt-2">
            <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-[#181a26]">
              {(() => {
                const pos = sentiment?.positive_count || 0;
                const neu = sentiment?.neutral_count || 0;
                const neg = sentiment?.negative_count || 0;
                const totalSentiment = pos + neu + neg || 1;
                return (
                  <>
                    <div className="bg-emerald-400 h-full" style={{ width: `${(pos / totalSentiment) * 100}%` }} />
                    <div className="bg-amber-400 h-full" style={{ width: `${(neu / totalSentiment) * 100}%` }} />
                    <div className="bg-rose-500 h-full" style={{ width: `${(neg / totalSentiment) * 100}%` }} />
                  </>
                );
              })()}
            </div>
            <div className="flex justify-between text-[9px] font-bold text-slate-500 mt-1">
              <span>Positivos: {sentiment?.positive_count || 0}</span>
              <span>Críticos: {sentiment?.negative_count || 0}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Liquid IA Engine Banner (Stakent Right Box) */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-[#1b1435] via-[#111022] to-[#0c0d14] border border-purple-500/25 shadow-2xl shadow-purple-500/10 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-white flex items-center gap-1">
                WH Panel
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Oficial Meta
              </span>
            </div>
            <h3 className="text-base font-black text-white leading-tight font-sans">
              Automação & Atendimento
            </h3>
            <p className="text-xs text-slate-300/80 leading-relaxed">
              Integração completa com WhatsApp Cloud API, WAHA VPS e CRM.
            </p>
          </div>

          <div className="space-y-2">
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-1.5"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Swagger API Docs</span>
            </a>
          </div>
        </div>
      </div>

      {/* 3. Main Wide Analytics Box */}
      <div className="p-6 rounded-3xl bg-[#0e1017] border border-white/[0.06] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span>Status dos Canais Conectados</span>
              <span className={`w-1.5 h-1.5 rounded-full ${channels.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            </div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-black text-white tracking-tight font-sans flex items-center gap-2">
                <span>Operação Multi-Tenant Ativa</span>
              </h3>
            </div>
          </div>
        </div>

        {/* Big Numbers */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-6 space-y-3">
            <p className="text-xs text-slate-400 font-semibold">Total de Mensagens no Banco</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-sans">
                {totalConversations}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20">
                {channels.length} canais
              </span>
            </div>
          </div>

          <div className="lg:col-span-6 p-4 rounded-2xl bg-[#12141c] border border-white/[0.06] space-y-3">
            <p className="text-xs font-bold text-white">Distribuição por Canal Real</p>
            {channels.length > 0 ? (
              <div className="space-y-2">
                {channels.map((ch) => (
                  <div key={ch.channel_id || ch.id} className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">{ch.channel_name || ch.name}</span>
                    <span className="font-mono text-purple-400 font-bold">{ch.total_count || 0} conversas</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nenhuma conversa registrada nos canais ainda.</p>
            )}
          </div>
        </div>

        {/* 4 Bottom Metric Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-white/[0.06]">
          <div className="p-3.5 rounded-2xl bg-[#12141c] border border-white/[0.04] space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Abertas</p>
            <p className="text-sm font-black text-white">{openConversations}</p>
            <p className="text-[10px] text-slate-500">Aguardando atendimento</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#12141c] border border-white/[0.04] space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resolvidas</p>
            <p className="text-sm font-black text-white">{resolvedConversations}</p>
            <p className="text-[10px] text-slate-500">Encerradas com sucesso</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#12141c] border border-white/[0.04] space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taxa de Resolução</p>
            <p className="text-sm font-black text-white">{resolutionRate}%</p>
            <p className="text-[10px] text-slate-500">Eficiência geral</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#12141c] border border-white/[0.04] space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TMPR</p>
            <p className="text-sm font-black text-white">{avgFirstResp}</p>
            <p className="text-[10px] text-slate-500">Primeira resposta</p>
          </div>
        </div>
      </div>

      {/* 4. Bottom Grid: Atendentes & Funil de Conversas Reais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atendentes Performance Real */}
        <div className="p-5 rounded-3xl bg-[#0e1017] border border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <span>Desempenho dos Atendentes</span>
            </h4>
            <span className="text-[10px] font-bold text-slate-400">Dados do Sistema</span>
          </div>

          {attendants.length > 0 ? (
            <div className="space-y-2">
              {attendants.map((att) => (
                <div key={att.user_id} className="p-3 rounded-2xl bg-[#12141c] border border-white/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-300 font-bold text-xs flex items-center justify-center">
                      {(att.user_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white leading-none">{att.user_name}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{att.assigned_count} conversas atribuídas</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-purple-400">{att.resolved_count} resolvidas</span>
                    <p className="text-[10px] text-slate-500">{att.avg_first_response_mins ? `${att.avg_first_response_mins.toFixed(1)}m resp.` : '-'}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-4">Nenhum atendimento atribuído registrado ainda.</p>
          )}
        </div>

        {/* Funil de Status Real */}
        <div className="p-5 rounded-3xl bg-[#0e1017] border border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Funil de Status das Conversas</span>
            </h4>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {totalConversations} Total
            </span>
          </div>

          {funnel.length > 0 ? (
            <div className="space-y-2.5">
              {funnel.map((st, i) => {
                const pct = totalConversations > 0 ? Math.round((st.count / totalConversations) * 100) : 0;
                return (
                  <div key={i} className="p-3 rounded-2xl bg-[#12141c] border border-white/[0.04] space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-white capitalize">{st.status}</span>
                      <span className="font-mono text-slate-400">{st.count} conversas ({pct}%)</span>
                    </div>
                    <div className="w-full bg-[#181a26] h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-4">Nenhum dado de funil registrado no momento.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
