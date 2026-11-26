/* NEXO_V12_GREEN_HISTORICO: sincronizar estado somente pelo ultimo resultado renderizado. */
(()=>{'use strict';
 const tile=document.getElementById('n67-latest-tile');
 const card=document.querySelector('.n67-preview');
 if(!tile||!card)return;
 function sync(){
  const name=tile.className||'';
  const color=name.includes('n67-stone-white')?'white':name.includes('n67-stone-orange')?'orange':name.includes('n67-stone-black')?'black':'';
  if(card.dataset.n12Color!==color)card.dataset.n12Color=color;
 }
 new MutationObserver(sync).observe(tile,{attributes:true,attributeFilter:['class'],childList:true});
 sync();
})();
