(()=>{'use strict';
// NEXO Crash V4 - the site selector and main results grid share the Double layout.
// Isolated: never sends signals and never modifies the Double history.
const q=id=>document.getElementById(id);
const T='America/Sao_Paulo';
let crashRows=[],syncTime=0,lastGet=0,loaded=false,inFlight=null;
const fmt=(sec)=>sec?new Intl.DateTimeFormat('pt-BR',{timeZone:T,hour:'2-digit',minute:'2-digit'}).format(new Date(sec*1000)):'--:--';
const nowClock=()=>new Intl.DateTimeFormat('pt-BR',{timeZone:T,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
const palette=v=>v<1.2?'nx-c-gray':v<2?'nx-c-blue':v<10?'nx-c-green':'nx-c-purple';
const filtersOriginal={color:q('color').innerHTML,number:q('number').innerHTML};
const metrics=[...document.querySelectorAll('.metric-grid .metric')];
const originalLabels=metrics.map(m=>({head:m.querySelector('.metric-top>span')?.textContent||'',foot:m.querySelector('small')?.textContent||''}));
const legends=q('resultados').querySelector('.legend');
const legendHTML=legends?.innerHTML||'';
const panelFoot=q('resultados').querySelector('.panel-footer .small-note');
const panelFootText=panelFoot?.textContent||'';
let current=false;
function setMode(gameId){
 const next=gameId==='blitz-crash';
 if(current===next)return;
 current=next;
 q('balls').classList.toggle('nx-crash-results',next);
 q('resultados').classList.toggle('nx-crash-selected',next);
 q('arquivo').hidden=next;
 q('day').disabled=next;
 q('color').innerHTML=next?'<option value="all">Todas as faixas</option><option value="lt2">Abaixo de 2x</option><option value="2to5">2x até abaixo de 5x</option><option value="5to10">5x até abaixo de 10x</option><option value="gte10">10x ou mais</option>':filtersOriginal.color;
 q('number').innerHTML=next?'<option value="all">Todos os alvos</option><option value="2">≥ 2x</option><option value="5">≥ 5x</option><option value="10">≥ 10x</option><option value="20">≥ 20x</option><option value="50">≥ 50x</option><option value="100">≥ 100x</option>':filtersOriginal.number;
 q('color').value='all';q('number').value='all';
 const labels=next?[['VELAS NA TELA','Últimas sincronizadas'],['ABAIXO DE 2X','Na amostra'],['2X A 9,99X','Na amostra'],['10X OU MAIS','Na amostra']]:originalLabels.map(x=>[x.head,x.foot]);
 metrics.forEach((m,i)=>{const h=m.querySelector('.metric-top>span'),f=m.querySelector('small');if(h)h.textContent=labels[i][0];if(f)f.textContent=labels[i][1]});
 if(legends)legends.innerHTML=next?'<span><i class="legend-dot black"></i> Menores</span><span>🔵 Baixos</span><span>🟢 Intermediários</span><span>🟣 Altos</span>':legendHTML;
 if(panelFoot)panelFoot.textContent=next?'Cores de exibição configuráveis · horário da fonte com precisão de minuto':panelFootText;
 const hero=document.querySelector('.hero-badges span');
 if(hero)hero.textContent=next?'◉ Blitz Crash':'◉ Brabet Double';
 document.querySelector('.breadcrumb')?.setAttribute('data-current-game',next?'crash':'double');
 // Keep the two modules separate: the independently appended V2 Crash card is not used.
 const old=q('nx-crash-home');if(old)old.hidden=true;
 if(next){loaded=false;lastGet=0;syncTime=0;crashRows=[];}
}
function render(){
 if(!current)return;
 const range=q('color').value,target=q('number').value;
 const ok=v=>range==='all'||(range==='lt2'&&v<2)||(range==='2to5'&&v>=2&&v<5)||(range==='5to10'&&v>=5&&v<10)||(range==='gte10'&&v>=10);
 const filtered=crashRows.filter(x=>ok(x.multiplier)&&(target==='all'||x.multiplier>=Number(target)));
 q('rows-badge').textContent=crashRows.length+' VELAS';
 q('filter-count').textContent=filtered.length+' VISÍVEIS';
 q('stat-total').textContent=crashRows.length;
 q('stat-red').textContent=crashRows.filter(x=>x.multiplier<2).length;
 q('stat-black').textContent=crashRows.filter(x=>x.multiplier>=2&&x.multiplier<10).length;
 q('stat-white').textContent=crashRows.filter(x=>x.multiplier>=10).length;
 const host=q('balls');host.replaceChildren();
 if(!filtered.length){const el=document.createElement('div');el.className='empty';el.textContent=!loaded?'Consultando o histórico Crash...':crashRows.length?'Nenhum multiplicador nessa faixa.':'Nenhuma vela sincronizada no site. Inicie o sincronizador Crash no Termux.';host.append(el);return;}
 const fragment=document.createDocumentFragment();
 for(const item of filtered){const cell=document.createElement('div');cell.className='nx-crash-item '+palette(item.multiplier);
 const bubble=document.createElement('div');bubble.className='nx-crash-bubble';bubble.textContent=item.multiplier.toFixed(2)+'x';
 const time=document.createElement('small');time.textContent=fmt(item.minute_epoch);
 const seq=document.createElement('small');seq.textContent='#'+item.seq;
 cell.title='Crash '+item.multiplier.toFixed(2)+'x · '+fmt(item.minute_epoch)+' · rodada '+item.seq;
 cell.append(bubble,time,seq);fragment.append(cell);}
 host.append(fragment);
}
async function refresh(){
 if(!current)return;
 const now=Date.now();
 if(inFlight)return inFlight;
 if(loaded&&now-lastGet<4000)return;
 lastGet=now;
 inFlight=(async()=>{
  try{
   const res=await fetch('/api/crash/history?limit=200',{cache:'no-store'}),d=await res.json();
   if(!res.ok||!d.ok)throw new Error(d.error||'Erro no historico Crash');
   if(!current)return;
   crashRows=(Array.isArray(d.items)?d.items:[]).filter(x=>Number.isSafeInteger(x.seq)&&Number.isFinite(x.multiplier)&&Number.isSafeInteger(x.minute_epoch)).sort((a,b)=>b.seq-a.seq);
   syncTime=Number(d.updated_at)||0;loaded=true;
   q('result-title').textContent='Rodadas recentes · Blitz Crash';
   const latest=crashRows[0];
   const syncAge=syncTime?Math.max(0,Date.now()-syncTime):Infinity;
   const roundAge=latest?Date.now()-latest.minute_epoch*1000:Infinity;
   const fresh=crashRows.length>0&&syncAge<90000&&roundAge<180000;
   q('source-note').textContent='Origem: histórico público Blitz Crash · última vela '+(latest?fmt(latest.minute_epoch):'não sincronizada')+(d.gaps?.length?' · lacunas registradas: '+d.gaps.length:'');
   q('engine-note').textContent=crashRows.length?'Crash R2: '+crashRows.length+' velas consultadas · última gravação '+(syncTime?fmt(syncTime/1000):'indisponível'):'Crash ainda sem registros no R2. Execute o sincronizador no Termux.';
   q('view-updated').textContent=nowClock();
   if(typeof showStatus==='function')showStatus(!crashRows.length?'Crash aguardando sincronização':fresh?'Crash atualizado':'Crash sem novas rodadas',fresh);
   render();
  }catch(e){if(current){loaded=true; q('result-title').textContent='Rodadas recentes · Blitz Crash';q('source-note').textContent='Crash indisponível: '+e.message;q('engine-note').textContent='Verifique a API do Crash e a conexão do Worker.';if(typeof showStatus==='function')showStatus('Crash indisponível',false);render();}}
 })().finally(()=>{inFlight=null});
 return inFlight;
}
function loadDays(){if(!current)return;
 q('archive-status').textContent='Arquivo diário do Crash ainda não habilitado; mostrando as últimas 200 velas sincronizadas.';
 q('archive-days').replaceChildren();
}
window.NEXO_CRASH_SITE={setMode,refresh,render,loadDays};
})();
