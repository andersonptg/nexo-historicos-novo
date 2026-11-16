/* NEXO V22: diagnostico protegido, somente sob comando do usuario.
   Não ativa sinais, não modifica estrategias, R2, ou tokens.
 */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
 function init(){
   const page=$('page-configuracoes');
   if(!page||$('v22-diagnostic'))return;
   const card=el('section','v22-diagnostic');card.id='v22-diagnostic';
   card.append(el('h2','','Diagnóstico da fila do Telegram'),
     el('p','v22-muted','Mostra a fila interna da Cloudflare, não os horários oficiais das rodadas. Não consulta nem revela tokens, chats ou mensagens.'));
   const data=el('div','v22-values');data.id='v22-values';data.textContent='Clique em Consultar fila para medir.';
   const btn=el('button','v22-check','↻ Consultar fila');btn.type='button';
   btn.addEventListener('click',async()=>{
     btn.disabled=true;data.textContent='Consultando...';
     try{
       const res=await fetch('/api/adm/queue-health',{credentials:'same-origin',cache:'no-store'});
       const j=await res.json();if(!res.ok||!j.ok)throw Error(j.error||'HTTP '+res.status);
       const seconds=x=>x==null?'—':(Number(x)/1000).toFixed(1)+' s';
       data.replaceChildren();
       for(const [lab,val] of [
         ['Lotes aguardando',String(j.pending_jobs)+(j.pending_capped?'+':'')],
         ['Estratégias cadastradas',String(typeof model!=='undefined'&&model?.strategies?.length||0)],
         ['Estratégias ativas',String(typeof model!=='undefined'&&model?.strategies?.filter(s=>s.enabled&&!s.archived).length||0)],
         ['Idade do lote mais antigo',seconds(j.oldest_age_ms)],
         ['Lotes processados desde V22',String(j.processed)],
         ['Lotes vencidos descartados para sinais',String(j.expired)],
         ['Lotes liberados por agrupamento V23',String(j.coalesced??0)],
         ['Tamanho do ultimo lote tratado',String(j.last_batch_size??'—')],
         ['Duração do último lote',seconds(j.last_duration_ms)],
         ['Espera anterior ao último lote',seconds(j.last_queue_age_ms)]
       ]){const row=el('div','v22-line');row.append(el('span','',lab),el('strong','',val));data.append(row);}
       data.append(el('p','v22-muted','Um lote vencido continua no histórico R2, mas não gera sinais antigos. Atrasos da fonte e da rede precisam de medição separada.'));
     }catch(e){data.textContent='Não foi possível consultar: '+String(e.message||e);}
     finally{btn.disabled=false;}
   });
   card.append(btn,data);page.append(card);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
