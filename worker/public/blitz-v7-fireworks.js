/* NEXO Blitz: celebra apenas nova pedra BRANCA confirmada no histórico público.
   Não consulta fonte, não altera sinal, não dispara ao carregar histórico antigo. */
(()=>{
  'use strict';
  const host=document.getElementById('balls');if(!host)return;
  let previous=null,scheduled=false;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function snapshot(){return [...host.querySelectorAll(':scope > .stone')].map(x=>({
    n:Number(x.dataset.nexoNumber),epoch:Number(x.dataset.nexoEpoch)||0
  })).filter(x=>Number.isInteger(x.n)&&x.n>=0&&x.n<=14)}
  function celebrate(){
    if(reduced()||document.hidden||document.getElementById('nexo-v7-white-celebration'))return;
    const layer=document.createElement('div');layer.id='nexo-v7-white-celebration';layer.setAttribute('aria-hidden','true');
    const title=document.createElement('div');title.className='nexo-v7-white-title';title.textContent='⚡ BRANCO!';layer.append(title);
    const colors=['#ffdb55','#22efe8','#ff5bbd','#e9f3ff','#9c78ff','#ff9738'];
    for(let burst=0;burst<5;burst++){
      const x=12+(burst%3)*37,y=18+Math.floor(burst/3)*47;
      for(let i=0;i<15;i++){
        const a=(Math.PI*2*i/15),r=75+(i%3)*29;
        const s=document.createElement('i');s.className='nexo-v7-spark';
        s.style.setProperty('--x',x+'%');s.style.setProperty('--y',y+'%');
        s.style.setProperty('--dx',Math.round(Math.cos(a)*r)+'px');
        s.style.setProperty('--dy',Math.round(Math.sin(a)*r)+'px');
        s.style.setProperty('--color',colors[(i+burst)%colors.length]);
        s.style.setProperty('--delay',(burst*.21)+'s');layer.append(s);
      }
    }
    document.body.append(layer);
    // Sem timers permanentes ou intervalos de rede.
    setTimeout(()=>layer.remove(),3300);
  }
  function update(){
    scheduled=false;
    const cur=snapshot();if(!cur.length)return;
    if(previous && !document.hidden && !document.getElementById('day')?.value){
      const old=previous[0];
      // Só novas observações no início, nunca histórico carregado/filtrado.
      const overlap=cur.findIndex(x=>x.n===old.n && x.epoch===old.epoch);
      if(overlap>0 && overlap<=8 && cur[0].epoch>=old.epoch && cur.slice(0,overlap).some(x=>x.n===0))celebrate();
    }
    previous=cur;
  }
  new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(update)}).observe(host,{childList:true});
  update();
})();
