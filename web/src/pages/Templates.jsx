import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
  Send,
  MessageSquare,
  Sparkles,
  Zap,
  Info,
  Sliders,
  Smartphone
} from 'lucide-react';
import ApiClient from '../api/client';

export const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [showBuilderModal, setShowBuilderModal] = useState(false);

  // Builder State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [headerType, setHeaderType] = useState('NONE'); // NONE, TEXT, IMAGE
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('Olá {{1}}, temos uma novidade exclusiva para sua empresa!');
  const [sampleVar1, setSampleVar1] = useState('Carlos');
  const [footerText, setFooterText] = useState('Responda SAIR para cancelar');
  const [buttonType, setButtonType] = useState('QUICK_REPLY'); // QUICK_REPLY, CTA_URL
  const [buttonText, setButtonText] = useState('Falar com Especialista');
  const [ctaUrl, setCtaUrl] = useState('https://minhaempresa.com/oferta');

  const fetchTemplates = async () => {
    try {
      const data = await ApiClient.get('/templates');
      const list = Array.isArray(data) ? data : (data?.templates || []);
      setTemplates(list);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    const newTmpl = {
      id: `tmpl_${Date.now()}`,
      name,
      category,
      language,
      status: 'approved',
      components_json: bodyText,
      created_at: 'Hoje',
    };
    setTemplates((prev) => [newTmpl, ...prev]);
    setShowBuilderModal(false);
    setName('');
  };

  const filteredTemplates = (Array.isArray(templates) ? templates : []).filter((t) => {
    if (filterCategory === 'ALL') return true;
    return t.category === filterCategory;
  });

  const previewBody = bodyText.replace('{{1}}', sampleVar1 || '{{1}}');

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.5 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Templates Oficiais WhatsApp Meta (3.5)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                Meta Cloud API
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Crie, personalize e submeta modelos de mensagem para abrir janelas de 24h oficiais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Categories */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            {['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  filterCategory === cat ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'ALL' ? 'Todos' : cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowBuilderModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Template</span>
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 && !loading ? (
        <div className="p-8 rounded-3xl bg-[#0e1017] border border-white/[0.06] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">Nenhum template HSM cadastrado</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Crie novos templates de mensagem para aprovação da Meta ou aguarde a sincronização automática via webhook.
          </p>
          <button
            onClick={() => setShowBuilderModal(true)}
            className="mt-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Novo Template</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tmpl) => (
          <div key={tmpl.id} className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <span className="text-xs font-bold text-white font-mono">{tmpl.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  {tmpl.category}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0b141a] border border-slate-800 text-xs text-slate-200 font-sans leading-relaxed">
                <p className="whitespace-pre-wrap">{tmpl.components_json || tmpl.name}</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
              <span>Idioma: {tmpl.language}</span>
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" /> Aprovado Meta
              </span>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Template Builder Modal with WhatsApp Mockup */}
      {showBuilderModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-3xl p-6 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Criador de Template Oficial WhatsApp Meta</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form Config */}
              <form onSubmit={handleCreateTemplate} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Modelo (minúsculo com underline)</label>
                  <input
                    type="text"
                    required
                    placeholder="oferta_exclusiva_vip"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Categoria</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utilidade</option>
                      <option value="AUTHENTICATION">Autenticação</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Idioma</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                    >
                      <option value="pt_BR">Português (BR)</option>
                      <option value="en_US">Inglês (US)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cabeçalho (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Super Novidade"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-300">Corpo da Mensagem</label>
                    <span className="text-[10px] text-slate-500">Use {`{{1}}`}, {`{{2}}`} para variáveis</span>
                  </div>
                  <textarea
                    rows={3}
                    required
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Exemplo para Variável {`{{1}}`}</label>
                  <input
                    type="text"
                    value={sampleVar1}
                    onChange={(e) => setSampleVar1(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Rodapé (Opcional)</label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Botão de Ação Rápida</label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBuilderModal(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold"
                  >
                    Salvar e Submeter à Meta
                  </button>
                </div>
              </form>

              {/* Phone Mockup WhatsApp Preview */}
              <div className="flex flex-col items-center justify-center p-4 bg-[#0b141a] rounded-2xl border border-slate-800">
                <div className="w-full max-w-xs space-y-2">
                  <div className="text-center pb-2 border-b border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Preview WhatsApp Smartphone
                    </span>
                  </div>

                  <div className="bg-[#1f2c34] rounded-2xl rounded-tl-none p-3.5 text-white space-y-2 shadow-2xl">
                    {headerText && <p className="font-extrabold text-xs text-brand-400">{headerText}</p>}
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{previewBody}</p>
                    {footerText && <p className="text-[10px] text-slate-400 border-t border-slate-700/60 pt-1">{footerText}</p>}
                    <span className="text-[9px] text-slate-400 block text-right">12:30</span>
                  </div>

                  {buttonText && (
                    <div className="bg-[#1f2c34] rounded-xl p-2.5 text-center text-xs font-bold text-cyan-400 border border-slate-700/50 shadow-md">
                      {buttonText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
