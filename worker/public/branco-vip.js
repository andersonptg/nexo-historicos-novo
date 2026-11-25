'use strict';
let state=null,assetId='';const $=id=>document.getElementById(id);const events=['attention','entry','green','red'];
function say(msg,error=false){const e=$('message');e.style.display='block';e.style.background=error?'#66303a':'#194735';e.textContent=msg;setTimeout(()=>e.style.display='none',6500)}
async function api(path,method='GET',data){const r=await fetch('/api/adm/branco-vip'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});let j;try{j=await r.json()}catch{throw Error('Resposta invalida do servidor')};if(!r.ok||j.ok!==true)throw Error(j.error||'HTTP '+r.status);return j}
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const template=(str,form)=>String(str||'').replace(/\{(hora|minuto|numero|janela|estrategia)\}/g,(_,k)=>form[k]);
const previewUrl=id=>'/api/adm/branco-vip/preview/'+encodeURIComponent(id);
function mediaHTML(m){let media=m.mime==='video/mp4'?`<video muted playsinline loop autoplay src="${previewUrl(m.id)}"></video>`:`<img loading="lazy" src="${previewUrl(m.id)}" alt="Prévia de ${esc(m.kind)}">`;return `<div class="asset" data-id="${esc(m.id)}">${media}<small>${esc(m.name)} · ${esc(m.kind)}</small></div>`}
function showTab(tab){for(const sec of document.querySelectorAll('[id^="tab-"]'))sec.classList.toggle('hidden',sec.id!=='tab-'+tab);for(const btn of document.querySelectorAll('[data-tab]'))btn.classList.toggle('active',btn.dataset.tab===tab)}
function render(){const d=state.config;$('enabled').checked=d.enabled;$('protection').checked=d.protection;$('offset').value=d.offset;$('houses4').value=d.houses4??4;$('houses11').value=d.houses11??4;$('status').textContent=d.enabled?'⚪ Branco habilitado':'⚪ Branco pausado';
 $('strategies').innerHTML=d.strategies.map((s,i)=>`<div class="strategy"><div class="row"><b>${i+1}. ${esc(s.name)}</b><input aria-label="Ativar ${esc(s.name)}" type="checkbox" class="strategyToggle" data-i="${i}" ${s.enabled?'checked':''}></div><p class="muted">${esc(s.description)}</p><small>Estratégia fixa • ${s.enabled?'ativa':'pausada'}</small></div>`).join('');
 const sc=state.scores||{};$('scores').innerHTML=d.strategies.map(s=>{let x=sc[s.id]||{};return `<div class="strategy"><b>${esc(s.name)}</b><p>✅ GREEN: <b>${x.green??0}</b> · ❌ RED: <b>${x.red??0}</b></p><p>🎯 ENTRADAS: ${x.entries??0}</p><p>ACERTO: ${x.accuracy==null?'—':x.accuracy+'%'}</p><small>${esc(x.day||'Sem resultados do dia')}</small></div>`}).join('');
 $('tokenStatus').textContent='Token: '+(state.tokenConfigured?'✅ Configurado':'⚠️ Não cadastrado')+' | ID privado: '+(state.ownerIdConfigured?'✅ Reutilizado':'⚠️ Não vinculado');
 $('groups').innerHTML=(state.groups||[]).map(g=>`<div class="row strategy"><span>${esc(g.name)} <small>${g.admin?'ADM confirmado':'Sem permissão ADM'}</small></span><input type="checkbox" class="groupToggle" data-id="${esc(g.id)}" ${g.selected?'checked':''} ${!g.admin?'disabled':''}></div>`).join('')||'<p>Nenhum grupo detectado pelo bot Branco.</p>';
 $('mediaList').innerHTML=(state.media||[]).map(mediaHTML).join('')||'<p class="muted">Nenhuma mídia capturada ainda.</p>';loadEvent();
}
function loadEvent(){const e=$('event').value,x=state.config.templates[e];$('template').value=x.text;$('mediaType').value=x.type;assetId=x.assetId||'';updatePreview();renderPicker()}
function updatePreview(){
 const e=$('event').value;
 if(e==='entry'){$('msgPreview').textContent='BLITZ PRO BRANCO\n     ▫️17:25▫️29\n(Principal 17:24–17:26 | Proteção 17:28–17:30)';return;}
 $('msgPreview').textContent=template($('template').value,{hora:'17',minuto:'25',numero:'29',janela:'17:24–17:26 e 17:28–17:30',estrategia:'Branco + vizinhos'});
}
function renderPicker(){const type=$('mediaType').value;const media=(state.media||[]).filter(m=>m.kind===type);$('mediaPicker').innerHTML=type==='text'?'':media.map(mediaHTML).join('')||'<span class="muted">Envie uma mídia desse tipo ao bot e toque Atualizar biblioteca.</span>';
 for(const e of $('mediaPicker').querySelectorAll('.asset')){e.classList.toggle('selected',e.dataset.id===assetId);e.onclick=()=>{assetId=e.dataset.id;for(const other of $('mediaPicker').querySelectorAll('.asset'))other.classList.toggle('selected',other===e)}}}
async function reload(){state=await api('');render()}
$('tabs').onclick=e=>{let el=e.target.closest('[data-tab]');if(el)showTab(el.dataset.tab)};
document.querySelectorAll('[data-go]').forEach(a=>a.onclick=e=>{e.preventDefault();showTab(a.dataset.go)});
$('saveStrategies').onclick=async()=>{try{const strategies=state.config.strategies.map((s,i)=>({...s,enabled:document.querySelector(`.strategyToggle[data-i="${i}"]`).checked}));const b={enabled:$('enabled').checked,protection:$('protection').checked,offset:Number($('offset').value),houses4:Number($('houses4').value),houses11:Number($('houses11').value),strategies};const r=await api('/config','POST',b);state.config=r.config;render();say('Estratégias e controle salvos no site. Termux aplicará após sincronizar.')}catch(e){say(e.message,true)}};
$('saveToken').onclick=async()=>{try{if(!$('token').value.trim())throw Error('Informe o token');const j=await api('/token','POST',{token:$('token').value.trim()});$('token').value='';await reload();say('Novo bot validado: @'+j.username)}catch(e){say(e.message,true)}};
$('saveGroups').onclick=async()=>{try{const selected=Array.from(document.querySelectorAll('.groupToggle:checked')).map(e=>e.dataset.id);await api('/groups','POST',{selected});await reload();say('Grupos autorizados salvos')}catch(e){say(e.message,true)}};
$('event').onchange=loadEvent;$('template').oninput=updatePreview;$('mediaType').onchange=()=>{assetId='';renderPicker()};
$('saveMsg').onclick=async()=>{try{const e=$('event').value,type=$('mediaType').value;if(type!=='text'&&!assetId)throw Error('Selecione uma mídia na prévia');const templates={...state.config.templates,[e]:{text:$('template').value,type,assetId:type==='text'?'':assetId}};const r=await api('/config','POST',{templates});state.config=r.config;render();say('Texto e mídia '+e.toUpperCase()+' salvos')}catch(e){say(e.message,true)}};
$('reloadMedia').onclick=async()=>{try{await reload();say('Biblioteca atualizada')}catch(e){say(e.message,true)}};
$('reloadScores').onclick=async()=>{try{await reload();say('Placares atualizados')}catch(e){say(e.message,true)}};
reload().catch(e=>{say(e.message,true);if(/401/.test(e.message))location.href='/adm.html'});

setInterval(()=>{if(!$('tab-score').classList.contains('hidden'))reload().catch(()=>{});},30000);
