import React, { useState, useEffect } from 'react';
import { Download, Search, Loader2 } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';

const views = [
  { id: 'conversations', label: 'Conversas' },
  { id: 'attendants', label: 'Atendentes' },
  { id: 'channels', label: 'Canais' },
];

const statusLabels = { open: 'Aberta', pending: 'Pendente', resolved: 'Resolvida', closed: 'Fechada' };
const statusCls = {
  open: 'text-sky-300 border-sky-500/25',
  pending: 'text-amber-300 border-amber-500/25',
  resolved: 'text-emerald-300 border-emerald-500/25',
};

const mins = (v) => (v > 0 ? `${v.toFixed(1)} min` : '–');

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

const Empty = ({ children }) => <p className="px-5 py-12 text-center text-[13px] text-slate-500">{children}</p>;

export const Reports = () => {
  const [view, setView] = useState('conversations');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [items, setItems] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const dateParams = () => ({ ...(startDate && { start_date: startDate }), ...(endDate && { end_date: endDate }) });

  const load = async () => {
    setLoading(true);
    const params = dateParams();
    const [convRes, attRes, chanRes] = await Promise.allSettled([
      ApiClient.get('/reports/conversations', { ...params, ...(statusFilter !== 'all' && { status: statusFilter }) }),
      ApiClient.get('/dashboard/attendants-performance', params),
      ApiClient.get('/dashboard/channels-volume', params),
    ]);
    if (convRes.status === 'fulfilled') setItems(convRes.value?.items || []);
    if (attRes.status === 'fulfilled') setAttendants(Array.isArray(attRes.value) ? attRes.value : []);
    if (chanRes.status === 'fulfilled') setChannels(Array.isArray(chanRes.value) ? chanRes.value : []);
    const failed = [convRes, attRes, chanRes].find((r) => r.status === 'rejected');
    setError(failed ? failed.reason?.message || 'Parte dos relatórios não carregou.' : '');
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [startDate, endDate, statusFilter]);

  const filteredItems = items.filter((c) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [c.contact_name, c.contact_phone, c.attendant_name, c.channel_name].some((v) => v?.toLowerCase().includes(term));
  });

  const resolved = items.filter((c) => c.status === 'resolved').length;
  const withFirstResponse = items.filter((c) => c.first_response_mins > 0);
  const avgFirst = withFirstResponse.length
    ? withFirstResponse.reduce((a, c) => a + c.first_response_mins, 0) / withFirstResponse.length
    : 0;

  const channelTotal = channels.reduce((a, c) => a + (c.total_count || 0), 0);

  const exportCSV = async () => {
    setDownloading(true);
    setError('');
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      if (view === 'conversations' || view === 'attendants') {
        const qs = new URLSearchParams({
          ...dateParams(),
          ...(view === 'conversations' && statusFilter !== 'all' && { status: statusFilter }),
        }).toString();
        const res = await fetch(`/api/v1/reports/${view}/export/csv${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${ApiClient.getToken()}` },
        });
        if (!res.ok) throw new Error(`Não foi possível gerar o CSV (erro ${res.status}).`);
        downloadBlob(await res.blob(), `relatorio-${view}-${stamp}.csv`);
      } else {
        const rows = [['Canal', 'Tipo', 'Conversas'], ...channels.map((c) => [c.channel_name, c.channel_type, c.total_count || 0])];
        const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `relatorio-${view}-${stamp}.csv`);
      }
    } catch (err) {
      setError(err.message || 'Não foi possível exportar.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <PageHeader
          description="Relatórios do período escolhido, calculados a partir das conversas registradas. Exporte em CSV para planilhas."
          actions={
            <>
              <div className="flex items-center gap-1.5">
                <input type="date" aria-label="Data inicial" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field h-8 w-auto tabular-nums" />
                <span className="text-xs text-slate-500">até</span>
                <input type="date" aria-label="Data final" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field h-8 w-auto tabular-nums" />
              </div>
              <button type="button" onClick={exportCSV} disabled={downloading || loading} className="btn btn-primary">
                {downloading ? <Loader2 className="animate-spin" /> : <Download strokeWidth={1.75} />}
                Exportar CSV
              </button>
            </>
          }
        >
          <div className="segmented" role="group" aria-label="Relatório">
            {views.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
        </PageHeader>

        {error && <p role="alert" className="alert-error">{error}</p>}

        {loading && items.length === 0 && attendants.length === 0 ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
          </div>
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {view === 'conversations' && (
              <section className="glass-card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
                    <input type="search" aria-label="Buscar no relatório" placeholder="Contato, telefone, atendente ou canal" value={search} onChange={(e) => setSearch(e.target.value)} className="field h-8 pl-8" />
                  </div>
                  <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="field h-8 w-auto">
                    <option value="all">Todos os status</option>
                    <option value="open">Abertas</option>
                    <option value="pending">Pendentes</option>
                    <option value="resolved">Resolvidas</option>
                  </select>
                  <p className="ml-auto text-xs text-slate-500 tabular-nums">
                    {items.length} conversas · {items.length ? ((resolved / items.length) * 100).toFixed(1) : '0.0'}% resolvidas · 1ª resposta média {mins(avgFirst)}
                  </p>
                </div>
                {filteredItems.length === 0 ? (
                  <Empty>{items.length ? 'Nada corresponde à busca.' : 'Nenhuma conversa no período.'}</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="text-xs text-slate-500">
                          <th className="px-4 py-2.5 font-normal">Data</th>
                          <th className="px-4 py-2.5 font-normal">Contato</th>
                          <th className="px-4 py-2.5 font-normal">Canal</th>
                          <th className="px-4 py-2.5 font-normal">Atendente</th>
                          <th className="px-4 py-2.5 font-normal">Status</th>
                          <th className="px-4 py-2.5 font-normal text-right">1ª resposta</th>
                          <th className="px-4 py-2.5 font-normal text-right">Resolução</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                        {filteredItems.map((c) => {
                          return (
                            <tr key={c.conversation_id}>
                              <td className="px-4 py-2.5 text-slate-400 tabular-nums whitespace-nowrap">
                                {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-4 py-2.5">
                                <p className="text-slate-100">{c.contact_name}</p>
                                {c.contact_phone && <p className="text-xs text-slate-500 tabular-nums">{c.contact_phone}</p>}
                              </td>
                              <td className="px-4 py-2.5 text-slate-300">{c.channel_name}</td>
                              <td className="px-4 py-2.5 text-slate-300">{c.attendant_name}</td>
                              <td className="px-4 py-2.5">
                                <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${statusCls[c.status] || 'text-slate-400 border-white/[0.08]'}`}>
                                  {statusLabels[c.status] || c.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{mins(c.first_response_mins)}</td>
                              <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{mins(c.resolution_mins)}</td>                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {view === 'attendants' && (
              <section className="glass-card overflow-hidden">
                {attendants.length === 0 ? (
                  <Empty>Nenhuma conversa atribuída a atendentes no período.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="text-xs text-slate-500">
                          <th className="px-4 py-2.5 font-normal">Atendente</th>
                          <th className="px-4 py-2.5 font-normal text-right">Atribuídas</th>
                          <th className="px-4 py-2.5 font-normal text-right">Resolvidas</th>
                          <th className="px-4 py-2.5 font-normal text-right">Taxa</th>
                          <th className="px-4 py-2.5 font-normal text-right">1ª resposta</th>
                          <th className="px-4 py-2.5 font-normal text-right">Resolução</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                        {attendants.map((a) => (
                          <tr key={a.user_id}>
                            <td className="px-4 py-2.5">
                              <p className="text-slate-100">{a.user_name}</p>
                              {a.user_email && <p className="text-xs text-slate-500">{a.user_email}</p>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{a.assigned_count}</td>
                            <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{a.resolved_count}</td>
                            <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">
                              {a.assigned_count ? `${((a.resolved_count / a.assigned_count) * 100).toFixed(1)}%` : '–'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{mins(a.avg_first_response_mins || 0)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{mins(a.avg_resolution_mins || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {view === 'channels' && (
              <section className="glass-card overflow-hidden">
                {channels.length === 0 ? (
                  <Empty>Nenhuma conversa registrada nos canais no período.</Empty>
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {channels.map((c) => {
                      const pct = channelTotal ? ((c.total_count || 0) / channelTotal) * 100 : 0;
                      return (
                        <li key={c.channel_id} className="px-5 py-3 space-y-2">
                          <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="text-slate-200 truncate">{c.channel_name}</span>
                            <span className="text-slate-400 tabular-nums flex-shrink-0">
                              {c.total_count || 0} <span className="text-slate-500">· {pct.toFixed(1)}%</span>
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <div className="h-full rounded-full bg-accent-400" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;