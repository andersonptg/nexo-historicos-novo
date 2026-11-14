const $=id=>document.getElementById(id);
const TZ='America/Sao_Paulo';
let refreshing=false,loadingMore=false,archiveTotal=0,archiveDays=[],items=[],games=[],activeId='brabet-double';
const qs={number:'all',color:'all',day:''};
const shortDay=(s)=>{try{const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}catch{return s}};
const localeTime=(seconds)=>seconds?new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(new Date(seconds*1000)):'—';
const localeDate=(seconds)=>seconds?new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(seconds*1000)):'—';
const dayBR=seconds=>seconds?new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000)):'-';
const percent=(n,total)=>total?(100*n/total).toFixed(1).replace('.',',')+'%':'0%';
async function get(path){const res=await fetch(path,{cache:'no-store'});const x=await res.json();if(!res.ok)throw Error(x.error||'Falha HTTP '+res.status);return x}
function showStatus(text,ok=false){$('top-status').classList.toggle('ok',ok);$('top-status').innerHTML='';const d=document.createElement('i');$('top-status').append(d,document.createTextNode(text));$('side-led')?.classList.toggle('ok',ok);if($('side-status'))$('side-status').textContent=text}
function counts(){const a={red:0,black:0,white:0};for(const x of items)if(x.color in a)a[x.color]++;$('stat-total').textContent=items.length;for(const k of ['red','black','white']){$('stat-'+k).textContent=a[k];$('stat-'+k+'-pct').textContent=percent(a[k],items.length)+' da amostra';}}
function render(){counts();const more=$('load-more-box');if(more){more.hidden=!qs.day||items.length>=archiveTotal;$('load-more-hint').textContent=`${items.length} de ${archiveTotal} rodadas carregadas`;}$('rows-badge').textContent=qs.day?archiveTotal+' NO DIA':items.length+' REGISTROS';const filtered=items.filter(x=>(qs.color==='all'||x.color===qs.color)&&(qs.number==='all'||String(x.number)===qs.number)&&(!qs.day||dayBR(x.minute_epoch)===qs.day));$('filter-count').textContent=filtered.length+' VISÍVEIS';const host=$('balls');host.replaceChildren();if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=items.length?'Nenhuma rodada corresponde aos filtros.':'Sem resultados ainda. Inicie o motor no Termux para preencher o histórico.';host.append(empty);return;}const frag=document.createDocumentFragment();for(const item of filtered){const cell=document.createElement('div');cell.className='stone '+item.color;const ball=document.createElement('span');ball.className='circle';ball.textContent=item.number;const label=document.createElement('small');label.textContent=localeTime(item.minute_epoch);cell.append(ball,label);cell.title='Número '+item.number+' · '+localeDate(item.minute_epoch);frag.append(cell);}host.append(frag)}
async function loadCatalog(){try{const d=await get('/api/catalog');games=(d.games||[]).filter(x=>x.enabled);const select=$('game');select.replaceChildren();for(const game of games){const option=document.createElement('option');option.value=game.id;option.textContent=game.platform+' · '+game.game;select.append(option);}if(games.length){if(!games.some(g=>g.id===activeId))activeId=games[0].id;select.value=activeId;}}catch(e){console.warn('Catalogo indisponivel:',e.message)}}
async function refresh(){if(refreshing)return;refreshing=true;const current=activeId;const date=qs.day;const url='/api/history?game_id='+encodeURIComponent(current)+'&limit=500'+(date?'&day='+encodeURIComponent(date):'');try{const [h,s]=await Promise.all([get(url),get('/api/status')]);if(current!==activeId||date!==qs.day)return;items=h.items||[];archiveTotal=Number(h.total)||items.length;const localPreview=s.motor==='termux';const remoteGame=(s.games||[]).find(x=>x.id===current);let last=remoteGame?.status?.last_ingest||remoteGame?.state?.last_success||null;const beat=remoteGame?.status?.last_heartbeat||remoteGame?.state?.last_success||last;const alive=!!beat&&Math.abs(Date.now()/1000-beat)<75;showStatus(alive?'Coleta recente':'Motor sem atualização',alive);$('engine-note').textContent=localPreview?((remoteGame?.state?.message||'Aguardando primeira coleta')+' · '+(remoteGame?.pending_sync??0)+' registros aguardando R2'):(last?'Última sincronização no R2: '+localeDate(last):'Ainda sem dados recebidos pelo R2.');$('result-title').textContent=date?'Arquivo de '+shortDay(date):'Rodadas recentes';$('source-note').textContent='Origem: histórico público do '+(games.find(x=>x.id===activeId)?.platform||'Brabet')+' · atualização '+(last?localeDate(last):'pendente');$('view-updated').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());render();}catch(e){showStatus('Indisponível');$('engine-note').textContent='Falha de comunicação: '+e.message;$('source-note').textContent=e.message;render()}finally{refreshing=false}}

