let sdkPromise;
let sdkApp;
export function loadMetaSdk(config) {
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      if (window.FB) { resolve(window.FB); return; }
      const timer = setTimeout(() => reject(new Error('O SDK da Meta não carregou. Verifique a conexão.')), 20000);
      window.fbAsyncInit = () => { clearTimeout(timer); resolve(window.FB); };
      let script = document.getElementById('facebook-jssdk');
      if (!script) {
        script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);
      }
      script.addEventListener('error', () => { clearTimeout(timer); script.remove(); reject(new Error('Falha ao carregar o SDK da Meta.')); }, { once: true });
    }).catch((err) => { sdkPromise = undefined; throw err; });
  }
  return sdkPromise.then((fb) => {
    const key = `${config.app_id}:${config.api_version}`;
    if (sdkApp !== key) {
      fb.init({ appId: config.app_id, version: config.api_version, autoLogAppEvents: false, xfbml: false });
      sdkApp = key;
    }
    return fb;
  });
}

export function parseSignupEvent(event) {
  if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return null;
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    return data?.type === 'WA_EMBEDDED_SIGNUP' ? data : null;
  } catch { return null; }
}

// Fresh state for each attempt; the code and session event can arrive in either order.
export function createSignupCollector(onReady, onError) {
  let code, assets, ended = false;
  const fail = (message) => { if (!ended) { ended = true; onError(message); } };
  const finish = () => {
    if (!ended && code && assets) { ended = true; onReady({ code, ...assets }); }
  };
  return {
    code(value) { if (!value) { fail('Conexão cancelada ou não autorizada.'); return; } code = value; finish(); },
    event(event) {
      const data = parseSignupEvent(event);
      if (!data || ended) return;
      if (data.event === 'CANCEL' || data.event === 'ERROR') { fail('O cadastro foi cancelado ou recusado pela Meta.'); return; }
      if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') { fail('Este painel ainda não suporta coexistência com o WhatsApp Business no celular. Use o cadastro Cloud API padrão.'); return; }
      if (!['FINISH', 'FINISH_ONLY_WABA'].includes(data.event)) return;
      const { waba_id, phone_number_id } = data.data || {};
      if (!/^[0-9]+$/.test(waba_id || '') || !/^[0-9]+$/.test(phone_number_id || '')) { fail('A Meta não retornou o número. Use uma configuração com cadastro completo de telefone.'); return; }
      assets = { waba_id, phone_number_id }; finish();
    },
    cancel() { ended = true; },
    fail,
  };
}
