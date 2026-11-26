'use strict';
// NEXO_BRANCO_PUXAR_V6 - no token in the browser.
(()=>{
 const mediaTab=document.querySelector('#tab-media');if(!mediaTab)return;
 const section=document.createElement('div');section.className='strategy';
 section.innerHTML='<h3>⚪ Puxar figurinhas do bot Branco</h3><p>Envie ou encaminhe stickers/GIFs ao <b>@CLTLP_BOT</b>. O Termux recebe e salva no R2 exclusivo do Branco. A consulta nao acessa historico antigo ja consumido.</p><button type="button" id="brancoPullButton">Puxar do bot Branco</button> <button type="button" id="brancoPullRefresh">Atualizar capturas</button><p id="brancoPullState" aria-live="polite">Consultando...</p>';
 mediaTab.insertBefore(section,mediaTab.firstChild?.nextSibling||null);
 const state=document.getElementById('brancoPullState'),btn=document.getElementById('brancoPullButton');
 const api=async(method)=>{const r=await fetch('/api/adm/branco-vip/pull',{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'}});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'HTTP '+r.status);return j;};
 async function refresh(){try{const j=await api('GET'),age=j.report?.at?Math.max(0,Math.floor(Date.now()/1000)-j.report.at):null;state.textContent='Biblioteca: '+j.mediaCount+' mídia(s). '+(age===null?'Sem confirmação recente do Termux.':'Motor: '+(age<90?'consultando Telegram':'sem confirmação recente')+' · há '+age+' segundos.')+' '+(j.report?.detail||'');}catch(e){state.textContent='Falha na consulta: '+e.message;}}
 btn.onclick=async()=>{btn.disabled=true;state.textContent='Solicitando consulta ao Termux...';try{await api('POST');state.textContent='Pedido salvo. O Termux consulta as mensagens disponíveis; toque em Atualizar capturas.';await refresh();}catch(e){state.textContent='Erro: '+e.message}finally{btn.disabled=false}};
 document.getElementById('brancoPullRefresh').onclick=refresh;
 refresh();
})();
