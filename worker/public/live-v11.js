/* NEXO V11: usa dados ja carregados pelo app.js, SEM novas consultas a R2. */
(()=>{
 'use strict';
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const card=el('section');card.id='nexo-v11-now';card.setAttribute('aria-label','Última pedra sincronizada');
 const header=el('div','v11-now-header');header.append(el('strong','','ÚLTIMA PEDRA SINCRONIZADA'),el('span','','BLITZ · DOUBLE'));card.append(header);
 const body=el('div','v11-now-body'),square=el('div','v11-stone black','—'),details=el('div');
 const number=el('span','v11-number','Aguardando'),color=el('span','v11-color','Sem resultados');
 details.append(number,color);body.append(square,details);card.append(body);
 const note=el('p','v11-subtle','Atualização conforme o histórico recebido pela Cloudflare. Não é previsão.');card.append(note);
 document.getElementById('resultados')?.parentElement?.insertBefore(card,document.getElementById('resultados'));
 let lastId='';
 window.NEXO_V11_LIVE=(rows,remoteStatus)=>{
  const r=rows?.[0];if(!r){number.textContent='Aguardando';square.textContent='—';return;}
  const type=['red','black','white'].includes(r.color)?r.color:'white';
  square.className='v11-stone '+type;square.textContent=String(r.number);
  number.textContent=String(r.number);color.textContent=type==='red'?'LARANJA':type==='black'?'PRETO':'BRANCO';
  note.textContent='Rodada '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(r.minute_epoch*1000))+' · Atualização somente após receber resultado real. '+(remoteStatus?.last_heartbeat?'':'Aguardando confirmação do motor.');
  if(r.id!==lastId){if(lastId){card.classList.remove('v11-flash');void card.offsetWidth;card.classList.add('v11-flash')}lastId=r.id;}
 };
})();
