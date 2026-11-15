/* NEXO V11 - monitor visual, sem iniciar motor, sem enviar mensagens. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const keys=[
  ['attention','🚨 ATENÇÃO','Aguarda padrão; alerta removido antes da entrada.'],
  ['entry','🎯 ENTRADA','Somente um ciclo por jogo.'],
  ['gale1','↪ GALE 1','Apenas quando a estratégia exigir.'],
  ['gale2','↪ GALE 2','Apenas quando configurado.'],
  ['result','✅ WIN / ❌ RED','Encerra o ciclo antes do próximo.'],
  ['media','🎞 STICKER / GIF','Opcional e vinculado ao evento.'],
  ['stone','🎲 PEDRA SORTEADA','Quadradinho com cor e número reais.'],
  ['link','🔗 CADASTRE-SE','Enviado logo após a entrada, em balão separado.']
 ];
 let previousTop='',busy=false;
 function build(){
  const page=$('page-pedras');if(!page||$('v11-board'))return;
  const board=el('section','v11-board');board.id='v11-board';
  const top=el('div','v11-board-header'),title=el('div');
  title.append(el('h2','v11-headline','NEXO · Central de sinais V11'),el('p','v11-sub','Eventos em campos próprios, pedra quadrada e sinalização de filas. Prévia não faz envios.'));
  top.append(title,el('span','v11-pill','ORDEM CONTROLADA'));board.append(top);
  const grid=el('div','v11-grid');
  for(const [key,t,desc] of keys){const c=el('article','v11-block '+(key==='result'?'win':''));c.append(el('strong','',t),el('span','',desc));grid.append(c)}
  board.append(grid);
  board.append(el('h3','v11-headline','Últimos resultados confirmados'));
  const health=el('p','v11-health','Aguardando histórico e status do Worker...');health.id='v11-health';board.append(health);
  const stones=el('div','v11-stone-strip');stones.id='v11-stones';stones.setAttribute('aria-label','Últimas pedras recebidas pela Cloudflare');board.append(stones);
  board.append(el('h3','v11-headline','Filas e entregas Telegram'));
  const sends=el('div','v11-live-list');sends.id='v11-deliveries';board.append(sends);
  board.append(el('p','v11-warning','A coleta é independente do Telegram. Se houver atraso na Cloudflare, o painel deve indicar o atraso em vez de inventar resultados. Mensagens de entrega incerta exigem revisão.'));
  const first=page.querySelector('.pagehead');first?.insertAdjacentElement('afterend',board);
 }
 function paint(rows){const host=$('v11-stones');if(!host)return;host.replaceChildren();
  for(const r of rows){const wrap=el('div','v11-stone-unit');const cls=['black','red','white'].includes(r.color)?r.color:'white';const stone=el('span','v11-stone-box '+cls,String(r.number));stone.title=`Pedra ${r.number} · ${cls}`;
   const time=el('small','',new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(r.minute_epoch*1000)));
   wrap.append(stone,time);host.append(wrap);}
  if(!rows.length)host.textContent='Nenhuma pedra recebida pela Cloudflare.';
 }
 function row(name,text,item=null){const r=el('div','v11-live-row');r.append(el('strong','',name),el('small','',text));
  if(item?.id){const b=el('button','outline','Descartar pendência');b.type='button';b.title='Só após conferir manualmente no Telegram';
   b.onclick=async()=>{if(!confirm('Você verificou este destino? Descartar interrompe o evento pendente sem reenviar mensagens. Deseja continuar?'))return;
    b.disabled=true;try{await api('v11/discard-delivery',payload('POST',{chatTag:item.id,confirm:true}));void refresh()}catch(e){alert('Falha: '+e.message)}finally{b.disabled=false;}};r.append(b);
  }return r}

 async function refresh(){if(busy||!$('v11-board')||$('page-pedras')?.hidden||document.hidden)return;busy=true;
  try{
   const [h,s]=await Promise.all([fetch('/api/history?game_id=brabet-double&limit=28',{cache:'no-store'}).then(r=>r.json()),api('v11/status')]);
   const items=h.items||[];paint(items);
   $('v11-health').textContent=`Histórico: ${items.length} pedras exibidas · Ciclo: ${s.cycle?.ownerId?'EM ANDAMENTO':'LIVRE'} · ${s.pending||0} envio(s) pendente(s) · ${s.uncertain||0} com entrega incerta`;
   const host=$('v11-deliveries');host.replaceChildren();
   for(const d of s.recent||[])host.append(row(d.type||'Evento',`${d.stage||'Aguardando'} · ${d.chatMasked||'destino'} · ${d.at||''}`,d));
   if(!(s.recent||[]).length)host.append(row('Nenhuma falha recente','Filas sem alertas conhecidos'));
  }catch(e){$('v11-health').textContent='Monitoramento indisponível: '+String(e.message||e).slice(0,100)}finally{busy=false}
 }
 function init(){build();void refresh();document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});window.setInterval(()=>{void refresh()},4000)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
