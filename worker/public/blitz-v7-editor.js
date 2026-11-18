/* NEXO Blitz V7.0: apenas tela Criar estratégia. Não modifica tokens, banco ou motor. */
(() => {
  'use strict';
  const BASE='/pedras-v19/';
  const tile=(kind,number) => {
    const face=document.createElement('span');
    face.className='nexo-blitz-tile nexo-v7-face nexo-v7-'+kind;
    face.setAttribute('aria-hidden','true');
    if(kind==='white'){
      const badge=document.createElement('span');badge.className='nexo-v7-flash';
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('fill','#161718');path.setAttribute('d','M13.8 1.8 5.7 13h5.5l-1 9.2L18.8 10h-5.6z');
      svg.append(path);badge.append(svg);face.append(badge);
    }else{
      const ring=document.createElement('span');ring.className='nexo-v7-ring';
      if(number!==null)ring.textContent=String(number);
      face.append(ring);
    }
    return face;
  };
  function applyButton(button,kind,number,src){
    if(button.dataset.nexoV7Source===src && button.querySelector(':scope > .nexo-v7-face'))return;
    button.replaceChildren(tile(kind,number));
    button.dataset.nexoV7Source=src;
    // Mantém compatibilidade com o pintor V19, que reaplica cores ao editor.
    button.dataset.nexoBlitzAsset=src;
    button.classList.add('nexo-blitz-host','nexo-v7-button');
    button.title=number===null?'Adicionar cor '+(kind==='orange'?'laranja':kind==='white'?'branca':'preta'):'Adicionar número '+number;
    button.setAttribute('aria-label',button.title);
  }
  function refresh(){
    const form=document.getElementById('strategy-form');if(!form)return;
    const palette=form.querySelector('#pattern-palette');
    if(palette){
      for(const [token,kind] of [['red','orange'],['black','black'],['white','white']]){
        const button=palette.querySelector('[data-stone="'+token+'"]');
        if(button)applyButton(button,kind,null,BASE+'cor_'+token+'.png');
      }
      const coringa=palette.querySelector('[data-stone="*"]');
      if(coringa){coringa.title='Adicionar coringa';coringa.setAttribute('aria-label','Adicionar coringa')}
    }
    const grid=form.querySelector('#nexo-v19-numbers .nexo-v19-numbers-grid');
    if(grid){
      const buttons=[...grid.querySelectorAll('button.nexo-v19-number')];
      if(buttons.length===15)for(let i=0;i<=14;i++){
        const b=buttons[i];
        const found=b.dataset.nexoBlitzNumber ?? b.getAttribute('aria-label')?.match(/(?:número|numero|pedra)\s+(\d+)/i)?.[1];
        const n=found==null?i:Number(found);
        // Nunca substituir o desenho por um número diferente do clique original.
        if(n!==i)continue;
        applyButton(b,i===0?'white':i<=7?'orange':'black',i,BASE+String(i).padStart(2,'0')+'.png');
      }
    }
    const target=form.querySelector('#st-target');
    if(target)for(const option of target.options){
      if(option.value==='red'&&/vermelho/i.test(option.textContent))option.textContent=option.textContent.replace(/vermelho/gi,'LARANJA');
    }
    // Apenas os textos DENTRO do formulário, não os cards de estratégias salvas.
    const walker=document.createTreeWalker(form,NodeFilter.SHOW_TEXT);const nodes=[];
    while(walker.nextNode()){
      const n=walker.currentNode;
      if(!n.parentElement?.closest('button.nexo-v7-button') && /vermelho/i.test(n.nodeValue||''))nodes.push(n);
    }
    for(const n of nodes)n.nodeValue=n.nodeValue.replace(/vermelho/gi,'laranja');
  }
  let pending=false;
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;refresh()})}
  function init(){
    refresh();
    const form=document.getElementById('strategy-form');
    if(form)new MutationObserver(schedule).observe(form,{subtree:true,childList:true,characterData:true});
    // O painel antigo reconstrói o editor ao tocar em Criar/Editar.
    document.addEventListener('click',ev=>{if(ev.target.closest('#new-strategy,.v17-btn,[data-page="estrategias"]'))schedule()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
