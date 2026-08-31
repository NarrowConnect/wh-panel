import React, { useState } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  Filter,
  FileSpreadsheet,
  CheckCircle,
  TrendingUp,
  Clock,
  Users,
  Radio,
  Smile,
  FileText
} from 'lucide-react';

export const Reports = () => {
  const [reportType, setReportType] = useState('conversations'); // 'conversations', 'attendants', 'sentiment', 'channels'
  const [downloading, setDownloading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reportData = {
    conversations: [
      { id: '1', date: '2026-08-30', contact: 'Lucas Ferreira', phone: '+55 11 99999-8888', channel: 'WhatsApp Meta', attendant: 'Carlos Mendes', status: 'Resolvida', tmpr: '1.2 min', tmr: '6.5 min' },
      { id: '2', date: '2026-08-30', contact: 'Amanda Castro', phone: '+55 21 98888-7777', channel: 'Instagram Direct', attendant: 'Mariana Rocha', status: 'Aberta', tmpr: '2.4 min', tmr: '-' },
      { id: '3', date: '2026-08-29', contact: 'Roberto Lima', phone: '+55 31 97777-5555', channel: 'WhatsApp QR', attendant: 'Carlos Mendes', status: 'Resolvida', tmpr: '0.8 min', tmr: '4.2 min' },
    ],
    attendants: [
      { name: 'Carlos Mendes', email: 'carlos@empresa.com', total_assigned: 48, resolved: 44, avg_frt: '1.1 min', csat_score: '4.9 / 5.0' },
      { name: 'Mariana Rocha', email: 'mariana@empresa.com', total_assigned: 36, resolved: 32, avg_frt: '1.8 min', csat_score: '4.7 / 5.0' },
      { name: 'Roberto Santos', email: 'roberto@empresa.com', total_assigned: 29, resolved: 28, avg_frt: '2.3 min', csat_score: '4.8 / 5.0' },
    ],
    sentiment: [
      { category: 'Positivo / Elogios', count: 184, percentage: '68%', impact: 'Alto' },
      { category: 'Neutro / Dúvidas Operacionais', count: 68, percentage: '25%', impact: 'Médio' },
      { category: 'Negativo / Reclamações', count: 19, percentage: '7%', impact: 'Crítico' },
    ],
  };

  const handleExportCSV = () => {
    setDownloading(true);
    setTimeout(() => {
      let csvContent = 'data:text/csv;charset=utf-8,';
      if (reportType === 'conversations') {
        csvContent += 'ID,Data,Contato,Telefone,Canal,Atendente,Status,TMPR,TMR\n';
        reportData.conversations.forEach((r) => {
          csvContent += `${r.id},${r.date},${r.contact},${r.phone},${r.channel},${r.attendant},${r.status},${r.tmpr},${r.tmr}\n`;
        });
      } else if (reportType === 'attendants') {
        csvContent += 'Atendente,Email,Atribuidas,Resolvidas,TMPR,CSAT\n';
        reportData.attendants.forEach((r) => {
          csvContent += `${r.name},${r.email},${r.total_assigned},${r.resolved},${r.avg_frt},${r.csat_score}\n`;
        });
      } else {
        csvContent += 'Categoria,Total,Percentual,Impacto\n';
        reportData.sentiment.forEach((r) => {
          csvContent += `${r.category},${r.count},${r.percentage},${r.impact}\n`;
        });
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `relatorio_${reportType}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloading(false);
    }, 500);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.9 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Relatórios Analíticos & Exportação de Dados (3.9)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Gere relatórios completos de atendimento, produtividade de operadores e satisfação
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none"
            />
            <span className="text-slate-500">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none"
            />
          </div>

          <button
            onClick={handleExportCSV}
            disabled={downloading}
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Exportando...' : 'Exportar em CSV'}</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { id: 'conversations', title: 'Atendimentos & TMPR', desc: 'Métricas de tempo de 1ª resposta e resolução por canal', icon: MessageSquare },
          { id: 'attendants', title: 'Produtividade de Atendentes', desc: 'Ranking de mensagens, resolução e satisfação (CSAT)', icon: Users },
          { id: 'sentiment', title: 'Sentimento & Qualificação IA', desc: 'Distribuição de sentimento e classificação semântica', icon: Smile },
        ].map((rep) => {
          const Icon = rep.icon;
          const isSelected = reportType === rep.id;

          return (
            <div
              key={rep.id}
              onClick={() => setReportType(rep.id)}
              className={`glass-card p-5 rounded-2xl border cursor-pointer transition-all ${
                isSelected
                  ? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-white">{rep.title}</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{rep.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Report Data Table */}
      <div className="glass-card rounded-2xl border border-slate-800 p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-400" />
          <span>Prévia dos Dados Filtrados</span>
        </h3>

        {reportType === 'conversations' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3">Data</th>
                  <th className="pb-3">Contato</th>
                  <th className="pb-3">Canal</th>
                  <th className="pb-3">Atendente</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">TMPR</th>
                  <th className="pb-3 text-right">TMR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reportData.conversations.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 text-slate-400 font-mono">{c.date}</td>
                    <td className="py-3 font-bold text-white">{c.contact}</td>
                    <td className="py-3 text-slate-300">{c.channel}</td>
                    <td className="py-3 text-slate-400">{c.attendant}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold text-[10px]">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 text-right text-brand-400 font-mono">{c.tmpr}</td>
                    <td className="py-3 text-right text-slate-400 font-mono">{c.tmr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'attendants' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3">Atendente</th>
                  <th className="pb-3 text-center">Atribuídas</th>
                  <th className="pb-3 text-center">Resolvidas</th>
                  <th className="pb-3 text-center">TMPR Médio</th>
                  <th className="pb-3 text-right">Satisfação CSAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reportData.attendants.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 font-bold text-white">
                      <p>{a.name}</p>
                      <p className="text-[10px] text-slate-500 font-normal">{a.email}</p>
                    </td>
                    <td className="py-3 text-center text-slate-300 font-semibold">{a.total_assigned}</td>
                    <td className="py-3 text-center text-emerald-400 font-semibold">{a.resolved}</td>
                    <td className="py-3 text-center text-slate-400 font-mono">{a.avg_frt}</td>
                    <td className="py-3 text-right text-brand-400 font-bold">{a.csat_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'sentiment' && (
          <div className="space-y-3">
            {reportData.sentiment.map((s, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center text-xs">
                <span className="font-bold text-white">{s.category}</span>
                <div className="flex items-center gap-4">
                  <span className="text-slate-400">{s.count} mensagens</span>
                  <span className="font-bold text-brand-400 font-mono">{s.percentage}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
