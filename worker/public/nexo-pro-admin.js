/* NEXO PRO V13 - somente administrador autenticado */
(()=>{'use strict';
function setup(){const root=document.getElementById('page-geral');if(!root||document.getElementById('npro-admin-card'))return;
 const card=document.createElement('section');card.id='npro-admin-card';card.className='npro-adm-control';card.innerHTML=`<h2>🔗 Botão da plataforma no histórico</h2><p>Edite o texto e a URL pública. Somente o ADM pode salvar. Não inclui token nem dados privados no histórico.</p><label class="npro-switch"><input type="checkbox" id="npro-enable"> Exibir botão na página pública</label><label>Nome do botão<input id="npro-name" type="text" maxlength="55" placeholder="Acessar Blitz oficial"></label><label>Link da plataforma<input id="npro-url" type="url" maxlength="600" placeholder="https://..."></label><button type="button" id="npro-save">💾 Salvar link da plataforma</button><output id="npro-status" role="status"></output><p style="font-size:12px">Link externo abre em nova aba. Não é hospedado nem controlado pelo NEXO.</p>`;
 (root.querySelector('.pagehead')||root).after(card);
 const $=x=>document.getElementById(x);const status=$('npro-status');
 async function send(method,body){const r=await fetch('/api/adm/nexo-pro-public',{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json().catch(()=>({}));if(!r.ok||j.ok!==true)throw Error(j.error||'Falha HTTP '+r.status);return j;}
 send('GET').then(j=>{$('npro-enable').checked=j.enabled===true;$('npro-name').value=j.name||'';$('npro-url').value=j.url||'';}).catch(e=>status.textContent='Não foi possível carregar: '+e.message);
 $('npro-save').onclick=async()=>{const name=$('npro-name').value.trim(),url=$('npro-url').value.trim(),enabled=$('npro-enable').checked;status.textContent='Salvando...';try{await send('POST',{enabled,name,url});status.textContent='✓ Link salvo no R2. Atualize o histórico para conferir.';}catch(e){status.textContent='Erro: '+e.message;}};
 const floated=document.querySelectorAll('.n12-float-nav,.v11-adm-history');if(floated.length>1)floated.forEach((el,i)=>{if(i>0)el.remove()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
