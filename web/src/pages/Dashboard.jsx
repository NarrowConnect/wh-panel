import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';

// The dashboard API filters by day (start_date=YYYY-MM-DD), so periods are
// counted in whole days back from today.
const periods = [
  { id: 'today', label: 'Hoje', days: 0 },
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
];

const startDateFor = (periodId) => {
  const days = periods.find((p) => p.id === periodId)?.days ?? 0;
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const statusLabels = {
  open: 'Abertas',
  pending: 'Pendentes',
  resolved: 'Resolvidas',
  closed: 'Fechadas',
};

const Panel = ({ title, aside, children }) => (
  <section className="glass-card overflow-hidden">
    <header className="flex items-center justify-between gap-3 px-5 h-12 border-b border-white/[0.06]">
      <h2 className="text-[13px] font-medium text-white">{title}</h2>
      {aside && <span className="text-xs text-slate-500 tabular-nums">{aside}</span>}
    </header>
    {children}
  </section>
);

const Empty = ({ children }) => <p className="px-5 py-8 text-center text-[13px] text-slate-500">{children}</p>;

const Stat = ({ label, value, children }) => (
  <div className="bg-surface p-5 space-y-2 min-w-0">
    <p className="text-xs text-slate-400">{label}</p>
    <p className="text-2xl font-medium text-white tracking-tight tabular-nums">{value}</p>
    <div className="text-xs text-slate-500">{children}</div>
  </div>
);

export const Dashboard = () => {
  const [kpis, setKpis] = useState(null);
  const [channels, setChannels] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [periodPreset, setPeriodPreset] = useState('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboardData = async (period = periodPreset) => {
    setLoading(true);
    try {
      const params = { start_date: startDateFor(period) };
      const [kpiRes, chanRes, attRes, funRes] = await Promise.allSettled([
        ApiClient.get('/dashboard/kpis', params),
        ApiClient.get('/dashboard/channels-volume', params),
        ApiClient.get('/dashboard/attendants-performance', params),
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
      if (funRes.status === 'fulfilled') {
        const list = Array.isArray(funRes.value) ? funRes.value : (funRes.value?.funnel || []);
        setFunnel(list);
      }
      const failed = [kpiRes, chanRes, attRes, funRes].find((r) => r.status === 'rejected');
      setError(failed ? failed.reason?.message || 'Parte das métricas não carregou.' : '');
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
  const resolutionRate = totalConversations > 0 ? (resolvedConversations / totalConversations) * 100 : 0;
  const avgFirstResp = kpis?.avg_first_response_minutes ? `${kpis.avg_first_response_minutes.toFixed(1)} min` : '–';
  const avgResMins = kpis?.avg_resolution_minutes ? `${kpis.avg_resolution_minutes.toFixed(1)} min` : '–';


  const channelMax = Math.max(1, ...channels.map((ch) => ch.total_count || 0));

  return (
    <div className="h-full overflow-y-auto">
      <div className={`p-6 space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <PageHeader
          description={`${channels.length} ${channels.length === 1 ? 'canal com conversas' : 'canais com conversas'} no período.`}
          actions={
            <>
              <div className="segmented" role="group" aria-label="Período">
                {periods.map((p) => (
                  <button key={p.id} type="button" aria-pressed={periodPreset === p.id} onClick={() => setPeriodPreset(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => fetchDashboardData(periodPreset)}
                className="btn btn-secondary btn-icon"
                title="Atualizar"
                aria-label="Atualizar métricas"
              >
                <RefreshCw className={loading ? 'animate-spin' : ''} strokeWidth={1.75} />
              </button>
            </>
          }
        />

        {error && <p role="alert" className="alert-error">{error} Os números abaixo podem estar incompletos.</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.06]">
          <Stat label="Conversas" value={totalConversations}>
            {openConversations} abertas · {resolvedConversations} resolvidas
          </Stat>
          <Stat label="Taxa de resolução" value={`${resolutionRate.toFixed(1)}%`}>
            <div className="h-1 mt-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, resolutionRate)}%` }} />
            </div>
          </Stat>
          <Stat label="1ª resposta (média)" value={avgFirstResp}>
            Do início da conversa à primeira resposta
          </Stat>
          <Stat label="Resolução (média)" value={avgResMins}>
            Do início da conversa até resolver
          </Stat>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel title="Conversas por canal" aside={channels.length > 0 ? `${channels.length} canais` : null}>
            {channels.length > 0 ? (
              <ul className="divide-y divide-white/[0.05]">
                {channels.map((ch) => (
                  <li key={ch.channel_id || ch.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="text-slate-200 truncate">{ch.channel_name || ch.name}</span>
                      <span className="text-slate-400 tabular-nums flex-shrink-0">{ch.total_count || 0}</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className="h-full bg-accent-400 rounded-full" style={{ width: `${((ch.total_count || 0) / channelMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma conversa registrada nos canais ainda.</Empty>
            )}
          </Panel>

          <Panel title="Conversas por status" aside={totalConversations > 0 ? `${totalConversations} no total` : null}>
            {funnel.length > 0 ? (
              <ul className="divide-y divide-white/[0.05]">
                {funnel.map((st) => {
                  const pct = totalConversations > 0 ? Math.round((st.count / totalConversations) * 100) : 0;
                  return (
                    <li key={st.status} className="px-5 py-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-slate-200">{statusLabels[st.status] || st.status}</span>
                        <span className="text-slate-400 tabular-nums">
                          {st.count} <span className="text-slate-500">· {pct}%</span>
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                        <div className="h-full bg-accent-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Nenhuma conversa no período.</Empty>
            )}
          </Panel>
        </div>

        <Panel title="Atendentes" aside={attendants.length > 0 ? `${attendants.length} com conversas` : null}>
          {attendants.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-5 py-2.5 font-normal">Atendente</th>
                    <th className="px-5 py-2.5 font-normal text-right">Atribuídas</th>
                    <th className="px-5 py-2.5 font-normal text-right">Resolvidas</th>
                    <th className="px-5 py-2.5 font-normal text-right">1ª resposta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                  {attendants.map((att) => (
                    <tr key={att.user_id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-md bg-white/[0.06] text-slate-200 text-[11px] font-medium flex items-center justify-center flex-shrink-0">
                            {(att.user_name || 'U').charAt(0).toUpperCase()}
                          </span>
                          <span className="text-slate-200 truncate">{att.user_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">{att.assigned_count}</td>
                      <td className="px-5 py-3 text-right text-slate-300">{att.resolved_count}</td>
                      <td className="px-5 py-3 text-right text-slate-400">
                        {att.avg_first_response_mins ? `${att.avg_first_response_mins.toFixed(1)} min` : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nenhuma conversa atribuída a atendentes ainda.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default Dashboard;
