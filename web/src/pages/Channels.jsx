import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Plus,
  QrCode,
  Globe,
  Instagram,
  CheckCircle,
  Copy,
  ExternalLink,
  Shield,
  Trash2,
  RefreshCw,
  Sliders,
  Sparkles,
  Send,
  Code,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Power,
  RotateCw
} from 'lucide-react';
import ApiClient from '../api/client';
import { QRCodeSVG } from 'qrcode.react';
import MetaEmbeddedSignupButton from '../components/MetaEmbeddedSignupButton';
import PageHeader from '../components/PageHeader';
import { normalizePhone } from '../lib/phone';

const channelStatusLabels = { active: 'Ativo', inactive: 'Inativo', disconnected: 'Desconectado', pending: 'Pendente' };

const wahaStateLabels = {
  WORKING: 'conectado',
  STARTING: 'iniciando',
  SCAN_QR_CODE: 'aguardando leitura do QR code',
  FAILED: 'falha na conexão',
  STOPPED: 'sessão parada',
  UNKNOWN: 'verificando',
};

const sessionOf = (chan) => {
  try {
    return (chan.config_json && JSON.parse(chan.config_json)?.session_name) || chan.session_name || 'session_01';
  } catch {
    return chan.session_name || 'session_01';
  }
};

export const Channels = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [channelType, setChannelType] = useState('whatsapp_meta');
  const [channelName, setChannelName] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [pageError, setPageError] = useState('');
  const [modalError, setModalError] = useState('');

  // Meta Official Form Fields
  const [phoneNumber, setPhoneNumber] = useState('');

  // WAHA (WhatsApp Non-Official) State
  const [wahaStatus, setWahaStatus] = useState(null);
  const [wahaSessionStatuses, setWahaSessionStatuses] = useState({});
  const [wahaSessionName, setWahaSessionName] = useState('');
  const [wahaQrCode, setWahaQrCode] = useState('');
  const [wahaSessionState, setWahaSessionState] = useState('STARTING');
  const [scanningQr, setScanningQr] = useState(false);
  const qrPollIntervalRef = useRef(null);

  // Webchat Widget Customizer State
  const [webchatColor, setWebchatColor] = useState('#22c55e');
  const [webchatGreeting, setWebchatGreeting] = useState('Olá! Como podemos ajudar sua empresa hoje?');

  const fetchChannels = async () => {
    try {
      const [chanData, wahaRes] = await Promise.allSettled([
        ApiClient.get('/channels'),
        ApiClient.get('/channels/waha/status'),
      ]);

      if (chanData.status === 'fulfilled' && chanData.value) {
        const list = Array.isArray(chanData.value) ? chanData.value : (chanData.value?.channels || []);
        setChannels(list);

        // Fetch real per-session WAHA connection state for each QR channel
        const qrChannels = list.filter((c) => c.type === 'whatsapp_qr');
        if (qrChannels.length > 0) {
          const sessionNames = qrChannels.map(sessionOf);
          const statusResults = await Promise.allSettled(
            sessionNames.map((sn) => ApiClient.get(`/channels/waha/sessions/${sn}/status`))
          );
          const statusMap = {};
          statusResults.forEach((r, idx) => {
            statusMap[sessionNames[idx]] = r.status === 'fulfilled' ? (r.value?.status || 'UNKNOWN') : 'UNKNOWN';
          });
          setWahaSessionStatuses(statusMap);
        }
      } else {
        setChannels([]);
      }

      if (wahaRes.status === 'fulfilled') {
        setWahaStatus(wahaRes.value);
      }
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
    return () => {
      if (qrPollIntervalRef.current) clearInterval(qrPollIntervalRef.current);
    };
  }, []);

  // WAHA QR Code Polling Loop
  const startWahaQrScanner = async (sessionName) => {
    setScanningQr(true);
    setWahaQrCode('');
    setWahaSessionState('STARTING');

    const poll = async () => {
      try {
        const [qrRes, statusRes] = await Promise.allSettled([
          ApiClient.get(`/channels/waha/sessions/${sessionName}/qr`),
          ApiClient.get(`/channels/waha/sessions/${sessionName}/status`),
        ]);

        if (qrRes.status === 'fulfilled' && qrRes.value?.qr) {
          setWahaQrCode(qrRes.value.qr);
        }

        if (statusRes.status === 'fulfilled') {
          const st = statusRes.value?.status || 'UNKNOWN';
          setWahaSessionState(st);
          if (st === 'WORKING') {
            // Connected successfully!
            clearInterval(qrPollIntervalRef.current);
            setScanningQr(false);
            fetchChannels();
          }
        }
      } catch (err) {
        console.warn('[WAHA Poll] Error:', err);
      }
    };

    poll();
    if (qrPollIntervalRef.current) clearInterval(qrPollIntervalRef.current);
    qrPollIntervalRef.current = setInterval(poll, 4000);
  };


  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (channelType === 'whatsapp_meta') return;
    if (channelType === 'whatsapp_qr') {
      // Start WAHA session
      const session = wahaSessionName || `session_${Math.random().toString(36).substring(2, 7)}`;
      try {
        const res = await ApiClient.post('/channels/waha/sessions', {
          session_name: session,
          channel_name: channelName || `WhatsApp WAHA (${session})`,
        });
        if (res && res.channel && res.channel.id) {
          setChannels((prev) => [res.channel, ...prev.filter((c) => c.id !== res.channel.id)]);
        }
        fetchChannels();
        startWahaQrScanner(session);
      } catch (err) {
        setModalError(err.message || 'Não foi possível iniciar a sessão do QR code.');
      }
      return;
    }

    let normalizedPhone = '';
    if (channelType === 'whatsapp_meta' && phoneNumber.trim()) {
      normalizedPhone = normalizePhone(phoneNumber);
      if (!normalizedPhone) {
        setModalError('Número de WhatsApp inválido. Informe o número completo com código do país e DDD, por exemplo +55 11 99999-8888.');
        return;
      }
    }

    try {
      const payload = {
        name: channelName || (channelType === 'whatsapp_meta' ? 'WhatsApp Meta Oficial' : 'Webchat Widget'),
        type: channelType,
        config: {
          phone_number: normalizedPhone || phoneNumber,
          app_managed: 'wh_panel',
        },
      };

      await ApiClient.post('/channels', payload);
      setShowConnectModal(false);
      setChannelName('');
      setPhoneNumber('');
      fetchChannels();
    } catch (err) {
      setModalError(err.message || 'Não foi possível conectar o canal.');
    }
  };

  const handleLogoutWaha = async (sessionName) => {
    if (!window.confirm('Desconectar este número? Será preciso ler o QR code de novo para reconectar.')) return;
    try {
      await ApiClient.post(`/channels/waha/sessions/${sessionName}/logout`);
      setPageError('');
      fetchChannels();
    } catch (err) {
      setPageError(err.message || 'Não foi possível desconectar a sessão.');
    }
  };

  const handleRestartWaha = async (sessionName) => {
    try {
      await ApiClient.post(`/channels/waha/sessions/${sessionName}/restart`);
      setPageError('');
      startWahaQrScanner(sessionName);
    } catch (err) {
      setPageError(err.message || 'Não foi possível reiniciar a sessão.');
    }
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 space-y-5">
      <PageHeader
        description="Conecte o WhatsApp oficial da Meta ou um número via QR code. Todas as conversas chegam na mesma caixa de Conversas."
        actions={
          <>
            <span
              className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-white/[0.08] text-xs text-slate-300"
              title="Servidor WAHA usado pelas conexões via QR code"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${wahaStatus?.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              Servidor QR {wahaStatus?.status === 'connected' ? 'online' : 'offline'}
            </span>
            <button type="button" onClick={() => { setShowConnectModal(true); setScanningQr(false); setModalError(''); }} className="btn btn-primary">
              <Plus strokeWidth={2} />
              Conectar canal
            </button>
          </>
        }
      />

      {pageError && <p role="alert" className="alert-error">{pageError}</p>}

      <div className="glass-card px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-white">URL de webhook da Meta</p>
          <p className="text-xs text-slate-500">Cadastre no app da Meta para receber mensagens e status dos canais oficiais.</p>
        </div>
        <code className="px-2.5 h-8 inline-flex items-center rounded-md bg-white/[0.03] border border-white/[0.06] font-mono text-xs text-slate-300 truncate max-w-full sm:max-w-sm">
          {window.location.origin}/webhooks/meta
        </code>
        <button type="button" onClick={() => copyText(`${window.location.origin}/webhooks/meta`, 'meta_global')} className="btn btn-secondary">
          {copiedId === 'meta_global' ? <CheckCircle strokeWidth={1.75} /> : <Copy strokeWidth={1.75} />}
          {copiedId === 'meta_global' ? 'Copiada' : 'Copiar'}
        </button>
      </div>

      {channels.length === 0 && !loading ? (
        <div className="glass-card px-6 py-14 text-center space-y-3">
          <Radio className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
          <h2 className="text-sm font-medium text-white">Nenhum canal conectado</h2>
          <p className="text-[13px] text-slate-400 max-w-md mx-auto">
            Conecte o WhatsApp oficial pela Meta ou leia um QR code para começar a receber conversas.
          </p>
          <button type="button" onClick={() => { setShowConnectModal(true); setScanningQr(false); setModalError(''); }} className="btn btn-primary mt-2">
            <Plus strokeWidth={2} />
            Conectar canal
          </button>
        </div>
      ) : (
        <ul className="glass-card divide-y divide-white/[0.05]">
          {channels.map((chan) => {
            const isMeta = chan.type === 'whatsapp_meta' || chan.type === 'whatsapp_official';
            const isQR = chan.type === 'whatsapp_qr';
            const sessionName = sessionOf(chan);
            const sessionState = isQR ? wahaSessionStatuses[sessionName] || 'UNKNOWN' : null;
            const Icon = isMeta ? Radio : isQR ? QrCode : Globe;
            const webhookUrl = `${window.location.origin}/webhooks/${isMeta ? 'meta' : 'waha'}`;
            return (
              <li key={chan.id} className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-medium text-white truncate">{chan.name}</h3>
                      <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${chan.status === 'active' ? 'text-emerald-300 border-emerald-500/25' : 'text-slate-400 border-white/[0.08]'}`}>
                        {channelStatusLabels[chan.status] || chan.status || 'Ativo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {isMeta ? 'WhatsApp oficial · Meta Cloud API' : isQR ? `WhatsApp via QR code · sessão ${sessionName}` : 'Webchat'}
                      {isMeta && chan.quality_rating && ` · qualidade ${chan.quality_rating}`}
                      {isQR && (
                        <span className={sessionState === 'WORKING' ? 'text-emerald-300' : sessionState === 'FAILED' ? 'text-rose-300' : 'text-amber-300'}>
                          {' · '}{wahaStateLabels[sessionState] || sessionState}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => copyText(webhookUrl, chan.id)} className="btn btn-secondary" title={webhookUrl}>
                    {copiedId === chan.id ? <CheckCircle strokeWidth={1.75} /> : <Copy strokeWidth={1.75} />}
                    {copiedId === chan.id ? 'Copiada' : 'URL do webhook'}
                  </button>
                  {isQR && (
                    <>
                      <button type="button" onClick={() => handleRestartWaha(sessionName)} className="btn btn-secondary" title="Gerar um novo QR code para esta sessão">
                        <RotateCw strokeWidth={1.75} />
                        Reconectar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogoutWaha(sessionName)}
                        className="btn btn-icon text-slate-500 hover:text-rose-300"
                        aria-label={`Desconectar ${chan.name}`}
                        title="Desconectar"
                      >
                        <LogOut strokeWidth={1.75} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Connect Modal with WAHA Live QR Scanner */}
      {showConnectModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onMouseDown={(e) => e.target === e.currentTarget && !scanningQr && setShowConnectModal(false)}
        >
          <div role="dialog" aria-modal="true" aria-label="Conectar canal" className="glass-card w-full max-w-xl p-5 space-y-4 my-auto shadow-2xl animate-fade-in">
            <h2 className="text-[13px] font-medium text-white">Conectar canal</h2>

            <div className="segmented w-full" role="group" aria-label="Tipo de canal">
              {[
                { id: 'whatsapp_meta', label: 'WhatsApp oficial', icon: Radio },
                { id: 'whatsapp_qr', label: 'WhatsApp via QR', icon: QrCode },
                { id: 'webchat', label: 'Webchat', icon: Globe },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={channelType === t.id}
                  onClick={() => { setChannelType(t.id); setScanningQr(false); setModalError(''); }}
                  className="flex-1 justify-center"
                >
                  <t.icon strokeWidth={1.75} />
                  {t.label}
                </button>
              ))}
            </div>

            {modalError && <p role="alert" className="text-[13px] text-rose-300">{modalError}</p>}

            {!scanningQr ? (
              <form onSubmit={handleCreateChannel} className="space-y-3 pt-2">
                <div>
                  <label htmlFor="channel-name" className="field-label">Nome do canal</label>
                  <input
                    id="channel-name"
                    type="text"
                    required
                    placeholder="Ex.: Atendimento principal"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="field"
                  />
                </div>

                {channelType === 'whatsapp_meta' && (
                  <div className="space-y-4">
                    {/* Embedded Signup Fast Connect Banner */}
                    <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-800/40 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Conexão Automática Oficial</h4>
                          <p className="text-[11px] text-slate-400">
                            Cadastre seu número ou vincule sua conta do WhatsApp Business em poucos segundos
                          </p>
                        </div>
                      </div>

                      <MetaEmbeddedSignupButton
                        channelName={channelName || 'WhatsApp Oficial'}
                        onSuccess={(channel) => {
                          if (channel?.id) {
                            setChannels((prev) => [channel, ...prev.filter((c) => c.id !== channel.id)]);
                          }
                          setShowConnectModal(false);
                          setChannelName('');
                          fetchChannels();
                        }}
                      />

                      <p className="text-[10px] text-slate-400 text-center">
                        O canal é ativado após a Meta confirmar o registro do número e a inscrição do webhook.
                      </p>
                    </div>


                  </div>
                )}

                {channelType === 'whatsapp_qr' && (
                  <div className="space-y-2.5">
                    <p className="text-[13px] text-slate-400">
                      Conexão não oficial pelo servidor WAHA: você lê um QR code com o celular. Não exige templates aprovados pela Meta.
                    </p>

                    <div>
                      <label htmlFor="waha-session" className="field-label">
                        Nome da sessão <span className="text-slate-500">(opcional)</span>
                      </label>
                      <input
                        id="waha-session"
                        type="text"
                        placeholder="Ex.: atendimento_01"
                        value={wahaSessionName}
                        onChange={(e) => setWahaSessionName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        className="field font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowConnectModal(false)} className="btn btn-secondary">
                    Cancelar
                  </button>
                  {channelType !== 'whatsapp_meta' && (
                    <button type="submit" className="btn btn-primary">
                      {channelType === 'whatsapp_qr' ? 'Gerar QR code' : 'Salvar canal'}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              /* Live WAHA QR Code Scanner Interface */
              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Escaneie o QR Code no seu WhatsApp</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold uppercase">
                    {wahaSessionState}
                  </span>
                </div>

                <div className="w-52 h-52 bg-white rounded-2xl mx-auto p-3 flex items-center justify-center shadow-xl overflow-hidden">
                  {(() => {
                    if (!wahaQrCode) {
                      return (
                        <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                          <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
                          <span className="text-[11px] font-medium">Carregando QR Code do WAHA...</span>
                        </div>
                      );
                    }
                    if (wahaQrCode.startsWith('data:image/') || wahaQrCode.startsWith('http://') || wahaQrCode.startsWith('https://')) {
                      return <img src={wahaQrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain rounded-xl" />;
                    }
                    if (wahaQrCode.startsWith('iVBORw0KGgo') || wahaQrCode.startsWith('/9j/') || (wahaQrCode.length > 500 && !wahaQrCode.includes('<svg'))) {
                      return <img src={`data:image/png;base64,${wahaQrCode}`} alt="WhatsApp QR Code" className="w-full h-full object-contain rounded-xl" />;
                    }
                    if (wahaQrCode.startsWith('<svg')) {
                      return <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: wahaQrCode }} />;
                    }
                    if (wahaQrCode.length <= 1000) {
                      return (
                        <QRCodeSVG
                          value={wahaQrCode}
                          size={180}
                          bgColor="#ffffff"
                          fgColor="#000000"
                          level="L"
                          includeMargin={false}
                        />
                      );
                    }
                    return (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(wahaQrCode)}`}
                        alt="WhatsApp QR Code"
                        className="w-full h-full object-contain"
                      />
                    );
                  })()}
                </div>

                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  No celular, abra o WhatsApp &gt; <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar Aparelho</strong>. A tela atualizará automaticamente após a leitura.
                </p>

                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setScanningQr(false); setShowConnectModal(false); }}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default Channels;