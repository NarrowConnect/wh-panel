(function(){
  window.WHPanelWidget = {
    init: function(opts){
      opts = opts || {};
      var channelId = opts.channelId || opts.channel_id || '';
      var apiUrl = (opts.apiUrl || window.location.origin).replace(/\/$/,'');
      var color = opts.color || '#22c55e';
      var greeting = opts.greeting || 'Olá! Como podemos ajudar?';
      if(document.getElementById('wh-widget-root')) return;
      var root = document.createElement('div');
      root.id = 'wh-widget-root';
      root.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;font-family:Inter,system-ui,sans-serif;';
      document.body.appendChild(root);
      var btn = document.createElement('button');
      btn.innerHTML = '💬';
      btn.style.cssText = 'width:56px;height:56px;border-radius:9999px;background:'+color+';color:#fff;border:none;box-shadow:0 10px 25px rgba(0,0,0,.3);cursor:pointer;font-size:22px;';
      var panel = document.createElement('div');
      panel.style.cssText = 'display:none;width:340px;height:420px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;flex-direction:column;margin-bottom:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);';
      panel.innerHTML = '<div style="padding:12px;background:'+color+';color:#fff;font-weight:700;font-size:13px;">'+greeting+'</div><div id="wh-msglist" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;"></div><form id="wh-form" style="display:flex;gap:8px;padding:10px;border-top:1px solid #1e293b;background:#0f172a;"><input id="wh-input" placeholder="Digite sua mensagem..." style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:9999px;padding:8px 12px;color:#fff;font-size:13px;outline:none;"/><button style="background:'+color+';color:#fff;border:none;border-radius:9999px;padding:8px 14px;font-weight:700;cursor:pointer;">Enviar</button></form>';
      root.appendChild(panel);
      root.appendChild(btn);
      var open=false;
      btn.onclick=function(){open=!open; panel.style.display=open?'flex':'none';};
      var list=document.getElementById('wh-msglist');
      var input=document.getElementById('wh-input');
      var form=document.getElementById('wh-form');
      function addMsg(text, me){
        var b=document.createElement('div');
        b.textContent=text;
        b.style.cssText = me ? 'align-self:flex-end;background:'+color+';color:#fff;padding:8px 12px;border-radius:16px 16px 4px 16px;max-width:78%;font-size:13px;' : 'align-self:flex-start;background:#1e293b;color:#e2e8f0;padding:8px 12px;border-radius:16px 16px 16px 4px;max-width:78%;font-size:13px;';
        list.appendChild(b); list.scrollTop=list.scrollHeight;
      }
      form.onsubmit=function(e){
        e.preventDefault();
        var txt=input.value.trim();
        if(!txt) return;
        addMsg(txt,true);
        input.value='';
        // POST to generic webhook (best-effort)
        if(channelId){
          fetch(apiUrl + '/webhooks/webchat/' + channelId, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({phone: 'webchat_'+Date.now(), name: 'Visitante Webchat', body: txt, channel_type:'webchat'})
          }).catch(function(){});
        }
      };
      // expose
      window.WHPanelWidget.send = addMsg;
    }
  };
})();
