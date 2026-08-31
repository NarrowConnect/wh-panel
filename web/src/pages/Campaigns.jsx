import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Clock,
  CheckCircle,
  AlertTriangle,
  UploadCloud,
  FileSpreadsheet,
  Zap,
  Gauge,
  Sliders,
  Users,
  Radio,
  FileText,
  ArrowRight
} from 'lucide-react';
import ApiClient from '../api/client';

export const Campaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  // Wizard Form State
  const [campName, setCampName] = useState('');
  const [targetChannel, setTargetChannel] = useState('whatsapp_meta');
  const [audienceType, setAudienceType] = useState('tags'); // 'tags' or 'csv'
  const [selectedTag, setSelectedTag] = useState('VIP');
  const [templateName, setTemplateName] = useState('oferta_exclusiva_vip');
  const [rateLimit, setRateLimit] = useState(60);

  const defaultCampaigns = [
    {
      id: 'camp_1',
      name: 'Black Friday 2026 - Reativação Base',
      status: 'completed',
      total_recipients: 1500,
      sent_count: 1492,
      delivered_count: 1470,
      read_count: 1205,
      rate_limit: 60,
      channel: 'WhatsApp Meta Oficial',
      created_at: '2026-08-28',
    },
    {
      id: 'camp_2',
      name: 'Lançamento Módulo IA SDR',
      status: 'processing',
      total_recipients: 800,
      sent_count: 420,
      delivered_count: 405,
      read_count: 310,
      rate_limit: 45,
      channel: 'WhatsApp Meta Oficial',
      created_at: '2026-08-30',
    },
  ];

  const fetchCampaigns = async () => {
    try {
      const data = await ApiClient.get('/campaigns');
      const list = Array.isArray(data) ? data : (data?.campaigns || []);
      setCampaigns(list.length > 0 ? list : defaultCampaigns);
    } catch {
      setCampaigns(defaultCampaigns);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleFinishWizard = (e) => {
    e.preventDefault();
    const newC = {
      id: `c_${Date.now()}`,
      name: campName,
      status: 'processing',
      total_recipients: audienceType === 'tags' ? 350 : 800,
      sent_count: 10,
      delivered_count: 8,
      read_count: 2,
      rate_limit: rateLimit,
      channel: targetChannel === 'whatsapp_meta' ? 'WhatsApp Meta Oficial' : 'WhatsApp QR Code',
      created_at: 'Agora',
    };
    setCampaigns((prev) => [newC, ...prev]);
    setShowWizardModal(false);
    setWizardStep(1);
    setCampName('');
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.10 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Campanhas de Disparo em Massa (3.10)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">
                Redis Stream Throttling
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Disparos programados com segmentação por tags, templates Meta e controle de taxa anti-bloqueio
            </p>
          </div>
        </div>

        <button
          onClick={() => { setShowWizardModal(true); setWizardStep(1); }}
          className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Nova Campanha</span>
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaigns.map((camp) => {
          const progress = Math.round(((camp.sent_count || 0) / (camp.total_recipients || 1)) * 100);

          return (
            <div key={camp.id} className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{camp.name}</h4>
                  <span className="text-[11px] text-slate-400">Canal: {camp.channel}</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    camp.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse'
                  }`}
                >
                  {camp.status === 'completed' ? 'Concluída' : 'Em Envio...'}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">Progresso do Envio (Fila Redis)</span>
                  <span className="text-brand-400">{camp.sent_count} / {camp.total_recipients} ({progress}%)</span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs text-center">
                <div className="p-2 rounded-xl bg-slate-900">
                  <span className="text-slate-500 block text-[10px]">Entregues</span>
                  <span className="font-bold text-white">{camp.delivered_count}</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900">
                  <span className="text-slate-500 block text-[10px]">Lidas</span>
                  <span className="font-bold text-brand-400">{camp.read_count}</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900">
                  <span className="text-slate-500 block text-[10px]">Taxa Rate Limit</span>
                  <span className="font-bold text-amber-400">{camp.rate_limit} msg/min</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4-Step Campaign Wizard Modal */}
      {showWizardModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-lg p-6 space-y-4 animate-fade-in">
            {/* Step Indicators */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-brand-400" />
                <span>Assistente de Campanha — Etapa {wizardStep} de 3</span>
              </span>

              <div className="flex gap-1.5">
                {[1, 2, 3].map((step) => (
                  <span
                    key={step}
                    className={`w-2 h-2 rounded-full ${wizardStep === step ? 'bg-brand-500' : 'bg-slate-700'}`}
                  />
                ))}
              </div>
            </div>

            {/* Step 1: Info & Channel */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome da Campanha</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Reativação de Clientes VIP"
                    value={campName}
                    onChange={(e) => setCampName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Canal de Envio</label>
                  <select
                    value={targetChannel}
                    onChange={(e) => setTargetChannel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="whatsapp_meta">WhatsApp Meta Oficial (Cloud API)</option>
                    <option value="whatsapp_qr">WhatsApp QR Code Gateway</option>
                  </select>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    disabled={!campName.trim()}
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    <span>Próximo Passo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Audience & Template */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Segmentação de Público</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAudienceType('tags')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-center ${
                        audienceType === 'tags' ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Por Tag de Contatos
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudienceType('csv')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-center ${
                        audienceType === 'csv' ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Upload de Planilha CSV
                    </button>
                  </div>
                </div>

                {audienceType === 'tags' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tag Alvo</label>
                    <select
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="VIP">#VIP (350 contatos)</option>
                      <option value="Lead Qualificado">#Lead Qualificado (520 contatos)</option>
                      <option value="Suporte N1">#Suporte N1 (180 contatos)</option>
                    </select>
                  </div>
                ) : (
                  <div className="p-4 border-2 border-dashed border-slate-700 rounded-xl text-center space-y-1">
                    <UploadCloud className="w-6 h-6 text-brand-400 mx-auto" />
                    <p className="text-xs text-slate-300 font-semibold">Arraste seu arquivo .CSV aqui</p>
                    <p className="text-[10px] text-slate-500">Colunas: telefone, nome, empresa</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Modelo de Mensagem (Template)</label>
                  <select
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="oferta_exclusiva_vip">oferta_exclusiva_vip (Aprovado)</option>
                    <option value="boas_vindas_vip">boas_vindas_vip (Aprovado)</option>
                  </select>
                </div>

                <div className="flex justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Configurar Throttling</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Throttling & Launch */}
            {wizardStep === 3 && (
              <form onSubmit={handleFinishWizard} className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-300">Taxa de Envio Controlada (Rate Limit)</span>
                    <span className="font-bold text-amber-400 font-mono text-sm">{rateLimit} msgs/minuto</span>
                  </div>

                  <input
                    type="range"
                    min="10"
                    max="120"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(Number(e.target.value))}
                    className="w-full accent-brand-500 cursor-pointer"
                  />

                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    O Redis Streams fará o controle inteligente de taxa para garantir conformidade com as regras anti-bloqueio da Meta.
                  </p>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Iniciar Disparo Agora</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Campaigns;
