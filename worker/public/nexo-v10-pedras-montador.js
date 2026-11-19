/* V10: desenha no montador as MESMAS classes e estrutura visual usadas no histórico Blitz.
   Somente DOM. Não altera tokens, eventos, estratégias, Telegram, Worker ou coleta. */
(()=>{'use strict';
  const S='#v6-builder';
  const el=(tag,cls)=>{const x=document.createElement(tag);x.className=cls;return x};
  function classify(node){
    const label=node.getAttribute('aria-label')||'';
    const m=/^Pedra\s+(\d{1,2})$/i.exec(label);
    if(m){const n=Number(m[1]);if(n>=0&&n<=14)return {kind:n===0?'white':n<8?'orange':'black',n};}
    if(node.classList.contains('joker'))return {kind:'joker'};
    if(node.classList.contains('red'))return {kind:'orange'};
    if(node.classList.contains('black'))return {kind:'black'};
    if(node.classList.contains('white'))return {kind:'white'};
    return null;
  }
  function draw(node,info){
    const signature=info.kind+':'+(info.n??'');
    if(node.dataset.nexoV10===signature && node.querySelector(':scope > .nexo-blitz-tile'))return;
    const tile=el('span','nexo-blitz-tile nexo-blitz-v5-stone nexo-blitz-v5-'+info.kind);
    if(info.kind==='white'){
      const badge=el('span','nexo-blitz-v5-bolt');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M13.8 1.8 5.7 13h5.5l-1 9.2L18.8 10h-5.6z');path.setAttribute('fill','#111317');svg.append(path);badge.append(svg);tile.append(badge);
    }else if(info.kind==='black'&&info.n!==undefined){
      /* As pedras pretas 8 a 14 no histórico usam os PNGs /pedras-v19/NN.png. */
      tile.className='nexo-blitz-tile nexo-blitz-png';
      const img=el('img','nexo-blitz-png-img');img.src='/pedras-v19/'+String(info.n).padStart(2,'0')+'.png';img.alt='';img.draggable=false;img.decoding='async';tile.append(img);
    }else{
      const ring=el('span','nexo-blitz-v5-ring');if(info.n!==undefined)ring.textContent=String(info.n);tile.append(ring);
    }
    /* Guarda a face original oculta, mantendo listeners do botão e atributos sem alteração. */
    node.querySelector(':scope > .nexo-blitz-tile')?.remove();
    node.append(tile);node.dataset.nexoV10=signature;node.classList.add('nexo-v10-host');
  }
  function paint(){
    const root=document.querySelector(S);if(!root)return;
    for(const node of root.querySelectorAll('.v6-stone')){
      const info=classify(node);if(info && info.kind!=='joker')draw(node,info);
    }
    for(const label of root.querySelectorAll('.v6-color-button > span:not(.v6-stone),.v6-goal-label,.v6-opposite > span')){
      if(label.children.length===0&&/vermelho/i.test(label.textContent))label.textContent=label.textContent.replace(/vermelho/gi,'LARANJA');
    }
    const select=document.getElementById('st-target');if(select)for(const option of select.options){if(/vermelho/i.test(option.textContent))option.textContent=option.textContent.replace(/vermelho/gi,'LARANJA');}
  }
  let scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paint()});}
  function init(){paint();const page=document.getElementById('page-estrategias');if(page)new MutationObserver(schedule).observe(page,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
