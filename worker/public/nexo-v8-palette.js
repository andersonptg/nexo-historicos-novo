/* NEXO Blitz V8: marca somente botões do formulário com números REAIS. */
(()=>{'use strict';
  function labelEditor(){
    const root=document.getElementById('strategy-form');if(!root)return;
    const numbered=root.querySelectorAll('#nexo-v19-numbers button.nexo-v19-number');
    if(numbered.length===15){numbered.forEach((b,i)=>{
      const original=b.getAttribute('aria-label')||'';
      const match=original.match(/(?:pedra|n[uú]mero)\s+(\d{1,2})/i);
      const n=match?Number(match[1]):i;
      if(n!==i)return; // não inventar número se DOM foi alterado
      if(b.dataset.nexoBlitzNumber!==String(n))b.dataset.nexoBlitzNumber=String(n);
    });}
    const red=root.querySelector('#pattern-palette [data-stone="red"]');
    if(red){red.title='Adicionar laranja';red.setAttribute('aria-label','Adicionar laranja');}
    const target=root.querySelector('#st-target');
    if(target)for(const option of target.options)if(/vermelho/i.test(option.textContent))option.textContent=option.textContent.replace(/vermelho/gi,'LARANJA');
    // Rótulos da paleta: só o nome visível, valores red/black/white NÃO mudam.
    const palette=root.querySelector('#pattern-palette');
    if(palette)for(const label of palette.querySelectorAll('label,span,small')){
      if(label.children.length===0 && /vermelho/i.test(label.textContent))label.textContent=label.textContent.replace(/vermelho/gi,'LARANJA');
    }
  }
  let pending=false;
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;labelEditor()})}
  function init(){labelEditor();const form=document.getElementById('strategy-form');if(form)new MutationObserver(schedule).observe(form,{subtree:true,childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
