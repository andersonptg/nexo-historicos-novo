'use strict';
let state=null,assetId='',sharedMedia=[]; // NEXO_BIBLIOTECA_CENTRAL_V7const $=id=>document.getElementById(id);const events=['attention','entry','green','red'];
function say(msg,error=false){const e=$('message');e.style.display='block';e.style.background=error?'#66303a':'#194735';e.textContent=msg;setTimeout(()=>e.style.display='none',6500)}
async function api(path,method='GET',data){const r=await fetch('/api/adm/branco-vip'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});let j;try{j=await r.json()}catch{throw Error('Resposta invalida do servidor')};if(!r.ok||j.ok!==true)throw Error(j.error||'HTTP '+r.status);return j}
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const template=(str,form)=>String(str||'').replace(/\{(hora|minuto|numero|janela|estrategia)\}/g,(_,k)=>form[k]);
const previewUrl=id=>'/api/adm/branco-vip/preview/'+encodeURIComponent(id);
const sharedPreviewUrl=id=>'/api/adm/media/'+encodeURIComponent(id);
async function pullColorsCatalog(){const r=await fetch('/api/adm/media',{credentials:'same-origin',cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Biblioteca Cores indisponivel');sharedMedia=(j.items||[]).filter(m=>['sticker','gif'].includes(m.kind));return sharedMedia}

function mediaHTML(m){let media=m.mime==='video/mp4'?`<video muted playsinline loop autoplay src="${previewUrl(m.id)}"></video>`:`<img loading="lazy" src="${previewUrl(m.id)}" alt="Prévia de ${esc(m.kind)}">`;return `<div class="asset" data-id="${esc(m.id)}">${media}<small>${esc(m.name)} · ${esc(m.kind)}</small></div>`}
function showTab(tab){for(const sec of document.querySelectorAll('[id^="tab-"]'))sec.classList.toggle('hidden',sec.id!=='tab-'+tab);for(const btn of document.querySelectorAll('[data-tab]'))btn.classList.toggle('active',btn.dataset.tab===tab)}
function render(){const d=state.config;$('enabled').checked=d.enabled;$('protection').checked=d.protection;$('offset').value=d.offset;$('houses4').value=d.houses4??4;$('houses11').value=d.houses11??4;$('status').textContent=d.enabled?'⚪ Branco habilitado':'⚪ Branco pausado';$('captureEnabled').checked=d.captureEnabled===true;const hb=state.captureHeartbeat;const age=hb?Math.floor(Date.now()/1000)-Number(hb.at||0):Infinity;$('captureState').textContent=(d.captureEnabled?'✅ Captura autorizada':'⏸ Captura desligada')+' · Observador '+(hb&&hb.running&&age<120?'online':'não confirmado')+(hb?.last?' · Última: '+hb.last:'');
 $('strategies').innerHTML=d.strategies.map((s,i)=>`<div class="strategy"><div class="row"><b>${i+1}. ${esc(s.name)}</b><input aria-label="Ativar ${esc(s.name)}" type="checkbox" class="strategyToggle" data-i="${i}" ${s.enabled?'checked':''}></div><p class="muted">${esc(s.description)}</p><small>Estratégia fixa • ${s.enabled?'ativa':'pausada'}</small></div>`).join('');
 const sc=state.scores||{};$('scores').innerHTML=d.strategies.map(s=>{let x=sc[s.id]||{};return `<div class="strategy"><b>${esc(s.name)}</b><p>✅ GREEN: <b>${x.green??0}</b> · ❌ RED: <b>${x.red??0}</b></p><p>🎯 ENTRADAS: ${x.entries??0}</p><p>ACERTO: ${x.accuracy==null?'—':x.accuracy+'%'}</p><small>${esc(x.day||'Sem resultados do dia')}</small></div>`}).join('');
 $('tokenStatus').textContent='Token: '+(state.tokenConfigured?'✅ Configurado':'⚠️ Não cadastrado')+' | ID privado: '+(state.ownerIdConfigured?'✅ Reutilizado':'⚠️ Não vinculado');
 $('groups').innerHTML=(state.groups||[]).map(g=>`<div class="row strategy"><span>${esc(g.name)} <small>${g.admin?'ADM confirmado':'Sem permissão ADM'}</small></span><input type="checkbox" class="groupToggle" data-id="${esc(g.id)}" ${g.selected?'checked':''} ${!g.admin?'disabled':''}></div>`).join('')||'<p>Nenhum grupo detectado pelo bot Branco.</p>';
 $('mediaList').innerHTML=(state.media||[]).map(mediaHTML).join('')||'<p class="muted">Nenhuma mídia capturada ainda.</p>';loadEvent();
}
function loadEvent(){const e=$('event').value,x=state.config.templates[e];$('template').value=x.text;$('mediaType').value=x.type;assetId=x.assetId||'';updatePreview();renderPicker()}
function updatePreview(){
 if($('mediaType').value!=='text'){$('msgPreview').textContent='Somente figurinha/GIF escolhido na biblioteca; nenhum texto sera enviado.';return;}
 const e=$('event').value;
 if(e==='entry'){$('msgPreview').textContent='BLITZ PRO BRANCO\n     ▫️17:25▫️29\n(Principal 17:24–17:26 | Proteção 17:28–17:30)';return;}
 $('msgPreview').textContent=template($('template').value,{hora:'17',minuto:'25',numero:'29',janela:'17:24–17:26 e 17:28–17:30',estrategia:'Branco + vizinhos'});
}
function renderPicker(){
 const type=$('mediaType').value;
 if(type==='text'){$('mediaPicker').innerHTML='<p class="muted">Somente TEXTO: nenhuma figurinha sera enviada.</p>';return;}
 const local=(state.media||[]).filter(m=>m.kind===type).map(m=>({...m,source:'white'}));
 const shared=(sharedMedia||[]).filter(m=>m.kind===type).map(m=>({...m,source:'colors'}));
 const card=m=>{const id=m.source==='colors'?'cores:'+m.id:m.id;const url=m.source==='colors'?sharedPreviewUrl(m.id):previewUrl(m.id);const visual=m.mime==='video/mp4'?`<video muted playsinline loop autoplay src="${url}"></video>`:`<img loading="lazy" src="${url}" alt="Sticker ${esc(m.name)}">`;
 return `<div class="asset" data-id="${esc(id)}">${visual}<small>${esc(m.name)} · ${m.source==='colors'?'Biblioteca central':'Branco VIP'}</small></div>`};
 $('mediaPicker').innerHTML='<h3>Biblioteca central das Cores · '+shared.length+' mídias</h3>'+shared.map(card).join('')+'<h3>Já vinculadas ao Branco · '+local.length+'</h3>'+local.map(card).join('')||'<span class="muted">Envie figurinhas ao bot Cores e atualize a biblioteca.</span>';
 for(const e of $('mediaPicker').querySelectorAll('.asset')){e.classList.toggle('selected',e.dataset.id===assetId);e.onclick=()=>{assetId=e.dataset.id;for(const other of $('mediaPicker').querySelectorAll('.asset'))other.classList.toggle('selected',other===e)}}
}

async function reload(){const results=await Promise.allSettled([api(''),pullColorsCatalog()]);if(results[0].status==='rejected')throw results[0].reason;state=results[0].value;render();if(results[1].status==='rejected')say('Biblioteca central indisponivel: '+results[1].reason.message,true)}
$('tabs').onclick=e=>{let el=e.target.closest('[data-tab]');if(el)showTab(el.dataset.tab)};
document.querySelectorAll('[data-go]').forEach(a=>a.onclick=e=>{e.preventDefault();showTab(a.dataset.go)});
$('saveCapture').onclick=async()=>{try{const active=$('captureEnabled').checked;const r=await api('/config','POST',{captureEnabled:active});state.config=r.config;render();say(active?'Captura do Branco ativada':'Captura do Branco desativada')}catch(e){say(e.message,true)}};
$('reloadCapture').onclick=async()=>{try{await reload();say('Situação da captura atualizada')}catch(e){say(e.message,true)}};
$('saveStrategies').onclick=async()=>{try{const strategies=state.config.strategies.map((s,i)=>({...s,enabled:document.querySelector(`.strategyToggle[data-i="${i}"]`).checked}));const b={enabled:$('enabled').checked,protection:$('protection').checked,offset:Number($('offset').value),houses4:Number($('houses4').value),houses11:Number($('houses11').value),strategies};const r=await api('/config','POST',b);state.config=r.config;render();say('Estratégias e controle salvos no site. Termux aplicará após sincronizar.')}catch(e){say(e.message,true)}};
$('saveToken').onclick=async()=>{try{if(!$('token').value.trim())throw Error('Informe o token');const j=await api('/token','POST',{token:$('token').value.trim()});$('token').value='';await reload();say('Novo bot validado: @'+j.username)}catch(e){say(e.message,true)}};
$('saveGroups').onclick=async()=>{try{const selected=Array.from(document.querySelectorAll('.groupToggle:checked')).map(e=>e.dataset.id);await api('/groups','POST',{selected});await reload();say('Grupos autorizados salvos')}catch(e){say(e.message,true)}};
$('event').onchange=loadEvent;$('template').oninput=updatePreview;$('mediaType').onchange=()=>{assetId='';renderPicker();updatePreview()};
$('saveMsg').onclick=async()=>{try{
 const e=$('event').value,type=$('mediaType').value;
 if(type!=='text'&&!assetId)throw Error('Escolha uma figurinha ou GIF da biblioteca.');
 let selected=assetId;
 if(type!=='text'&&selected.startsWith('cores:')){
  say('Vinculando a figurinha da biblioteca central ao bot Branco...');
  const id=selected.slice(6);
  const r=await fetch('/api/adm/shared-media/for-branco',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||'Falha ao vincular ao bot Branco');
  selected=j.id;
  const draft=$('template').value;await reload();$('template').value=draft;
 }
 const templates={...state.config.templates,[e]:{text:type==='text'?$('template').value:'',type,assetId:type==='text'?'':selected}};
 const r=await api('/config','POST',{templates});state.config=r.config;assetId=selected;render();say('Evento '+e.toUpperCase()+' salvo como '+(type==='text'?'TEXTO':'MIDIA')+' (nunca os dois).');
 }catch(err){say(err.message,true)}}; // NEXO_BIBLIOTECA_CENTRAL_V7

$('reloadMedia').onclick=async()=>{try{await reload();say('Biblioteca atualizada')}catch(e){say(e.message,true)}};
$('reloadScores').onclick=async()=>{try{await reload();say('Placares atualizados')}catch(e){say(e.message,true)}};
reload().catch(e=>{say(e.message,true);if(/401/.test(e.message))location.href='/adm.html'});

setInterval(()=>{if(!$('tab-score').classList.contains('hidden'))reload().catch(()=>{});},30000);
