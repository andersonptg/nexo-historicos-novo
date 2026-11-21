/* NEXO Históricos V6: página independente por jogo. Não usa DOM do Double nem envia Telegram. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const TZ='America/Sao_Paulo';
const DEFAULT_GAME='blitz-double';
const fallbackGames=[
 {id:'blitz-double',platform:'Blitz',game:'Double',kind:'double',eligible:true},
 {id:'blitz-crash',platform:'Blitz',game:'Crash',kind:'multiplier',eligible:true}
];
let games=[],active=null,records=[],status={},source='',updatedAt=0,loading=false,menuOpen=false,refreshTimer=null,loadingController=null,lastFingerprint='';
let filter='all';
const params=new URLSearchParams(location.search);
const requested=params.get('jogo')||DEFAULT_GAME;
function byId(id){return games.find(g=>g.id===id);}
function whenTime(epoch,full=false){
 if(!epoch||!Number.isFinite(Number(epoch)))return '—';
 const n=Number(epoch)>1e11?Number(epoch):Number(epoch)*1000;
 if(!Number.isFinite(n))return '—';
 try{return new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,...(full?{day:'2-digit',month:'2-digit',year:'numeric'}:{}),hour:'2-digit',minute:'2-digit'}).format(new Date(n))}catch{return '—'}
}
function clock(){ $('nx6-clock').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());}
function notice(msg,tone='info'){$('nx6-notice').hidden=!msg;$('nx6-notice').textContent=msg;$('nx6-notice').dataset.tone=tone;}
async function fetchJson(path,signal){
 const res=await fetch(path,{cache:'no-store',signal,headers:{'Accept':'application/json'}});
 const contentType=res.headers.get('content-type')||'';
 if(!contentType.includes('json'))throw Error('Resposta inesperada da API ('+res.status+')');
 const json=await res.json();
 if(!res.ok||json?.ok===false)throw Error(String(json?.error||'HTTP '+res.status).slice(0,150));
 return json;
}
async function loadCatalog(){
 try{
  const d=await fetchJson('/api/cloud/catalog');
  if(!Array.isArray(d.games)||!d.games.length)throw Error('Catálogo vazio');
  games=d.games.filter(g=>g&&typeof g.id==='string'&&g.id.length<100&&typeof g.platform==='string'&&typeof g.game==='string');
 }catch(error){
  console.warn('Cloud V5 catálogo indisponível:',String(error.message).slice(0,120));
  games=[...fallbackGames];
  try{const d=await fetchJson('/api/catalog');for(const g of d.games||[])if(g.enabled&&!byId(g.id))games.push({...g,eligible:true,kind:'double'});}catch{}
  notice('O catálogo completo está temporariamente indisponível. Exibindo os jogos conhecidos.','warn');
 }
 if(!byId('blitz-double'))games.unshift(fallbackGames[0]);
 if(!byId('blitz-crash'))games.push(fallbackGames[1]);
 const chosen=byId(requested);
 active=chosen||byId(DEFAULT_GAME)||games[0];
 updateContext();populateQuickSelect();renderNav();
}
function updateContext(){
 const name=active.platform+' · '+active.game;
 document.body.classList.toggle('nx6-crash-visual',active.kind==='multiplier' && /crash/i.test(active.game));
 document.body.classList.toggle('nx6-fortune-view',active.kind==='fortune-double');
 document.title=name+' — NEXO Históricos';
 $('nx6-title').textContent=name;
 $('nx6-section-title').textContent=active.game==='Double'?'Pedras recentes':active.kind==='multiplier'?'Multiplicadores recentes':active.kind==='fortune-double'?'Cores e Panda recentes':'Rodadas recentes';
 $('nx6-crumb').textContent=active.platform.toUpperCase()+' / '+active.game.toUpperCase();
 $('nx6-description').textContent='Histórico exclusivo de '+name+'. Sem misturar resultados ou estratégias de outros jogos.';
 $('nx6-filter').replaceChildren();
 const options=active.kind==='double'?[['all','Todas as cores'],['red','Laranjas (1–7)'],['black','Pretos (8–14)'],['white','Brancos (0)']]:
 active.kind==='multiplier'?[['all','Todos os multiplicadores'],['2','≥ 2x'],['5','≥ 5x'],['10','≥ 10x'],['20','≥ 20x'],['50','≥ 50x'],['100','≥ 100x']]:active.kind==='fortune-double'?[['all','Todas as cores'],['red','Vermelho'],['purple','Roxo'],['gold','Dourado · Panda']]:[['all','Todos os resultados']];
 for(const [value,label] of options){const o=document.createElement('option');o.value=value;o.textContent=label;$('nx6-filter').append(o);}
 filter='all';
}
function populateQuickSelect(){
 const s=$('nx6-game');s.replaceChildren();
 const grouped=new Map();for(const game of games){if(!grouped.has(game.platform))grouped.set(game.platform,[]);grouped.get(game.platform).push(game);}
 for(const [platform,part] of grouped){const optgroup=document.createElement('optgroup');optgroup.label=platform;for(const g of part){const opt=document.createElement('option');opt.value=g.id;opt.textContent=g.game;optgroup.append(opt);}s.append(optgroup);}
 s.value=active.id;
}
function navigate(id){if(!byId(id))return;window.location.assign('/historicos.html?jogo='+encodeURIComponent(id));}
function openMenu(){if(menuOpen)return;menuOpen=true;$('nx6-drawer').hidden=false;$('nx6-backdrop').hidden=false;$('nx6-drawer').setAttribute('aria-hidden','false');$('nx6-menu-open').setAttribute('aria-expanded','true');document.body.style.overflow='hidden';$('nx6-search').focus();}
function closeMenu(){if(!menuOpen)return;menuOpen=false;$('nx6-drawer').hidden=true;$('nx6-backdrop').hidden=true;$('nx6-drawer').setAttribute('aria-hidden','true');$('nx6-menu-open').setAttribute('aria-expanded','false');document.body.style.overflow='';$('nx6-menu-open').focus();}
function renderNav(){
 const root=$('nx6-nav'),search=$('nx6-search').value.trim().toLocaleLowerCase('pt-BR');
 root.replaceChildren();const grouped=new Map();
 for(const g of games){if(search&&!(g.platform+' '+g.game).toLocaleLowerCase('pt-BR').includes(search))continue;if(!grouped.has(g.platform))grouped.set(g.platform,[]);grouped.get(g.platform).push(g);}
 if(!grouped.size){const msg=document.createElement('div');msg.className='nx6-menu-wait';msg.textContent='Nenhum jogo encontrado.';root.append(msg);}
 for(const [platform,part] of grouped){
  const d=document.createElement('details');d.className='nx6-platform';d.open=!!search||part.some(g=>g.id===active.id);
  const summary=document.createElement('summary');const name=document.createElement('span');name.textContent=platform;const counter=document.createElement('small');counter.textContent=part.length+' jogo(s)';summary.append(name,counter);d.append(summary);
  for(const g of part){const link=document.createElement('a');link.className='nx6-game-link';link.href='/historicos.html?jogo='+encodeURIComponent(g.id);if(g.id===active.id)link.setAttribute('aria-current','page');const label=document.createElement('span');label.textContent=g.game;const hint=document.createElement('small');hint.textContent=g.eligible===false?'Pendente':g.status==='atualizado'?'Coleta validada':'Consultar';link.append(label,hint);d.append(link);}
  root.append(d);
 }
 $('nx6-drawer-count').textContent=games.length+' jogos · '+new Set(games.map(g=>g.platform)).size+' plataformas';
}
function rowsValid(list,kind){
 if(!Array.isArray(list))return [];
 return list.filter(row=>row&&Number.isFinite(Number(row.minute_epoch))&&Number(row.minute_epoch)>0&&(
  kind==='double'?(Number.isInteger(Number(row.number))&&Number(row.number)>=0&&Number(row.number)<=14):
  kind==='multiplier'?(Number.isFinite(Number(row.multiplier))&&Number(row.multiplier)>=1):kind==='fortune-double'?(['red','purple','gold'].includes(row.color)&&(row.multiplier==null||row.color==='gold'&&Number.isFinite(Number(row.multiplier))&&Number(row.multiplier)>=1)):false
 )).slice(0,200);
}
function bestHistory(a,b){
 const sa=Array.isArray(a.items)?a.items:[],sb=Array.isArray(b.items)?b.items:[];
 const ta=Number(sa[0]?.minute_epoch)||0,tb=Number(sb[0]?.minute_epoch)||0;
 // Prefer fresher observed round, then fuller batch, then recent write.
 if(ta!==tb)return ta>tb?a:b;
 if(sa.length!==sb.length)return sa.length>sb.length?a:b;
 return (Number(a.updated_at)||0)>=(Number(b.updated_at)||0)?a:b;
}
async function getHistory(signal){
 if(active.id==='blitz-double'){
  const d=await fetchJson('/api/history?game_id=blitz-double&limit=200',signal);
  return {...d,source_label:'Arquivo Double · R2'};
 }
 const cloudPath='/api/cloud/history?game_id='+encodeURIComponent(active.id)+'&limit=200';
 if(active.id==='blitz-crash'){
  // Legacy sync and new Cloud engine store in different R2 prefixes.
  // Preserve all confirmed Crash rounds during transition.
  const settled=await Promise.allSettled([
   fetchJson('/api/crash/history?limit=200',signal),
   fetchJson(cloudPath,signal)
  ]);
  const legacy=settled[0].status==='fulfilled'?settled[0].value:null;
  const cloud=settled[1].status==='fulfilled'?settled[1].value:null;
  if(!legacy&&!cloud)throw Error('As duas rotas de histórico Crash estão indisponíveis');
  const picked=legacy&&cloud?bestHistory(legacy,cloud):legacy||cloud;
  return {...picked,source_label:picked===legacy?'Crash sincronizado · R2':'Crash Cloud · R2'};
 }
 const d=await fetchJson(cloudPath,signal);
 return {...d,source_label:'Histórico Cloud · R2'};
}
function formatValue(x){return active.kind==='double'?String(x.number):active.kind==='fortune-double'?(x.color==='red'?'Vermelho':x.color==='purple'?'Roxo':x.multiplier==null?'Panda':Number(x.multiplier).toFixed(2)+'x · Panda'):Number(x.multiplier).toFixed(2)+'x';}
function rowClass(x){
 if(active.kind==='fortune-double')return 'nx6-fortune-'+x.color;
 if(active.kind==='double')return x.number===0?'nx6-white':x.number<=7?'nx6-red':'nx6-black';
 const n=Number(x.multiplier);return n>=50?'nx6-c4':n>=10?'nx6-c3':n>=2?'nx6-c2':n>=1.2?'nx6-c1':'nx6-c0';
}
function filterRows(){return records.filter(row=>active.kind==='fortune-double'?(filter==='all'||row.color===filter):active.kind==='double'?(filter==='all'||(row.color||(row.number===0?'white':row.number<=7?'red':'black'))===filter):(filter==='all'||Number(row.multiplier)>=Number(filter)));}
function showRows(){
 const list=filterRows();$('nx6-visible').textContent=list.length+' VISÍVEIS';
 const finger=[active.id,filter,records.length,records[0]?.seq,records[0]?.minute_epoch,updatedAt].join('|');
 if(finger===lastFingerprint)return;lastFingerprint=finger;
 const grid=$('nx6-grid');grid.replaceChildren();
 if(!list.length){const p=document.createElement('p');p.className='nx6-empty';p.textContent=records.length?'Nenhum resultado corresponde ao filtro selecionado.':active.eligible===false?'Este jogo está cadastrado, mas ainda não possui leitor homologado nem rodadas confirmadas.':'Ainda não há rodadas confirmadas deste jogo no R2.';grid.append(p);return;}
 const frag=document.createDocumentFragment();
 for(const x of list){
  const box=document.createElement('div');box.className='nx6-item';
  const tile=document.createElement('div');tile.className='nx6-tile '+rowClass(x)+(active.kind==='double'?' nx6-double':'');
  const bold=document.createElement('b');bold.textContent=active.kind==='fortune-double'?(x.color==='red'?'🔴':x.color==='purple'?'🟣':x.multiplier==null?'🐼':Number(x.multiplier).toFixed(2)+'x'):active.kind==='double'&&Number(x.number)===0?'':formatValue(x);tile.append(bold);
  const timestamp=document.createElement('small');timestamp.className='nx6-time';timestamp.textContent=whenTime(x.minute_epoch);
  box.append(tile,timestamp);
  if(Number.isFinite(Number(x.seq))&&Number(x.seq)>0){const seq=document.createElement('small');seq.className='nx6-seq';seq.textContent='#'+x.seq;box.append(seq);}
  box.title=formatValue(x)+' · '+whenTime(x.minute_epoch,true)+' · sequência interna '+(x.seq||'não informada');frag.append(box);
 }
 grid.append(frag);
}
function showStats(){
 $('nx6-count').textContent=records.length;
 $('nx6-latest').textContent=records.length?formatValue(records[0]):'—';
 $('nx6-updated').textContent=records.length?whenTime(records[0].minute_epoch):'—';
 const age=records[0]?Math.floor(Date.now()/1000)-Number(records[0].minute_epoch):Infinity;
 const cloudStatus=status.status||active.status||'aguardando_validacao';
 const isRecent=age>=-120&&age<300;
 $('nx6-state').textContent=!records.length?(active.eligible===false?'Sem leitor':'Sem resultados'):isRecent?'Recentes':age>3600?'Atrasado':'Arquivado';
 $('nx6-source').textContent=records.length?'Histórico confirmado em R2 · '+source:'Aguardando dados reais da fonte';
 $('nx6-origin').textContent=source+' · Estado do coletor Cloud: '+cloudStatus;
 if(records.length){
  if(!isRecent)notice('Última rodada registrada às '+whenTime(records[0].minute_epoch,true)+'. A origem pode estar atrasada; nenhum resultado foi inventado.','warn');
  else if(cloudStatus==='aguardando_validacao')notice('Histórico disponível no R2. A coleta automática na nuvem ainda não foi validada.','info');
  else notice('Histórico carregado. Mostrando apenas rodadas observadas.','success');
 }else if(active.eligible===false)notice('Coleta ainda não implementada para este jogo. O jogo está no catálogo, mas não está ativo como fonte de dados.','warn');
 else notice('Nenhuma rodada salva para este jogo. Confira a fonte no ADM do motor Cloud V5.','warn');
}
async function loadHistory(){
 if(loading||!active)return;
 loading=true;const ac=new AbortController();loadingController=ac;
 $('nx6-refresh').disabled=true;
 if(!records.length)notice('Buscando rodadas confirmadas do jogo selecionado...');
 try{
  const d=await getHistory(ac.signal);
  records=rowsValid(d.items||[],active.kind);
  status=d.status||{};
  source=d.source_label||'R2';
  updatedAt=Number(d.updated_at)||0;
  lastFingerprint='';showStats();showRows();
 }catch(error){
  if(error.name==='AbortError')return;
  console.warn('Histórico indisponível:',error.message);
  if(!records.length){status={status:'erro'};showStats();showRows();}
  notice('Falha ao atualizar: '+String(error.message).slice(0,130)+'. O histórico existente foi preservado.','warn');
 }finally{loading=false;loadingController=null;$('nx6-refresh').disabled=false;}
}
function setup(){
 $('nx6-menu-open').onclick=openMenu;$('nx6-choose').onclick=openMenu;$('nx6-menu-close').onclick=closeMenu;$('nx6-backdrop').onclick=closeMenu;
 $('nx6-search').addEventListener('input',renderNav);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menuOpen)closeMenu();});
 $('nx6-game').addEventListener('change',e=>navigate(e.target.value));
 $('nx6-filter').addEventListener('change',e=>{filter=e.target.value;lastFingerprint='';showRows();});
 $('nx6-reset').onclick=()=>{filter='all';$('nx6-filter').value='all';lastFingerprint='';showRows();};
 $('nx6-refresh').onclick=()=>void loadHistory();
 clock();setInterval(clock,1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void loadHistory();});
 window.addEventListener('online',()=>void loadHistory());
 refreshTimer=setInterval(()=>{if(!document.hidden&&!menuOpen)void loadHistory();},12000);
}
setup();void loadCatalog().then(loadHistory);
})();
