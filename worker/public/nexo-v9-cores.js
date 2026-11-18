/* NEXO V9: converte somente rotulos da cor red do jogo nas Regras. */
(()=>{'use strict';
const root=()=>document.getElementById('page-estrategias');
const convert=s=>s.replace(/🔴/g,'🟠').replace(/\bvermelh[oa]s?\b/gi,w=>{const suffix=w.toLowerCase().endsWith('s')?'s':'';const out='laranja'+suffix;return w===w.toUpperCase()?out.toUpperCase():w[0]===w[0].toUpperCase()?out[0].toUpperCase()+out.slice(1):out});
function scan(){const pg=root();if(!pg)return;
 // Somente textos que designam a cor DO JOGO, nao contadores RED, avisos ou botoes.
 const selectors=['#v6-target-text','#strategy-form label','#strategy-form small','#strategy-form .v6-color-label','#pattern-preview','.v6-saved-pattern','.v17-muted','.v17-stones','.v6-saved-meta','.entry small','#strategy-list .entry small','#v6-builder .v6-help'];
 for(const selector of selectors)for(const host of pg.querySelectorAll(selector)){
   const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);const nodes=[];
   while(walker.nextNode()){const n=walker.currentNode;if(n.parentElement?.closest('button.danger,.v26-card-stats,.v26-stat,.v17-score,.v6-score-mini,.v6-card-actions'))continue;if(/vermelh|🔴/i.test(n.data))nodes.push(n)}
   for(const n of nodes)n.data=convert(n.data);
 }
 const t=pg.querySelector('#st-target');if(t)for(const o of t.options){if(/vermelh|🔴/i.test(o.textContent))o.textContent=convert(o.textContent)}
 const ev=document.getElementById('message-event');if(ev)for(const o of ev.options){if(/vermelh|🔴/i.test(o.textContent))o.textContent=convert(o.textContent)}
 // Indicadores textuais apenas: emojis da cor red, nunca imagens numeradas.
 for(const e of pg.querySelectorAll('.v6-stone.red,.v17-stone.red,.pattern-pill.red')){
  if(e.childElementCount===0 && e.textContent.trim()==='🔴')e.textContent='🟠';
 }
}
let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;scan()})}
function start(){scan();const pg=root();if(pg)new MutationObserver(schedule).observe(pg,{subtree:true,childList:true,characterData:true});document.addEventListener('change',schedule);document.addEventListener('click',schedule)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
