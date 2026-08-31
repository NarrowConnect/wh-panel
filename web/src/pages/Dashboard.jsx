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
  ChevronDown
} from 'lucide-react';
import ApiClient from '../api/client';

export const Dashboard = () => {
  const [kpis, setKpis] = useState(null);
  const [channels, setChannels] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [periodPreset, setPeriodPreset] = useState('7d'); // 'today', 'yesterday', '7d', '30d', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState('all');
  const [selectedQueueFilter, setSelectedQueueFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const applyPreset = (preset) => {
    setPeriodPreset(preset);
    const now = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(formatDate(now));
      setEndDate(formatDate(now));
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      setStartDate(formatDate(y));
      setEndDate(formatDate(y));
    } else if (preset === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setStartDate(formatDate(d));
      setEndDate(formatDate(now));
    } else if (preset === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      setStartDate(formatDate(d));
      setEndDate(formatDate(now));
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (selectedChannelFilter !== 'all') params.channel_id = selectedChannelFilter;
      if (selectedQueueFilter !== 'all') params.queue_id = selectedQueueFilter;

      const [kpiRes, chanRes, attRes, sentRes, funRes] = await Promise.allSettled([
        ApiClient.get('/dashboard/kpis', params),
        ApiClient.get('/dashboard/channels-volume', params),
        ApiClient.get('/dashboard/attendants-performance', params),
        ApiClient.get('/dashboard/sentiment-analysis', params),
        ApiClient.get('/dashboard/funnel', params),
      ]);

      if (kpiRes.status === 'fulfilled') setKpis(kpiRes.value);
      if (chanRes.status === 'fulfilled') setChannels(chanRes.value || []);
      if (attRes.status === 'fulfilled') setAttendants(attRes.value || []);
      if (sentRes.status === 'fulfilled') setSentiment(sentRes.value);
      if (funRes.status === 'fulfilled') setFunnel(funRes.value || []);
    } catch (err) {
      console.error('[Dashboard] Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [startDate, endDate, selectedChannelFilter, selectedQueueFilter]);

  // Auto-refresh interval (15s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, startDate, endDate, selectedChannelFilter, selectedQueueFilter]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.1 Control Bar: Presets, Date Range, Channel & Queue Filters */}
      <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Painel Executivo & Métricas Omnichannel (3.1)</span>
              <span className={`w-2.5 h-2.5 rounded-full ${autoRefresh ? 'bg-brand-500 animate-pulse' : 'bg-slate-500'}`} />
            </h2>
            <p className="text-xs text-slate-400">
              Controle visual em tempo real de conversas, TMPR, TMR, satisfação e canais
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Presets */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'today', label: 'Hoje' },
                { id: 'yesterday', label: 'Ontem' },
                { id: '7d', label: '7 Dias' },
                { id: '30d', label: '30 Dias' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    periodPreset === p.id
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPeriodPreset('custom'); }}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
              <span className="text-slate-500">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPeriodPreset('custom'); }}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
            </div>

            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded-xl border transition-colors ${
                autoRefresh
                  ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title={autoRefresh ? 'Atualização Automática Ativa (15s)' : 'Atualização Manual'}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Conversations */}
        <div className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total de Atendimentos</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{kpis?.total_conversations ?? 0}</span>
            <span className="text-[11px] font-semibold text-brand-400 flex items-center">
              <ArrowUpRight className="w-3 h-3" /> Ao vivo
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Registrados na base de dados</p>
        </div>

        {/* In Attendance / Open & Pending */}
        <div className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Em Atendimento</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400">{kpis?.open_conversations ?? 0}</span>
            <span className="text-xs text-slate-400 font-medium">abertas / {kpis?.pending_conversations ?? 0} pendentes</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Filas ativas e triagem IA</p>
        </div>

        {/* TMPR (First Response Time) */}
        <div className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">TMPR (1ª Resposta)</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-300">
              {Number(kpis?.avg_first_response_minutes ?? 0).toFixed(1)}
              <span className="text-sm font-normal text-slate-400 ml-1">min</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Tempo médio até primeiro contato</p>
        </div>

        {/* Sentiment & CSAT Score */}
        <div className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Índice Sentimento (IA)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Smile className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400">
              {Number(kpis?.overall_sentiment_score ?? 0).toFixed(2)}
            </span>
            <span className="text-xs text-slate-400 font-medium">/ 1.00</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Classificação semântica em tempo real</p>
        </div>
      </div>

      {/* Middle Grid: Channels Breakdown & Sentiment Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-5 rounded-2xl border border-slate-800 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-brand-400" />
              <span>Volume de Atendimentos por Canal</span>
            </h3>
            <span className="text-xs text-slate-400">WhatsApp / Instagram / Webchat</span>
          </div>

          <div className="space-y-3 pt-2">
            {channels.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs">
                Nenhum atendimento registrado no filtro atual.
              </div>
            ) : (
              channels.map((chan, idx) => {
                const total = channels.reduce((acc, c) => acc + (Number(c.total_count) || 0), 0) || 1;
                const percentage = Math.round(((Number(chan.total_count) || 0) / total) * 100);

                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-200">{chan.channel_name} ({chan.channel_type})</span>
                      <span className="text-slate-400">{chan.total_count} conversas ({percentage}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sentiment Analysis Card */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <Bot className="w-4 h-4 text-purple-400" />
              <span>Satisfação & Sentimento</span>
            </h3>

            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                  <span className="text-xs font-semibold text-brand-300">Positivo</span>
                </div>
                <span className="text-sm font-bold text-brand-400">{sentiment?.positive_count ?? 0} msgs</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="text-xs font-semibold text-slate-300">Neutro</span>
                </div>
                <span className="text-sm font-bold text-slate-300">{sentiment?.neutral_count ?? 0} msgs</span>
              </div>

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-xs font-semibold text-rose-300">Negativo</span>
                </div>
                <span className="text-sm font-bold text-rose-400">{sentiment?.negative_count ?? 0} msgs</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
            Score Médio: <strong className="text-white">{Number(sentiment?.avg_score ?? 0).toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Attendant Performance & Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendant Performance Leaderboard */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span>Ranking & Desempenho dos Atendentes</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-2">Operador</th>
                  <th className="pb-2 text-center">Atribuídas</th>
                  <th className="pb-2 text-center">Resolvidas</th>
                  <th className="pb-2 text-right">TMPR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {attendants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      Nenhum atendente registrado.
                    </td>
                  </tr>
                ) : (
                  attendants.map((att, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 font-medium text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-brand-400 font-bold">
                          {att.user_name?.charAt(0) || 'A'}
                        </div>
                        <div className="truncate max-w-[130px]">
                          <p className="truncate text-xs">{att.user_name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{att.user_email}</p>
                        </div>
                      </td>
                      <td className="py-2.5 text-center text-slate-300 font-semibold">{att.assigned_count}</td>
                      <td className="py-2.5 text-center text-emerald-400 font-semibold">{att.resolved_count}</td>
                      <td className="py-2.5 text-right text-slate-400 font-mono">
                        {Number(att.avg_first_response_mins || 0).toFixed(1)}m
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Funnel of Status */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Funil de Conversão & Atendimentos</span>
          </h3>

          <div className="space-y-3 pt-2">
            {funnel.map((item, i) => {
              const total = funnel.reduce((acc, f) => acc + (Number(f.count) || 0), 0) || 1;
              const pct = Math.round(((Number(item.count) || 0) / total) * 100);

              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300 capitalize">{item.status}</span>
                    <span className="text-slate-400">{item.count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
