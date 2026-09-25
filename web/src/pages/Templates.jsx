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
import PageHeader from '../components/PageHeader';

export const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [builderError, setBuilderError] = useState('');
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [officialChannels, setOfficialChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');

  // Builder Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('UTILITY'); // UTILITY, MARKETING, AUTHENTICATION
  const [language, setLanguage] = useState('pt_BR');
  const [headerType, setHeaderType] = useState('NONE'); // NONE, TEXT, IMAGE, VIDEO, DOCUMENT
  const [headerText, setHeaderText] = useState('');
  const [headerSampleValue, setHeaderSampleValue] = useState('');
  const [headerMediaHandle, setHeaderMediaHandle] = useState('');
  const [headerMediaFileName, setHeaderMediaFileName] = useState('');
  const [headerMediaPreviewUrl, setHeaderMediaPreviewUrl] = useState('');
  const [uploadingHeaderMedia, setUploadingHeaderMedia] = useState(false);
  const [headerMediaError, setHeaderMediaError] = useState('');
  const [bodyText, setBodyText] = useState('Olá {{1}}, seu pedido número {{2}} foi confirmado com sucesso!');
  const [footerText, setFooterText] = useState('WH Panel WhatsApp Oficial');

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
    setPageError('');
    setPageNotice('');
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

      setPageNotice(res.message || 'Sincronização com a Meta concluída.');
    } catch (err) {
      setPageError(err.message || 'Não foi possível sincronizar com a Meta.');
    } finally {
      setSyncing(false);
    }
  };

  // Upload a sample media file (image/video/document) for the HEADER example,
  // required by the Meta Graph API before a media-header template can be created.
  const handleHeaderMediaUpload = async (file) => {
    if (!file) return;
    setHeaderMediaError('');
    setUploadingHeaderMedia(true);
    try {
      const res = await ApiClient.uploadFile('/templates/media/upload', file);
      setHeaderMediaHandle(res.handle);
      setHeaderMediaFileName(file.name);
      setHeaderMediaPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setHeaderMediaHandle('');
      setHeaderMediaFileName('');
      setHeaderMediaError(err.message || 'Erro ao enviar arquivo de exemplo para a Meta');
    } finally {
      setUploadingHeaderMedia(false);
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
      } else if (headerVars.length === 1 && headerVars[0][1] !== '1') {
        errors.push('A variável do cabeçalho deve ser obrigatoriamente {{1}}.');
      } else if (headerVars.length === 1 && !headerSampleValue.trim()) {
        errors.push('Informe um valor de exemplo para a variável do cabeçalho ({{1}}), exigido pela Meta.');
      }
    }
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      if (uploadingHeaderMedia) {
        errors.push('Aguarde o upload do arquivo de exemplo do cabeçalho ser concluído.');
      } else if (!headerMediaHandle) {
        errors.push('Envie um arquivo de exemplo (imagem/vídeo/documento) para o cabeçalho — exigido pela Meta antes de criar o template.');
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

    // 6. Meta Channel Requirement
    if (submitDirectlyToMeta && !selectedChannelId) {
      errors.push('Nenhum canal WhatsApp Meta oficial conectado/selecionado. Conecte um canal na aba Canais ou desmarque o envio direto para salvar como rascunho.');
    }

    // 7. Authentication Category Constraint
    if (category === 'AUTHENTICATION') {
      warnings.push('Templates de categoria AUTENTICAÇÃO seguem um formato restrito e pré-definido pela Meta (código de verificação): corpo, botões e rodapé customizados podem ser ignorados ou rejeitados na aprovação.');
    }

    setValidationErrors(errors);
    setValidationWarnings(warnings);
  }, [name, category, bodyText, footerText, headerType, headerText, headerSampleValue, hasButtons, buttonType, btnUrl, btnPhone, submitDirectlyToMeta, selectedChannelId, headerMediaHandle, uploadingHeaderMedia]);

  // Extract variables list from body & header for samples
  const detectedVariables = [];
  const bodyVarMatches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
  bodyVarMatches.forEach((m) => {
    const num = m[1];
    if (!detectedVariables.includes(num)) detectedVariables.push(num);
  });
  const nextBodyVarNum = detectedVariables.length > 0
    ? Math.max(...detectedVariables.map((n) => parseInt(n, 10))) + 1
    : 1;
  const headerHasVariable = headerType === 'TEXT' && /\{\{1\}\}/.test(headerText);

  // Generate WhatsApp Preview
  let previewRenderedBody = bodyText;
  detectedVariables.forEach((num) => {
    const sample = sampleValues[num] || `{{${num}}}`;
    previewRenderedBody = previewRenderedBody.replaceAll(`{{${num}}}`, sample);
  });
  const previewRenderedHeaderText = headerHasVariable
    ? headerText.replaceAll('{{1}}', headerSampleValue || '{{1}}')
    : headerText;

  // Handle Form Submit
  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    setBuilderError('');
    if (validationErrors.length > 0) {
      setBuilderError('Corrija os erros de validação acima antes de salvar.');
      return;
    }

    const components = [];

    // Header
    if (headerType === 'TEXT' && headerText.trim()) {
      const headerComp = { type: 'HEADER', format: 'TEXT', text: headerText.trim() };
      if (headerHasVariable && headerSampleValue.trim()) {
        headerComp.example = { header_text: [headerSampleValue.trim()] };
      }
      components.push(headerComp);
    } else if (headerType !== 'NONE') {
      const headerComp = { type: 'HEADER', format: headerType };
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerMediaHandle) {
        headerComp.example = { header_handle: [headerMediaHandle] };
      }
      components.push(headerComp);
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
      setHeaderType('NONE');
      setHeaderText('');
      setHeaderSampleValue('');
      setHeaderMediaHandle('');
      setHeaderMediaFileName('');
      setHeaderMediaPreviewUrl('');
      setHeaderMediaError('');
      setBodyText('Olá {{1}}, seu pedido número {{2}} foi confirmado com sucesso!');
      setSampleValues({ 1: 'Lucas Ferreira', 2: 'PED-98231' });
      setFooterText('WH Panel WhatsApp Oficial');
      setHasButtons(false);
      setPageError('');
      setPageNotice(
        submitDirectlyToMeta
          ? `Template "${created?.name || payload.name}" enviado para aprovação da Meta. O status muda quando a Meta responder.`
          : `Template "${created?.name || payload.name}" salvo como rascunho.`
      );
    } catch (err) {
      setBuilderError(err.message || 'Não foi possível criar o template.');
    }
  };

  // Delete Template Handler
  const handleDeleteTemplate = async (tmplId) => {
    if (!window.confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      await ApiClient.delete(`/templates/${tmplId}`);
      setTemplates((prev) => prev.filter((t) => t.id !== tmplId));
      setPageError('');
    } catch (err) {
      setPageError(err.message || 'Não foi possível excluir o template.');
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
    <div className="h-full overflow-y-auto">
    <div className="p-6 space-y-5">
      <PageHeader
        description="Modelos aprovados pela Meta são obrigatórios para iniciar conversas no WhatsApp oficial fora da janela de 24 horas e para campanhas."
        actions={
          <>
            {officialChannels.length > 0 && (
              <select
                aria-label="Canal oficial"
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="field w-auto h-8 max-w-[14rem]"
              >
                {officialChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleSyncMetaTemplates}
              disabled={syncing || officialChannels.length === 0}
              className="btn btn-secondary"
              title="Buscar os templates da conta WhatsApp Business na Meta"
            >
              <RefreshCw className={syncing ? 'animate-spin' : ''} strokeWidth={1.75} />
              {syncing ? 'Sincronizando…' : 'Sincronizar com a Meta'}
            </button>
            <button type="button" onClick={() => setShowBuilderModal(true)} className="btn btn-primary">
              <Plus strokeWidth={2} />
              Novo template
            </button>
          </>
        }
      />

      {pageError && <p role="alert" className="alert-error">{pageError}</p>}
      {pageNotice && (
        <p role="status" className="px-4 py-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] text-[13px] text-emerald-100/90">
          {pageNotice}
        </p>
      )}

      {officialChannels.length === 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] text-[13px] text-amber-100/90">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-300 flex-shrink-0" strokeWidth={1.75} />
          <p>
            Nenhum canal WhatsApp oficial conectado. Você pode montar rascunhos aqui, mas enviar para aprovação e sincronizar exige um canal oficial em Canais.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented" role="group" aria-label="Categoria">
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'UTILITY', label: 'Utilidade' },
            { id: 'MARKETING', label: 'Marketing' },
            { id: 'AUTHENTICATION', label: 'Autenticação' },
          ].map((cat) => (
            <button key={cat.id} type="button" aria-pressed={filterCategory === cat.id} onClick={() => setFilterCategory(cat.id)}>
              {cat.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 tabular-nums">
          {filteredTemplates.length} {filteredTemplates.length === 1 ? 'template' : 'templates'}
        </span>
      </div>

      {filteredTemplates.length === 0 && !loading ? (
        <div className="glass-card px-6 py-14 text-center space-y-3">
          <FileText className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
          <h2 className="text-sm font-medium text-white">
            {templates.length ? 'Nenhum template nesta categoria' : 'Nenhum template ainda'}
          </h2>
          <p className="text-[13px] text-slate-400 max-w-md mx-auto">
            Sincronize para trazer os modelos que já existem na sua conta WhatsApp Business, ou crie um novo e envie para aprovação.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            {officialChannels.length > 0 && (
              <button type="button" onClick={handleSyncMetaTemplates} disabled={syncing} className="btn btn-secondary">
                Sincronizar com a Meta
              </button>
            )}
            <button type="button" onClick={() => setShowBuilderModal(true)} className="btn btn-primary">
              <Plus strokeWidth={2} />
              Novo template
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
                  <div className="p-3.5 rounded-xl bg-surface border border-slate-800 text-xs space-y-1.5">
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
          <div className="bg-surface border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Criar & Submeter Template WhatsApp Meta</h3>
                  <p className="text-[11px] text-slate-400">
                    Validação em tempo real conforme as diretrizes oficiais da Meta Graph API v26.0
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
                      onChange={(e) => {
                        setHeaderType(e.target.value);
                        setHeaderMediaHandle('');
                        setHeaderMediaFileName('');
                        setHeaderMediaPreviewUrl('');
                        setHeaderMediaError('');
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px]"
                    >
                      <option value="NONE">Sem Cabeçalho</option>
                      <option value="TEXT">Texto (máx 60 caracteres)</option>
                      <option value="IMAGE">Imagem (Banner)</option>
                      <option value="VIDEO">Vídeo</option>
                      <option value="DOCUMENT">Documento (PDF)</option>
                    </select>
                  </div>

                  {headerType === 'TEXT' && (
                    <>
                      <input
                        type="text"
                        placeholder="Ex: Confirmação de Agendamento ou {{1}}"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        maxLength={60}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none"
                      />
                      {headerHasVariable && (
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5 font-mono">
                            Exemplo da variável {'{{1}}'} do cabeçalho:
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Valor para {{1}}"
                            value={headerSampleValue}
                            onChange={(e) => setHeaderSampleValue(e.target.value)}
                            className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 block font-mono">
                        Arquivo de exemplo ({headerType === 'IMAGE' ? 'JPEG ou PNG' : headerType === 'VIDEO' ? 'MP4 ou 3GPP' : 'PDF'}) — exigido pela Meta:
                      </label>
                      <input
                        type="file"
                        accept={
                          headerType === 'IMAGE'
                            ? 'image/jpeg,image/png'
                            : headerType === 'VIDEO'
                            ? 'video/mp4,video/3gpp'
                            : 'application/pdf'
                        }
                        onChange={(e) => handleHeaderMediaUpload(e.target.files?.[0])}
                        className="w-full text-[11px] text-slate-300 file:mr-2 file:px-2.5 file:py-1 file:rounded-lg file:border-0 file:bg-slate-800 file:text-brand-300 file:text-[11px] file:font-semibold file:cursor-pointer cursor-pointer"
                      />
                      {uploadingHeaderMedia && (
                        <p className="text-[10px] text-brand-300 flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Enviando para a Meta...
                        </p>
                      )}
                      {!uploadingHeaderMedia && headerMediaHandle && (
                        <p className="text-[10px] text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3" /> {headerMediaFileName} enviado com sucesso.
                        </p>
                      )}
                      {!uploadingHeaderMedia && headerMediaError && (
                        <p className="text-[10px] text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3" /> {headerMediaError}
                        </p>
                      )}
                    </div>
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
                      onClick={() => setBodyText((prev) => `${prev} {{${nextBodyVarNum}}}`)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-brand-300 font-mono font-bold"
                    >
                      + {`{{${nextBodyVarNum}}}`}
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
                        {previewRenderedHeaderText}
                      </h4>
                    )}
                    {headerType === 'IMAGE' && (
                      headerMediaPreviewUrl ? (
                        <img src={headerMediaPreviewUrl} alt="Exemplo de cabeçalho" className="w-full h-28 rounded-xl object-cover" />
                      ) : (
                        <div className="w-full h-28 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">
                          <Image className="w-8 h-8 text-slate-400" />
                        </div>
                      )
                    )}
                    {headerType === 'VIDEO' && (
                      headerMediaPreviewUrl ? (
                        <video src={headerMediaPreviewUrl} className="w-full h-28 rounded-xl object-cover" controls />
                      ) : (
                        <div className="w-full h-28 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">
                          <Video className="w-8 h-8 text-slate-400" />
                        </div>
                      )
                    )}
                    {headerType === 'DOCUMENT' && (
                      <div className="w-full h-16 rounded-xl bg-slate-800 flex items-center justify-center gap-2 text-slate-500">
                        <FileBox className="w-6 h-6 text-slate-400" />
                        <span className="text-[10px] text-slate-400">{headerMediaFileName || 'documento.pdf'}</span>
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
              <div className="lg:col-span-12 flex items-center justify-end gap-2 pt-4 border-t border-white/[0.06]">
                {builderError && <p role="alert" className="mr-auto text-[13px] text-rose-300">{builderError}</p>}
                <button type="button" onClick={() => setShowBuilderModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={validationErrors.length > 0} className="btn btn-primary">
                  {submitDirectlyToMeta ? 'Validar & Submeter à Meta' : 'Salvar como Rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default Templates;