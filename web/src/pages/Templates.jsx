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
  Smartphone,
  RefreshCw,
  Radio,
  AlertTriangle,
  AlertCircle,
  Check,
  X,
  ExternalLink,
  Copy,
  Trash2,
  HelpCircle,
  Link2,
  PhoneCall,
  Image,
  Video,
  FileBox,
  Eye
} from 'lucide-react';
import ApiClient from '../api/client';

export const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [officialChannels, setOfficialChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');

  // Builder Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('UTILITY'); // UTILITY, MARKETING, AUTHENTICATION
  const [language, setLanguage] = useState('pt_BR');
  const [headerType, setHeaderType] = useState('NONE'); // NONE, TEXT, IMAGE, VIDEO, DOCUMENT
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('Olá {{1}}, seu pedido número {{2}} foi confirmado com sucesso!');
  const [footerText, setFooterText] = useState('Narrow Connect WhatsApp Oficial');

  // Dynamic Variable Samples State (Required by Meta Graph API!)
  const [sampleValues, setSampleValues] = useState({
    1: 'Lucas Ferreira',
    2: 'PED-98231',
  });

  // Buttons State
  const [hasButtons, setHasButtons] = useState(false);
  const [buttonType, setButtonType] = useState('QUICK_REPLY'); // QUICK_REPLY, URL, PHONE_NUMBER
  const [btnText1, setBtnText1] = useState('Falar com Atendente');
  const [btnText2, setBtnText2] = useState('Ver Pedido');
  const [btnUrl, setBtnUrl] = useState('https://minhaempresa.com.br/rastreio');
  const [btnPhone, setBtnPhone] = useState('+5511999998888');

  // Submit to Meta Directly Checkbox
  const [submitDirectlyToMeta, setSubmitDirectlyToMeta] = useState(true);

  // Validation Warnings and Errors State
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);

  // Fetch Templates and Meta Channels
  const loadData = async () => {
    setLoading(true);
    try {
      const [tmplRes, chanRes] = await Promise.allSettled([
        ApiClient.get('/templates'),
        ApiClient.get('/channels'),
      ]);

      if (tmplRes.status === 'fulfilled') {
        const list = Array.isArray(tmplRes.value) ? tmplRes.value : (tmplRes.value?.templates || []);
        setTemplates(list);
      }

      if (chanRes.status === 'fulfilled') {
        const list = Array.isArray(chanRes.value) ? chanRes.value : (chanRes.value?.channels || []);
        const metaChannels = list.filter((ch) => ch.type === 'whatsapp_official' || ch.type === 'whatsapp_meta');
        setOfficialChannels(metaChannels);
        if (metaChannels.length > 0) {
          setSelectedChannelId(metaChannels[0].id);
        }
      }
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Force Synchronization with Meta Cloud API
  const handleSyncMetaTemplates = async () => {
    setSyncing(true);
    try {
      const res = await ApiClient.post('/templates/sync', {
        channel_id: selectedChannelId || undefined,
      });

      const syncedList = res.templates || [];
      if (syncedList.length > 0) {
        setTemplates(syncedList);
      } else {
        await loadData();
      }

      alert(res.message || 'Sincronização com a Meta concluída com sucesso!');
    } catch (err) {
      alert(err.message || 'Erro ao sincronizar templates com a Meta');
    } finally {
      setSyncing(false);
    }
  };

  // Real-time Meta Guidelines Linter & Validator
  useEffect(() => {
    const errors = [];
    const warnings = [];

    // 1. Template Name Validation
    if (name) {
      if (!/^[a-z0-9_]+$/.test(name)) {
        errors.push('O nome deve conter apenas letras minúsculas sem acento, números e sublinhados (_) sem espaços.');
      }
      if (name.startsWith('_') || name.endsWith('_')) {
        errors.push('O nome não pode iniciar ou terminar com sublinhado (_).');
      }
      if (name.length > 512) {
        errors.push('O nome excede o limite máximo da Meta de 512 caracteres.');
      }
    }

    // 2. Body Text Validation
    if (!bodyText.trim()) {
      errors.push('O corpo (BODY) do template é obrigatório.');
    } else {
      if (bodyText.length > 1024) {
        errors.push(`O corpo do template possui ${bodyText.length} caracteres (máx: 1024).`);
      }

      // Check generic link shorteners
      const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'goo.gl'];
      shorteners.forEach((s) => {
        if (bodyText.toLowerCase().includes(s)) {
          errors.push(`A Meta rejeita links encurtadores genéricos (${s}). Use o domínio próprio da sua empresa.`);
        }
      });

      // Variable sequential numbering check
      const varMatches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
      const namedVars = bodyText.match(/\{\{([a-zA-Z_]+)\}\}/g);
      if (namedVars) {
        errors.push(`A Meta exige variáveis numéricas {{1}}, {{2}}... Você utilizou nomes: ${namedVars.join(', ')}.`);
      }

      if (varMatches.length > 0) {
        const foundNums = varMatches.map((m) => parseInt(m[1], 10));
        let expected = 1;
        for (const num of foundNums) {
          if (num !== expected) {
            errors.push(`As variáveis devem ser estritamente sequenciais numéricas ({{1}}, {{2}}...). Foi encontrado {{${num}}} onde se esperava {{${expected}}}.`);
            break;
          }
          expected++;
        }

        // Check if body is solely a variable
        if (/^\s*\{\{\d+\}\}\s*$/.test(bodyText)) {
          errors.push('O corpo não pode ser composto unicamente por uma variável.');
        }

        // Check consecutive variables without characters
        if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(bodyText)) {
          errors.push('Variáveis consecutivas (ex: {{1}}{{2}}) são rejeitadas pela Meta. Adicione texto entre elas.');
        }
      }
    }

    // 3. Footer Validation
    if (footerText) {
      if (footerText.length > 60) {
        errors.push(`O rodapé possui ${footerText.length} caracteres (máx: 60).`);
      }
      if (footerText.includes('{{')) {
        errors.push('A Meta PROÍBE estritamente o uso de variáveis no Rodapé (Footer).');
      }
    }

    // 4. Header Validation
    if (headerType === 'TEXT' && headerText) {
      if (headerText.length > 60) {
        errors.push(`O cabeçalho de texto possui ${headerText.length} caracteres (máx: 60).`);
      }
      const headerVars = [...headerText.matchAll(/\{\{(\d+)\}\}/g)];
      if (headerVars.length > 1) {
        errors.push('O cabeçalho de texto da Meta permite no máximo 1 variável ({{1}}).');
      }
    }

    // 5. Buttons Validation
    if (hasButtons) {
      if (buttonType === 'URL') {
        if (!btnUrl.startsWith('http://') && !btnUrl.startsWith('https://')) {
          errors.push('A URL do botão deve iniciar obrigatoriamente com http:// ou https://.');
        }
      }
      if (buttonType === 'PHONE_NUMBER') {
        if (!/^\+[1-9]\d{6,14}$/.test(btnPhone.replace(/\s+/g, ''))) {
          warnings.push('O telefone do botão deve estar no formato internacional E.164 (ex: +5511999998888).');
        }
      }
    }

    setValidationErrors(errors);
    setValidationWarnings(warnings);
  }, [name, category, bodyText, footerText, headerType, headerText, hasButtons, buttonType, btnUrl, btnPhone]);

  // Extract variables list from body & header for samples
  const detectedVariables = [];
  const bodyVarMatches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
  bodyVarMatches.forEach((m) => {
    const num = m[1];
    if (!detectedVariables.includes(num)) detectedVariables.push(num);
  });

  // Generate WhatsApp Preview
  let previewRenderedBody = bodyText;
  detectedVariables.forEach((num) => {
    const sample = sampleValues[num] || `{{${num}}}`;
    previewRenderedBody = previewRenderedBody.replaceAll(`{{${num}}}`, sample);
  });

  // Handle Form Submit
  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (validationErrors.length > 0) {
      alert(`Corrija os seguintes erros antes de enviar à Meta:\n- ${validationErrors.join('\n- ')}`);
      return;
    }

    const components = [];

    // Header
    if (headerType === 'TEXT' && headerText.trim()) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
    } else if (headerType !== 'NONE') {
      components.push({ type: 'HEADER', format: headerType });
    }

    // Body with Examples
    const exampleMatrix = detectedVariables.map((num) => sampleValues[num] || 'Exemplo');
    components.push({
      type: 'BODY',
      text: bodyText.trim(),
      example: exampleMatrix.length > 0 ? { body_text: [exampleMatrix] } : undefined,
    });

    // Footer
    if (footerText.trim()) {
      components.push({ type: 'FOOTER', text: footerText.trim() });
    }

    // Buttons
    if (hasButtons) {
      const btns = [];
      if (buttonType === 'QUICK_REPLY') {
        if (btnText1.trim()) btns.push({ type: 'QUICK_REPLY', text: btnText1.trim() });
        if (btnText2.trim()) btns.push({ type: 'QUICK_REPLY', text: btnText2.trim() });
      } else if (buttonType === 'URL') {
        btns.push({ type: 'URL', text: btnText1.trim() || 'Acessar Link', url: btnUrl.trim() });
      } else if (buttonType === 'PHONE_NUMBER') {
        btns.push({ type: 'PHONE_NUMBER', text: btnText1.trim() || 'Ligar Agora', phone_number: btnPhone.trim() });
      }
      if (btns.length > 0) {
        components.push({ type: 'BUTTONS', buttons: btns });
      }
    }

    const payload = {
      name: name.trim().toLowerCase(),
      category: category.toUpperCase(),
      language: language || 'pt_BR',
      channel_id: selectedChannelId || undefined,
      components,
      submit_meta: submitDirectlyToMeta,
    };

    try {
      const created = await ApiClient.post('/templates', payload);
      setTemplates((prev) => [created, ...prev]);
      setShowBuilderModal(false);
      setName('');
      alert(
        submitDirectlyToMeta
          ? 'Template validado e submetido para aprovação da Meta com sucesso! (Status: Pendente)'
          : 'Template salvo localmente como rascunho com sucesso!'
      );
    } catch (err) {
      alert(err.message || 'Erro ao criar template');
    }
  };

  // Delete Template Handler
  const handleDeleteTemplate = async (tmplId) => {
    if (!window.confirm('Tem certeza que deseja excluir este template?')) return;
    setTemplates((prev) => prev.filter((t) => t.id !== tmplId));
    try {
      await ApiClient.delete(`/templates/${tmplId}`);
    } catch (err) {
      console.warn('[Templates] Deleted locally:', err);
    }
  };

  // Filter Templates
  const filteredTemplates = templates.filter((t) => {
    if (filterCategory === 'ALL') return true;
    return t.category === filterCategory;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Aprovado Meta
          </span>
        );
      case 'pending':
      case 'PENDING':
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-[10px] flex items-center gap-1">
            <Clock className="w-3 h-3 animate-pulse" /> Em Análise Meta
          </span>
        );
      case 'rejected':
      case 'REJECTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-[10px] flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Rejeitado Meta
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-400 font-bold text-[10px]">
            Rascunho
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)] bg-[#070b14]">
      {/* 1. Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-brand-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Templates de Mensagem WhatsApp Meta</h2>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                Meta Cloud API v19.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Crie, valide e sincronize modelos HSM oficiais para abertura de janelas de 24h e notificações
            </p>
          </div>
        </div>

        {/* Top Controls: Channel Sync & Add Template */}
        <div className="flex flex-wrap items-center gap-2.5">
          {officialChannels.length > 0 && (
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-white focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              {officialChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name} (Oficial)
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleSyncMetaTemplates}
            disabled={syncing}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 disabled:opacity-50"
            title="Forçar sincronização e consultar templates aprovados na Meta"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar com a Meta'}</span>
          </button>

          <button
            onClick={() => setShowBuilderModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 active:scale-95 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Template</span>
          </button>
        </div>
      </div>

      {/* 2. Official Channel Status Banner if none connected */}
      {officialChannels.length === 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <span>
              Nenhum canal oficial <strong>WhatsApp Meta API</strong> conectado. Você pode criar e validar rascunhos de templates, mas conecte seu número oficial na aba <strong>Canais</strong> para submeter e disparar em massa.
            </span>
          </div>
          <button
            onClick={handleSyncMetaTemplates}
            className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold hover:bg-amber-500/30 transition-colors ml-4 flex-shrink-0"
          >
            Verificar Conexão
          </button>
        </div>
      )}

      {/* 3. Category Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'ALL', label: 'Todos os Templates' },
            { id: 'UTILITY', label: 'Utilidade & Notificações (UTILITY)' },
            { id: 'MARKETING', label: 'Marketing & Promoções (MARKETING)' },
            { id: 'AUTHENTICATION', label: 'Autenticação & 2FA (AUTH)' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                filterCategory === cat.id ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {filteredTemplates.length} templates listados
        </span>
      </div>

      {/* 4. Templates Cards Grid */}
      {filteredTemplates.length === 0 && !loading ? (
        <div className="p-12 glass-card rounded-2xl border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">Nenhum template cadastrado nesta categoria</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Clique em <strong>Sincronizar com a Meta</strong> para puxar os modelos já aprovados na sua conta WhatsApp Business ou crie um novo template com validação automática.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={handleSyncMetaTemplates}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold"
            >
              Sincronizar com a Meta
            </button>
            <button
              onClick={() => setShowBuilderModal(true)}
              className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold"
            >
              Criar Novo Template
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tmpl) => {
            let bodyContent = '';
            try {
              if (typeof tmpl.components_json === 'string') {
                if (tmpl.components_json.startsWith('[')) {
                  const comps = JSON.parse(tmpl.components_json);
                  const bodyComp = comps.find((c) => c.type === 'BODY');
                  bodyContent = bodyComp?.text || tmpl.components_json;
                } else {
                  bodyContent = tmpl.components_json;
                }
              }
            } catch {
              bodyContent = tmpl.components_json || '';
            }

            return (
              <div
                key={tmpl.id}
                className="glass-card p-5 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between hover:border-brand-500/40 transition-all shadow-lg"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white font-mono">{tmpl.name}</h3>
                      <span className="text-[10px] text-slate-500 font-mono">Idioma: {tmpl.language || 'pt_BR'}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold">
                        {tmpl.category}
                      </span>
                      <button
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Excluir template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* WhatsApp Preview Bubble */}
                  <div className="p-3.5 rounded-xl bg-[#0a101d] border border-slate-800 text-xs space-y-1.5">
                    <p className="text-slate-200 leading-relaxed font-sans whitespace-pre-line text-[11px]">
                      {bodyContent}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                  <div>{getStatusBadge(tmpl.status)}</div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {tmpl.meta_template_id ? `ID: ${tmpl.meta_template_id}` : 'Local'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: CRIADOR DE TEMPLATE COM VALIDADOR META EM TEMPO REAL & PREVIEW */}
      {/* ========================================================================= */}
      {showBuilderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Criar & Submeter Template WhatsApp Meta</h3>
                  <p className="text-[11px] text-slate-400">
                    Validação em tempo real conforme as diretrizes oficiais da Meta Graph API v19.0
                  </p>
                </div>
              </div>

              <button onClick={() => setShowBuilderModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Validation Alerts Bar */}
            {validationErrors.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Problemas que causarão rejeição na Meta:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-200">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {validationWarnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> Recomendações:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {validationWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Split Screen: Form Builder (Left) vs WhatsApp Preview (Right) */}
            <form onSubmit={handleCreateTemplate} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Form Inputs (7 cols) */}
              <div className="lg:col-span-7 space-y-4 text-xs">
                {/* 1. Name, Category & Language */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-slate-300 font-semibold block mb-1">
                      Nome do Template (Meta ID) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: confirmacao_pedido_v1 (apenas minúsculas e _)"
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      A Meta aceita apenas letras minúsculas, números e sublinhados sem espaços.
                    </span>
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Categoria Meta *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-brand-500 cursor-pointer"
                    >
                      <option value="UTILITY">Utilidade / Notificações (UTILITY)</option>
                      <option value="MARKETING">Marketing / Vendas (MARKETING)</option>
                      <option value="AUTHENTICATION">Autenticação / 2FA (AUTH)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Idioma</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-brand-500 cursor-pointer"
                    >
                      <option value="pt_BR">Português (Brasil) - pt_BR</option>
                      <option value="en_US">Inglês (EUA) - en_US</option>
                      <option value="es">Espanhol - es</option>
                    </select>
                  </div>
                </div>

                {/* 2. Header (Optional) */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300">Cabeçalho (Opcional)</label>
                    <select
                      value={headerType}
                      onChange={(e) => setHeaderType(e.target.value)}
                      className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px]"
                    >
                      <option value="NONE">Sem Cabeçalho</option>
                      <option value="TEXT">Texto (máx 60 caracteres)</option>
                      <option value="IMAGE">Imagem (Banner)</option>
                      <option value="DOCUMENT">Documento (PDF)</option>
                    </select>
                  </div>

                  {headerType === 'TEXT' && (
                    <input
                      type="text"
                      placeholder="Ex: Confirmação de Agendamento"
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                      maxLength={60}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none"
                    />
                  )}
                </div>

                {/* 3. Body Text */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300">Corpo da Mensagem (BODY) *</label>
                    <span className="text-[10px] text-slate-500">{bodyText.length}/1024 caracteres</span>
                  </div>

                  <textarea
                    rows={4}
                    required
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-brand-500 font-sans leading-relaxed"
                  />

                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span>Inserir Variável:</span>
                    <button
                      type="button"
                      onClick={() => setBodyText((prev) => `${prev} {{${detectedVariables.length + 1}}}`)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-brand-300 font-mono font-bold"
                    >
                      + {`{{${detectedVariables.length + 1}}}`}
                    </button>
                  </div>
                </div>

                {/* 4. Mandatory Variable Samples Matrix (Required by Meta!) */}
                {detectedVariables.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-300 text-xs flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Exemplos das Variáveis (Exigido pela Meta)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {detectedVariables.map((num) => (
                        <div key={num}>
                          <label className="text-[10px] text-slate-400 block mb-0.5 font-mono">
                            Variável {`{{${num}}}`}:
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={`Ex: Valor para {{${num}}}`}
                            value={sampleValues[num] || ''}
                            onChange={(e) => setSampleValues((prev) => ({ ...prev, [num]: e.target.value }))}
                            className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Footer Text */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-300">Rodapé (Footer Opcional)</label>
                    <span className="text-[10px] text-slate-500">{footerText.length}/60 caracteres</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: Responda SAIR para não receber mais"
                    maxLength={60}
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Variáveis não são permitidas no rodapé.
                  </span>
                </div>

                {/* 6. Buttons */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={hasButtons}
                        onChange={(e) => setHasButtons(e.target.checked)}
                        className="rounded border-slate-700"
                      />
                      <span>Adicionar Botões Interativos</span>
                    </label>

                    {hasButtons && (
                      <select
                        value={buttonType}
                        onChange={(e) => setButtonType(e.target.value)}
                        className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px]"
                      >
                        <option value="QUICK_REPLY">Resposta Rápida (Quick Reply)</option>
                        <option value="URL">Link / CTA (URL)</option>
                        <option value="PHONE_NUMBER">Ligar para Número (Phone)</option>
                      </select>
                    )}
                  </div>

                  {hasButtons && buttonType === 'QUICK_REPLY' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Botão 1 (Ex: Sim)"
                        value={btnText1}
                        maxLength={25}
                        onChange={(e) => setBtnText1(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                      <input
                        type="text"
                        placeholder="Botão 2 (Ex: Não)"
                        value={btnText2}
                        maxLength={25}
                        onChange={(e) => setBtnText2(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                  )}

                  {hasButtons && buttonType === 'URL' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Texto do Botão (Ex: Acessar Link)"
                        value={btnText1}
                        maxLength={25}
                        onChange={(e) => setBtnText1(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                      <input
                        type="url"
                        placeholder="https://suaempresa.com.br"
                        value={btnUrl}
                        onChange={(e) => setBtnUrl(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Submit Directly Checkbox */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <input
                    type="checkbox"
                    id="submitDirect"
                    checked={submitDirectlyToMeta}
                    onChange={(e) => setSubmitDirectlyToMeta(e.target.checked)}
                    className="rounded border-slate-700 text-brand-500"
                  />
                  <label htmlFor="submitDirect" className="text-slate-300 font-medium cursor-pointer">
                    Submeter diretamente para aprovação da Meta Graph API (Status: Em Análise)
                  </label>
                </div>
              </div>

              {/* Right Column: Real-time WhatsApp Preview (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <span className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" /> Prévia Real no WhatsApp
                </span>

                <div className="p-4 rounded-2xl bg-[#0b141a] border border-slate-800 shadow-2xl relative space-y-3">
                  {/* WhatsApp chat bubble */}
                  <div className="bg-[#1f2c34] rounded-2xl rounded-tl-none p-3.5 text-white space-y-2 shadow-md max-w-sm">
                    {/* Header preview */}
                    {headerType === 'TEXT' && headerText && (
                      <h4 className="font-bold text-xs text-white border-b border-white/10 pb-1">
                        {headerText}
                      </h4>
                    )}
                    {headerType === 'IMAGE' && (
                      <div className="w-full h-28 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">
                        <Image className="w-8 h-8 text-slate-400" />
                      </div>
                    )}

                    {/* Body preview */}
                    <p className="text-[12px] text-slate-100 leading-relaxed font-sans whitespace-pre-line">
                      {previewRenderedBody}
                    </p>

                    {/* Footer preview */}
                    {footerText && (
                      <p className="text-[10px] text-slate-400 border-t border-white/10 pt-1">
                        {footerText}
                      </p>
                    )}
                  </div>

                  {/* Buttons Preview */}
                  {hasButtons && (
                    <div className="space-y-1.5 max-w-sm">
                      {buttonType === 'QUICK_REPLY' && (
                        <div className="flex gap-1.5">
                          {btnText1 && (
                            <div className="flex-1 py-1.5 rounded-xl bg-[#1f2c34] text-emerald-400 text-center text-xs font-semibold shadow border border-slate-800">
                              {btnText1}
                            </div>
                          )}
                          {btnText2 && (
                            <div className="flex-1 py-1.5 rounded-xl bg-[#1f2c34] text-emerald-400 text-center text-xs font-semibold shadow border border-slate-800">
                              {btnText2}
                            </div>
                          )}
                        </div>
                      )}

                      {buttonType === 'URL' && (
                        <div className="py-2 rounded-xl bg-[#1f2c34] text-emerald-400 text-center text-xs font-semibold flex items-center justify-center gap-1.5 shadow border border-slate-800">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{btnText1 || 'Acessar Link'}</span>
                        </div>
                      )}

                      {buttonType === 'PHONE_NUMBER' && (
                        <div className="py-2 rounded-xl bg-[#1f2c34] text-emerald-400 text-center text-xs font-semibold flex items-center justify-center gap-1.5 shadow border border-slate-800">
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>{btnText1 || 'Ligar Agora'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <span className="text-[10px] text-slate-500 text-center block pt-2">
                    Visualização renderizada com os valores de exemplo preenchidos
                  </span>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="lg:col-span-12 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBuilderModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={validationErrors.length > 0}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 text-white text-xs font-bold shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitDirectlyToMeta ? 'Validar & Submeter à Meta' : 'Salvar como Rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
