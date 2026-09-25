import React, { useState, useEffect, useRef } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import ApiClient from '../api/client';
import { loadMetaSdk, createSignupCollector } from '../api/metaSignup';

let signupInProgress = null;

export const MetaEmbeddedSignupButton = ({ channelName = 'WhatsApp Oficial', onSuccess, className, label }) => {
  const [config, setConfig] = useState(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [stage, setStage] = useState('');
  const cleanupRef = useRef(() => {});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    ApiClient.get('/channels/meta/config').then(async (cfg) => {
      if (!cfg.app_id || !cfg.config_id || !cfg.app_secret_configured || !cfg.verify_token_configured) {
        throw new Error('A conexão oficial ainda não foi configurada pelo administrador da plataforma.');
      }
      await loadMetaSdk(cfg);
      if (!cancelled) { setConfig(cfg); setReady(true); }
    }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; mounted.current = false; cleanupRef.current(); };
  }, []);

  const handleClick = () => {
    if (!ready || connecting || signupInProgress) return;
    if (!/^[0-9]{6}$/.test(pin)) { setError('Informe o PIN de 6 dígitos do número.'); return; }
    const attempt = Symbol();
    signupInProgress = attempt;
    setConnecting(true); setError(''); setStage('Conclua o cadastro na janela da Meta…');
    let timer;
    let collector;
    let submitted = false;
    const handleMessage = (event) => collector.event(event);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      collector?.cancel();
      if (signupInProgress === attempt) signupInProgress = null;
    };
    const fail = (message) => { cleanup(); if (mounted.current) { setConnecting(false); setError(message); } };
    collector = createSignupCollector(async (data) => {
      submitted = true;
      clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      if (mounted.current) setStage('Registrando o número e conectando o canal…');
      try {
        const res = await ApiClient.post('/channels/meta/embedded-signup', { ...data, pin, channel_name: channelName });
        cleanup();
        if (mounted.current) { setConnecting(false); setPin(''); setStage('WhatsApp conectado com sucesso.'); onSuccess?.(res.channel); }
      } catch (err) { fail(err.message); }
    }, fail);
    cleanupRef.current = cleanup;
    window.addEventListener('message', handleMessage);
    timer = setTimeout(() => collector.fail('O cadastro não foi concluído. Feche a janela da Meta e tente novamente.'), 10 * 60 * 1000);
    try {
      window.FB.login((response) => {
        collector.code(response?.authResponse?.code);
        clearTimeout(timer);
        if (signupInProgress === attempt && !submitted) timer = setTimeout(() => collector.fail('A Meta não retornou os dados do número. Confira os domínios autorizados e tente novamente.'), 15000);
      }, {
        config_id: config.config_id,
        response_type: 'code',
        override_default_response_type: true,
        extras: { version: config.embedded_signup_version || 'v4', sessionInfoVersion: '3' },
      });
    } catch { fail('Não foi possível abrir a janela da Meta. Verifique o bloqueador de popups.'); }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-300">
        PIN de verificação em duas etapas do número
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} disabled={connecting}
          placeholder="6 dígitos" className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white" />
      </label>
      <p className="text-[11px] text-slate-400">Para um número novo, escolha e guarde um PIN. Para um número existente, use o PIN atual. Não é o código recebido por SMS.</p>
      <button type="button" onClick={handleClick} disabled={!ready || connecting}
        className={className || 'w-full py-2.5 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60'}>
        {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
        <span>{connecting ? 'Conectando…' : label || 'Conectar WhatsApp Oficial'}</span>
      </button>
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      {!error && stage && <p role="status" className="text-xs text-slate-300">{stage}</p>}
    </div>
  );
};

export default MetaEmbeddedSignupButton;
