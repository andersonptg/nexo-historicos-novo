/* NEXO Blitz V6 - somente montador e gráficos a partir dos placares existentes.
   Nenhuma chamada de rede, nenhum envio Telegram, nenhum cadastro automático. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const orangeNames=()=>{
    const root=$('page-estrategias');if(!root)return;
    for(const select of root.querySelectorAll('#st-target')){
      for(const opt of select.options){if(/vermelho/i.test(opt.textContent))opt.textContent=opt.textContent.replace(/vermelho/gi,'LARANJA');}
    }
    for(const b of root.querySelectorAll('#pattern-palette [data-stone="red"]')){
      b.title='Adicionar laranja';b.setAttribute('aria-label','Adicionar laranja');
    }
  };
  function markExactButtons(){
    const grid=$('nexo-v19-numbers-grid') || $('nexo-v19-numbers')?.querySelector('.nexo-v19-numbers-grid');
    if(!grid)return;
    const buttons=[...grid.querySelectorAll('button.nexo-v19-number')];
    if(buttons.length!==15)return; // Nunca adivinhar o numero se a paleta mudar.
    buttons.forEach((b,i)=>{if(b.dataset.nexoBlitzNumber!==String(i))b.dataset.nexoBlitzNumber=String(i)});
  }
  const readCell=(root,label)=>{
    if(!root)return null;
    const cards=[...root.querySelectorAll('.v17-score')];
    const found=cards.find(c=>(c.querySelector('small')?.textContent||'').trim().toUpperCase()===label);
    if(!found)return null;
    const value=(found.querySelector('strong')?.textContent||'').trim().replace(/\s/g,'');
    const n=Number(value.replace(/\./g,'').replace(',','.'));
    return Number.isFinite(n)&&n>=0?n:null;
  };
  function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  let graphRoot=null,observedRoot=null;
  function makeCharts(){
    const pg=$('page-placares');if(!pg)return;
    const existing=$('v17-score-values');if(!existing)return;
    if(!graphRoot){
      graphRoot=make('section','nexo-v6-graphs');graphRoot.id='nexo-v6-graphs';
      graphRoot.append(make('h2','','Gráficos dos placares'));
      graphRoot.append(make('p','nexo-v6-sub','Dados registrados pelo NEXO. Taxas históricas não garantem resultados futuros.'));
      const rows=make('div','nexo-v6-bars');rows.id='nexo-v6-bars';graphRoot.append(rows);
      const summary=make('p','nexo-v6-graph-summary');summary.id='nexo-v6-graph-summary';graphRoot.append(summary);
    }
    if(!graphRoot.isConnected){const board=$('v17-scoreboard');(board||pg).append(graphRoot)}
    if(observedRoot!==existing){
      if(window.__nexoV6GraphObserver)window.__nexoV6GraphObserver.disconnect();
      const ob=new MutationObserver(updateGraphs);ob.observe(existing,{childList:true,subtree:true,characterData:true});
      window.__nexoV6GraphObserver=ob;observedRoot=existing;
    }
    updateGraphs();
  }
  function updateGraphs(){
    const source=$('v17-score-values'),dest=$('nexo-v6-bars'),summary=$('nexo-v6-graph-summary');
    if(!source||!dest||!summary)return;
    const vals=[['WIN','green'],['BRANCOS','white'],['RED','red'],['ENTRADAS','entries']].map(([name,k])=>({name,key:k,value:readCell(source,name)}));
    if(vals.some(x=>x.value===null)){
      dest.replaceChildren();summary.textContent='Carregue os placares para visualizar os gráficos.';return;
    }
    const max=Math.max(1,...vals.map(x=>x.value));
    const newContent=document.createDocumentFragment();
    for(const x of vals){
      const row=make('div','nexo-v6-bar-row');
      const label=make('span','nexo-v6-bar-label',x.name);
      const track=make('div','nexo-v6-bar-track');track.setAttribute('role','img');track.setAttribute('aria-label',`${x.name}: ${x.value}`);
      const fill=make('span','nexo-v6-bar-fill nexo-v6-'+x.key);fill.style.width=(x.value/max*100).toFixed(2)+'%';track.append(fill);
      row.append(label,track,make('strong','nexo-v6-bar-number',String(x.value)));newContent.append(row);
    }
    dest.replaceChildren(newContent);
    const win=vals[0].value,white=vals[1].value,red=vals[2].value,closed=win+white+red;
    summary.textContent=`Ciclos encerrados: ${closed} · Acerto registrado: ${closed?((win+white)/closed*100).toFixed(1).replace('.',',')+'%':'— (sem amostra)'}`;
  }
  function openScoreboard(){
    const nav=document.querySelector('#nav button[data-page="placares"]');
    if(nav){nav.click();}
    else if(typeof page==='function'){page('placares');}
    else{location.hash='placares';}
    requestAnimationFrame(()=>{$('v17-scoreboard')?.scrollIntoView({block:'start',behavior:'smooth'});makeCharts()});
  }
  function addScoreButton(){
    const pg=$('page-estrategias');if(!pg)return;
    const header=pg.querySelector('.pagehead');if(!header||$('nexo-v6-open-graphs'))return;
    const btn=make('button','nexo-v6-score-button','▥ Placares e gráficos');
    btn.id='nexo-v6-open-graphs';btn.type='button';btn.addEventListener('click',openScoreboard);
    header.append(btn);
  }
  let scheduled=false;
  function refresh(){
    scheduled=false;orangeNames();markExactButtons();addScoreButton();makeCharts();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(refresh)}
  function start(){
    refresh();
    const page=$('page-estrategias');if(page)new MutationObserver(schedule).observe(page,{childList:true,subtree:true});
    const placares=$('page-placares');if(placares)new MutationObserver(schedule).observe(placares,{childList:true});
    document.addEventListener('click',e=>{if(e.target.closest('[data-page="placares"],#nexo-v6-open-graphs'))requestAnimationFrame(makeCharts)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