async function loadMore(){
 if(loadingMore||!qs.day||items.length>=archiveTotal)return;
 loadingMore=true;const id=activeId,day=qs.day;
 try{
  const h=await get('/api/history?game_id='+encodeURIComponent(id)+'&day='+encodeURIComponent(day)+'&limit=500&offset='+items.length);
  if(id!==activeId||day!==qs.day)return;
  const seen=new Set(items.map(x=>x.id));
  items=[...items,...(h.items||[]).filter(x=>!seen.has(x.id))];
  archiveTotal=Number(h.total)||items.length;
  render();
 }catch(e){$('load-more-hint').textContent='Falha ao carregar mais: '+e.message}
 finally{loadingMore=false}
}

async function loadDays(){
 try{
  const d=await get('/api/days?game_id='+encodeURIComponent(activeId));
  archiveDays=d.days||[];
  const root=$('archive-days');root.replaceChildren();
  if(!archiveDays.length){
   const e=document.createElement('span');e.className='small-note';e.textContent='Arquivo aguardando as primeiras rodadas.';root.append(e);
  }
  for(const day of archiveDays){
   const b=document.createElement('button');b.type='button';b.className='archive-day'+(qs.day===day?' selected':'');
   b.textContent=shortDay(day);b.onclick=()=>{qs.day=day;$('day').value=day;void refresh();void loadDays();document.getElementById('resultados').scrollIntoView({behavior:'smooth'})};
   root.append(b);
  }
  $('archive-status').textContent=archiveDays.length+' data(s) disponível(is) · Horário de Brasília';
 }catch(e){$('archive-status').textContent='Arquivo indisponível: '+e.message}
}

function init(){const number=$('number');for(let i=0;i<=14;i++){const o=document.createElement('option');o.value=String(i);o.textContent=String(i);number.append(o)}$('color').onchange=e=>{qs.color=e.target.value;render()};number.onchange=e=>{qs.number=e.target.value;render()};$('day').onchange=e=>{qs.day=e.target.value;void refresh();void loadDays()};$('game').onchange=e=>{activeId=e.target.value;items=[];qs.day='';$('day').value='';void refresh();void loadDays()};$('clear').onclick=()=>{qs.color='all';qs.number='all';qs.day='';$('color').value='all';$('number').value='all';$('day').value='';void refresh()};$('refresh').onclick=()=>{void refresh();void loadDays()};$('load-more').onclick=()=>void loadMore();$('archive-today').onclick=()=>{qs.day='';$('day').value='';void refresh();void loadDays();document.getElementById('resultados').scrollIntoView({behavior:'smooth'})};const tick=()=>{$('clock').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())};tick();setInterval(tick,1000);void loadCatalog().then(()=>{void refresh();void loadDays()});setInterval(()=>{if(!document.hidden&&!qs.day)void refresh()},1000);setInterval(()=>{if(!document.hidden)void loadDays()},30000)}
init();
