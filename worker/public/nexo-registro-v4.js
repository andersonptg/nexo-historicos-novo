/* Registro de histórico, somente leitura. */
(()=>{'use strict';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const dates=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const WHEEL=Object.freeze([1,14,2,13,3,12,4,0,11,5,10,6,9,7,8]);
function wheelAround(n){const i=WHEEL.indexOf(n);return i<0?[]:[-2,-1,0,1,2].map(d=>WHEEL[(i+d+WHEEL.length)%WHEEL.length]);}
const grid=document.getElementById('nx6-grid');if(!grid||document.getElementById('nxr-dialog'))return;
const dialog=el('dialog','nxr-dialog');dialog.id='nxr-dialog';dialog.setAttribute('aria-labelledby','nxr-title');
const panel=el('section','nxr-panel');panel.id='nxr-panel';const header=el('header','nxr-header');const title=el('h2','','Rodada de Double');title.id='nxr-title';const close=el('button','nxr-close','×');close.type='button';close.setAttribute('aria-label','Fechar registro');close.onclick=()=>dialog.close();const meta=el('p','nxr-meta');header.append(title,close,meta);const strip=el('div','nxr-strip');const slots=el('div','nxr-slots');strip.append(slots,el('i','nxr-marker'));const footer=el('p','nxr-note');panel.append(header,strip,footer);dialog.append(panel);document.body.append(dialog);let opener=null;
function tile(r){const b=el('div','nxr-tile');if(!r){b.classList.add('nxr-missing');b.textContent='—';b.setAttribute('aria-label','Rodada não disponível');return b;}const num=Number(r.number);b.classList.add(num===0?'nxr-white':num<=7?'nxr-orange':'nxr-black');b.setAttribute('aria-label',String(num)+(num===0?' · Branco':num<=7?' · Laranja':' · Preto'));if(num===0){
 // Same element structure and CSS classes as the actual historical white tile.
 b.classList.add('n67-stone-tile','n67-stone-double','n67-stone-white');
 const circle=el('span','n67-circle');
 circle.append(el('span','n67-white-bolt','⚡'));
 b.append(circle);
 }else b.append(el('span','nxr-circle',String(num)));return b;}
window.NEXO_REGISTRO_ABRIR=function(record,records,game,cell){
 if(game?.kind!=='double'||!record)return;
 const num=Number(record.number),stamp=Number(record.minute_epoch),seq=Number(record.seq);
 if(record.number==null||record.number===''||!Number.isInteger(num)||num<0||num>14)return;
 const hasSeq=Number.isSafeInteger(seq)&&seq>0;
 const id=hasSeq?'Registro NEXO #'+seq:record.id!=null&&String(record.id).trim()?'ID da fonte: '+String(record.id).slice(0,180):'Identificador indisponível';
 let date='Horário indisponível';if(Number.isFinite(stamp)&&stamp>0){const d=new Date(stamp*1000);if(!Number.isNaN(d.getTime())){const parts=dates.formatToParts(d);const get=k=>parts.find(x=>x.type===k)?.value;date=`${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;}}
 title.textContent='Rodada de Double';meta.textContent=id+' · '+date;
 if(game.id==='blitz-double'){slots.replaceChildren(...wheelAround(num).map(number=>tile({number,showZero:true})));footer.textContent='Blitz · Posição na roleta fixa · horário de Brasília (precisão de minuto)';}
 else {const index=records.indexOf(record);slots.replaceChildren(...[-2,-1,0,1,2].map(d=>tile(d===0?record:index<0?null:records[index+d])));footer.textContent=game.platform+' · Rodadas vizinhas do histórico · horário de Brasília (precisão de minuto)';}
 panel.dataset.seq=hasSeq?String(seq):'';opener=cell||null;
 if(!dialog.open)dialog.showModal();close.focus();
};
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;});
})();
