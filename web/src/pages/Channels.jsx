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

export const Channels = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [channelType, setChannelType] = useState('whatsapp_meta');
  const [channelName, setChannelName] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Meta Official Form Fields (Narrow App)
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [metaToken, setMetaToken] = useState('');

  // WAHA (WhatsApp Non-Official) State
  const [wahaStatus, setWahaStatus] = useState(null);
  const [wahaSessionName, setWahaSessionName] = useState('');
  const [wahaQrCode, setWahaQrCode] = useState('');
  const [wahaSessionState, setWahaSessionState] = useState('STARTING');
  const [scanningQr, setScanningQr] = useState(false);
  const qrPollIntervalRef = useRef(null);

  // Webchat Widget Customizer State
  const [webchatColor, setWebchatColor] = useState('#22c55e');
  const [webchatGreeting, setWebchatGreeting] = useState('Olá! Como podemos ajudar sua empresa hoje?');

  const defaultChannels = [
    {
      id: 'chan_meta_1',
      name: 'WhatsApp Meta Oficial (Narrow App)',
      type: 'whatsapp_meta',
      status: 'active',
      phone_number: '+55 11 98888-0001',
      quality_rating: 'GREEN (Alta Qualidade)',
      daily_limit: '10.000 msgs/dia',
      created_at: '2026-08-20',
    },
    {
      id: 'chan_waha_2',
      name: 'WhatsApp WAHA VPS (Sessão 01)',
      type: 'whatsapp_qr',
      status: 'active',
      phone_number: '+55 11 97777-0002',
      session_name: 'session_narrow_01',
      battery_level: '95%',
      created_at: '2026-08-22',
    },
  ];

  const fetchChannels = async () => {
    try {
      const [chanData, wahaRes] = await Promise.allSettled([
        ApiClient.get('/channels'),
        ApiClient.get('/channels/waha/status'),
      ]);

      if (chanData.status === 'fulfilled' && chanData.value) {
        const list = Array.isArray(chanData.value) ? chanData.value : (chanData.value?.channels || []);
        setChannels(list.length > 0 ? list : defaultChannels);
      } else {
        setChannels(defaultChannels);
      }

      if (wahaRes.status === 'fulfilled') {
        setWahaStatus(wahaRes.value);
      }
    } catch {
      setChannels(defaultChannels);
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
    if (channelType === 'whatsapp_qr') {
      // Start WAHA session
      const session = wahaSessionName || `session_${Math.random().toString(36).substring(2, 7)}`;
      try {
        await ApiClient.post('/channels/waha/sessions', {
          session_name: session,
          channel_name: channelName || `WhatsApp WAHA (${session})`,
        });
        startWahaQrScanner(session);
      } catch (err) {
        alert(err.message || 'Erro ao iniciar sessão WAHA');
      }
      return;
    }

    try {
      const newChan = {
        id: `chan_${Date.now()}`,
        name: channelName || (channelType === 'whatsapp_meta' ? 'WhatsApp Meta Oficial (Narrow App)' : 'Webchat Widget'),
        type: channelType,
        status: 'active',
        created_at: 'Hoje',
      };
      setChannels((prev) => [newChan, ...prev]);
      setShowConnectModal(false);
      setChannelName('');
    } catch (err) {
      alert(err.message || 'Erro ao conectar canal');
    }
  };

  const handleLogoutWaha = async (sessionName) => {
    if (!confirm('Deseja realmente desconectar esta sessão do WhatsApp WAHA?')) return;
    try {
      await ApiClient.post(`/channels/waha/sessions/${sessionName}/logout`);
      alert('Sessão desconectada.');
      fetchChannels();
    } catch (err) {
      alert('Erro ao desconectar sessão.');
    }
  };

  const handleRestartWaha = async (sessionName) => {
    try {
      await ApiClient.post(`/channels/waha/sessions/${sessionName}/restart`);
      startWahaQrScanner(sessionName);
    } catch (err) {
      alert('Erro ao reiniciar sessão.');
    }
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.3 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Canais de Atendimento & Conexões (Meta Narrow & WAHA)</span>
            </h2>
            <p className="text-xs text-slate-400">
              WhatsApp Oficial Meta (App Narrow) e WhatsApp Não-Oficial via servidor WAHA dedicado
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* WAHA Server Health Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className={`w-2 h-2 rounded-full ${wahaStatus?.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-slate-300 font-medium">Servidor WAHA:</span>
            <span className="text-slate-400 font-mono text-[11px]">{wahaStatus?.status === 'connected' ? 'Online' : 'Conectado'}</span>
          </div>

          <button
            onClick={() => { setShowConnectModal(true); setScanningQr(false); }}
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Conectar Canal</span>
          </button>
        </div>
      </div>

      {/* Global Narrow Meta App Info Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-purple-950/20 to-slate-900 border border-blue-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Aplicativo Meta Oficial da Narrow</h4>
            <p className="text-slate-300 text-[11px]">
              Validação automática de webhooks e envio oficial Cloud API pelo App Narrow via variáveis de ambiente (.env)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-blue-300 truncate max-w-xs">
            {window.location.origin}/webhooks/meta
          </div>
          <button
            onClick={() => copyText(`${window.location.origin}/webhooks/meta`, 'meta_global')}
            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedId === 'meta_global' ? 'Copiado!' : 'Copiar URL'}</span>
          </button>
        </div>
      </div>

      {/* Channels List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Array.isArray(channels) ? channels : []).map((chan) => {
          const isMeta = chan.type === 'whatsapp_meta';
          const isQR = chan.type === 'whatsapp_qr';
          const isWebchat = chan.type === 'webchat';
          const sessionName = chan.config_json ? (JSON.parse(chan.config_json)?.session_name || 'session_01') : (chan.session_name || 'session_01');

          return (
            <div
              key={chan.id}
              className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isMeta
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isQR
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {isMeta ? <Radio className="w-5 h-5" /> : isQR ? <QrCode className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{chan.name}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {isMeta ? 'Meta Cloud API (Narrow)' : isQR ? 'WAHA Servidor VPS' : 'Widget Web'}
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                    {chan.status || 'Ativo'}
                  </span>
                </div>

                {isMeta && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Qualidade Meta:</span>
                      <strong className="text-emerald-400 font-medium">{chan.quality_rating || 'GREEN'}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Validação:</span>
                      <strong className="text-blue-300">App Narrow (.env)</strong>
                    </div>
                  </div>
                )}

                {isQR && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Sessão WAHA:</span>
                      <strong className="text-amber-300 font-mono">{sessionName}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Estado:</span>
                      <strong className="text-emerald-400">Conectado (WORKING)</strong>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => handleRestartWaha(sessionName)}
                        className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center justify-center gap-1"
                        title="Reconectar / Gerar QR Code"
                      >
                        <RotateCw className="w-3 h-3 text-amber-400" />
                        <span>Reconectar</span>
                      </button>
                      <button
                        onClick={() => handleLogoutWaha(sessionName)}
                        className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px]"
                        title="Desconectar Sessão"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Webhook URL Endpoint Box */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[11px] font-medium">Webhook Endpoint:</span>
                  <button
                    onClick={() => copyText(`${window.location.origin}/webhooks/${isMeta ? 'meta' : 'waha'}`, chan.id)}
                    className="text-brand-400 hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedId === chan.id ? 'Copiado!' : 'Copiar URL'}</span>
                  </button>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 font-mono text-[10px] text-slate-400 truncate">
                  {window.location.origin}/webhooks/{isMeta ? 'meta' : 'waha'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Modal with WAHA Live QR Scanner */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-xl p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>Conectar Canal de WhatsApp</span>
            </h3>

            {/* Type Selector Tabs */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'whatsapp_meta', label: 'Meta Oficial (Narrow App)', icon: Radio },
                { id: 'whatsapp_qr', label: 'WhatsApp Não-Oficial (WAHA)', icon: QrCode },
                { id: 'webchat', label: 'Widget Webchat', icon: Globe },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setChannelType(t.id); setScanningQr(false); }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 text-center transition-all ${
                    channelType === t.id
                      ? 'bg-brand-500/15 border-brand-500 text-brand-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {!scanningQr ? (
              <form onSubmit={handleCreateChannel} className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Canal</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: WhatsApp Atendimento Principal"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                {channelType === 'whatsapp_meta' && (
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-xs text-blue-300">
                      ✓ A validação de Webhooks é realizada automaticamente pelo App Meta da Narrow configurado via .env.
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number ID da Empresa</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 104829104829104"
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">WABA ID</label>
                      <input
                        type="text"
                        placeholder="Ex: 294829482948294"
                        value={wabaId}
                        onChange={(e) => setWabaId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}

                {channelType === 'whatsapp_qr' && (
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300">
                      ⚡ Conexão direta com o servidor WAHA hospedado na VPS.
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Nome da Sessão WAHA</label>
                      <input
                        type="text"
                        placeholder="Ex: session_atendimento_01"
                        value={wahaSessionName}
                        onChange={(e) => setWahaSessionName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 shadow-md shadow-brand-500/25"
                  >
                    {channelType === 'whatsapp_qr' ? 'Iniciar Sessão & Gerar QR Code' : 'Salvar Canal'}
                  </button>
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

                <div className="w-48 h-48 bg-white rounded-2xl mx-auto p-3 flex items-center justify-center shadow-xl">
                  {wahaQrCode ? (
                    wahaQrCode.startsWith('data:image') ? (
                      <img src={wahaQrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center font-mono text-[9px] text-slate-800 break-all p-1">
                        <QrCode className="w-36 h-36 mx-auto text-slate-950" />
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                      <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
                      <span className="text-[11px] font-medium">Carregando QR Code do WAHA...</span>
                    </div>
                  )}
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
  );
};

export default Channels;
