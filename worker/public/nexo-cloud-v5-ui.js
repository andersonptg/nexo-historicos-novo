(()=>{'use strict';
const q=id=>document.getElementById(id);
const T='America/Sao_Paulo';
const fmt=s=>s?new Intl.DateTimeFormat('pt-BR',{timeZone:T,hour:'2-digit',minute:'2-digit'}).format(new Date(s*1000)):'—';
const datefmt=s=>s?new Intl.DateTimeFormat('pt-BR',{timeZone:T,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s*1000)):'—';
const host=q('resultados');if(!host)return;
const root=document.createElement('section');root.id='nexo-cloud-view';root.hidden=true;
root.innerHTML=`<div class="nx5-head"><div><b id="nx5-heading">Histórico da plataforma</b><p id="nx5-sub">Registros recebidos das fontes públicas. Precisão de minuto.</p></div><button type="button" id="nx5-update">↻ Atualizar</button></div><div class="nx5-stats"><span id="nx5-total">0 resultados</span><span id="nx5-health">Status: aguardando</span><span id="nx5-time">Última coleta: —</span></div><div id="nx5-records" class="nx5-grid"></div><div id="nx5-caution" class="nx5-caution">Históricos não são previsões nem dados garantidos em tempo real.</div>`;
const toolbar=host.querySelector('.toolbar');toolbar?.insertAdjacentElement('afterend',root);
let selected='',last='',rows=[],game={},details={},pending=null,pendingGame='',lastGet=0,lastGame='';
const mode=id=>id&&id!=='blitz-double';
function select(id){
 selected=mode(id)?id:'';
 document.body.classList.toggle('nx5-cloud-mode',!!selected);
 root.hidden=!selected;
 if(selected){
  q('arquivo').hidden=true;
  q('day').disabled=true;
  q('color').closest('label')?.classList.add('nx5-hidden-filter');
  q('number').closest('label')?.classList.add('nx5-hidden-filter');
  q('day').closest('label')?.classList.add('nx5-hidden-filter');
 }else{
  q('arquivo').hidden=false;
  q('day').disabled=false;
  for(const f of ['color','number','day'])q(f).closest('label')?.classList.remove('nx5-hidden-filter');
 }
 if(selected!==last){last='';rows=[];q('nx5-records').textContent='Carregando registros...';}
}
function ball(rec){
 const cell=document.createElement('div');const value=rec.multiplier;
 const color=game.kind==='fortune-double'?(rec.color==='red'?'fortune-red':rec.color==='purple'?'fortune-purple':'fortune-gold'):game.kind==='double'?(rec.color==='white'?'white':rec.color==='red'?'orange':'black'):value<1.2?'black':value<2?'blue':value<10?'green':'purple';
 cell.className='nx5-result nx5-'+color;
 const circle=document.createElement('span');circle.className='nx5-circle';circle.textContent=game.kind==='fortune-double'?(rec.color==='red'?'🔴':rec.color==='purple'?'🟣':rec.multiplier==null?'🐼':Number(value).toFixed(2)+'x'):game.kind==='double'?String(rec.number):Number(value).toFixed(2)+'x';
 const time=document.createElement('small');time.textContent=fmt(rec.minute_epoch);
 const seq=document.createElement('small');seq.textContent='#'+(rec.seq||'—');
 cell.title=(game.kind==='fortune-double'?(rec.color==='gold'?'Panda · '+(rec.multiplier??'sem multiplicador')+'x':rec.color==='red'?'Vermelho':'Roxo'):game.kind==='double'?'Número '+rec.number:'Vela '+Number(value).toFixed(2)+'x')+' · '+datefmt(rec.minute_epoch)+' · sequência de coleta '+(rec.seq||'—');
 cell.append(circle,time,seq);return cell;
}
function render(){
 if(!selected)return;
 const grid=q('nx5-records');grid.replaceChildren();
 q('nx5-heading').textContent=(game.platform||'Plataforma')+' · '+(game.game||'Jogo');
 q('nx5-sub').textContent=game.eligible?'Fonte pública · histórico de observação':'Jogo catalogado; adaptador de coleta pendente';
 q('nx5-total').textContent=rows.length+' resultados carregados';
 q('nx5-health').textContent='Coleta: '+String(details.status||game.status||'aguardando');
 q('nx5-time').textContent='Última coleta válida: '+datefmt(details.last_success?details.last_success/1000:null);
 if(!rows.length){const p=document.createElement('p');p.className='nx5-empty';p.textContent=!game.eligible?'Este tipo de jogo ainda não possui leitor homologado. Não serão inventados resultados.':details.last_error?'A fonte não está alimentando o histórico: '+details.last_error:'Ainda sem histórico na nuvem. Ative o motor no ADM e verifique o status da fonte.';grid.append(p);}
 else grid.append(...rows.map(ball));
 q('nx5-caution').textContent=details.status==='bloqueado'?'Fonte bloqueada ou janela sem sobreposição; dados antigos preservados. Nenhuma captura forçada.':'Os horários são os informados pela fonte em minutos. Sequências são números internos do NEXO; não IDs oficiais da plataforma.';
 q('rows-badge').textContent=rows.length+' REGISTROS';
 q('result-title').textContent=(game.platform||'Plataforma')+' · '+(game.game||'Jogo');
 q('source-note').textContent='Coleta na nuvem · '+(details.status||'aguardando')+' · atualizado '+datefmt(details.last_success?details.last_success/1000:null);
}
async function refresh(id,force=false){
 if(!mode(id))return;
 select(id);
 if(pending&&pendingGame===id)return pending;
 if(!force&&lastGame===id&&Date.now()-lastGet<12000)return;
 lastGame=id;lastGet=Date.now();pendingGame=id;
 const currentPromise=(async()=>{
 try{
  const [catalog,resp]=await Promise.all([
   fetch('/api/cloud/catalog',{cache:'no-store'}),
   fetch('/api/cloud/history?game_id='+encodeURIComponent(id)+'&limit=200',{cache:'no-store'})
  ]);
  if(!resp.ok||!catalog.ok)throw Error('HTTP '+resp.status+' / '+catalog.status);
  const c=await catalog.json(),d=await resp.json();
  if(!d.ok)throw Error(d.error||'Falha ao ler o histórico');
  if(selected!==id)return;
  game=(c.games||[]).find(g=>g.id===id)||{};
  details=d.status||{};rows=(d.items||[]).filter(x=>game.kind==='fortune-double'?(['red','purple','gold'].includes(x.color)&&(x.multiplier==null||x.color==='gold'&&Number.isFinite(x.multiplier)&&x.multiplier>=1)):game.kind==='double'?(Number.isInteger(x.number)&&x.number>=0&&x.number<=14):Number.isFinite(x.multiplier)&&x.multiplier>=1);
  render();
 }catch(e){if(selected===id){game={platform:'Plataforma',game:id,eligible:true};details={status:'erro',last_error:String(e.message).slice(0,120)};rows=[];render();}}
 finally{if(pendingGame===id){pending=null;pendingGame='';}}
 })();pending=currentPromise;return currentPromise;
}
q('nx5-update').onclick=()=>{if(selected)void refresh(selected,true)};
window.NEXO_CLOUD_UI={isSelected:mode,select,refresh,render};
})();
