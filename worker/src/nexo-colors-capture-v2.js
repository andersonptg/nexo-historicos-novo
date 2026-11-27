// Independent post-result images, never creates entry events or changes scores.
const ROOT='nexo-v3/colors-capture-v1/';
const WHEEL=[1,14,2,13,3,12,4,0,11,5,10,6,9,7,8];
const CONFIG=ROOT+'config-v2.json';
const QUEUE=ROOT+'queue-v2/';
const MAX_AGE=180;
const STATUS=ROOT+'status-v2.json';
const fresh=()=>Math.floor(Date.now()/1000);
const defaults={enabled:false,includeRed:false,previewAt:0,replyToEntry:false};
// NEXO_CAPTURA_RESPOSTA_V3: only the original, confirmed text in the same chat.
export async function confirmedEntryText(evt,chat,readStage){
 if(typeof evt.entryRoundId!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(evt.entryRoundId)||typeof evt.strategyId!=='string'||!evt.strategyId)return null;
 const matches=[];
 for(const type of ['entry_black','entry_red','entry_white']){
  const id=evt.strategyId+'_'+evt.entryRoundId+'_'+type;
  const stage=await readStage(id,chat);
  const m=stage?.confirmed?.text?.messageId;
  if(stage?.eventId===id&&String(stage.chatId)===String(chat)&&Number.isSafeInteger(m)&&m>0)matches.push(m);
 }
 return matches.length===1?matches[0]:null;
}

const get=async(env,key,fallback=null)=>{const o=await env.R2.get(key);return o?o.json():fallback;};
const put=(env,key,value)=>env.R2.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function wheelAround(n){const i=WHEEL.indexOf(n);if(i<0)throw Error('Número inválido');return [-2,-1,0,1,2].map(d=>WHEEL[(i+d+15)%15]);}
function valid(r){return r&&Number.isInteger(r.number)&&r.number>=0&&r.number<=14&&Number.isSafeInteger(r.seq)&&r.seq>0&&Number.isSafeInteger(r.minute_epoch)&&r.minute_epoch>1600000000&&r.color===(r.number===0?'white':r.number<=7?'red':'black');}
const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function base64(b){let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);}
async function asset(env,path){const r=await env.ASSETS.fetch(new Request('https://nexo-assets.internal/'+path));if(!r.ok)throw Error('Arquivo visual indisponível: '+path);return r;}
export function renderMarkup(r,css,white){
 if(!valid(r))throw Error('Rodada arquivada inválida');
 const p=date.formatToParts(new Date(r.minute_epoch*1000));const f=k=>p.find(x=>x.type===k)?.value;const when=`${f('day')}/${f('month')}/${f('year')} ${f('hour')}:${f('minute')}`;
 const slots=wheelAround(r.number).map(n=>n===0?`<div class="nxr-tile nxr-white"><img alt="Branco" src="${white}"></div>`:`<div class="nxr-tile ${n<=7?'nxr-orange':'nxr-black'}"><span class="nxr-circle">${n}</span></div>`).join('');
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>${css}\n*{box-sizing:border-box}html,body{margin:0;padding:0;background:#171717;font-family:system-ui,sans-serif;color:white}#nxr-panel{width:720px;margin:0;overflow:hidden;padding-bottom:14px}.nxr-tile{font-size:31px}.nxr-white img{width:90%;height:90%;object-fit:contain}.nxr-marker{z-index:5}.nxr-close{font:32px system-ui}.nxr-meta{font-size:20px}</style><body><section id="nxr-panel" class="nxr-panel"><header class="nxr-header"><h2>Rodada de Double</h2><span class="nxr-close">×</span><p class="nxr-meta">Registro NEXO #${esc(r.seq)} · ${esc(when)}</p></header><div class="nxr-strip"><div class="nxr-slots">${slots}</div><i class="nxr-marker"></i></div><p class="nxr-note">Blitz · Posição na roleta fixa · horário de Brasília (precisão de minuto)</p></section></body></html>`;
}
async function screenshot(env,r){
 if(!valid(r))throw Error('Rodada inválida');
 if(typeof env.NEXO_COLORS_BROWSER?.quickAction!=='function')throw Error('Browser Run não disponível');
 const css=await (await asset(env,'nexo-registro-v4.css')).text();let white='';
 if(wheelAround(r.number).includes(0)){
  const img=new Uint8Array(await (await asset(env,'nexo-pro-white.png')).arrayBuffer());
  if(img.length<8||img[0]!==137||img[1]!==80||img.length>2000000)throw Error('Imagem original do Branco inválida');
  white='data:image/png;base64,'+base64(img);
 }
 const res=await env.NEXO_COLORS_BROWSER.quickAction('screenshot',{html:renderMarkup(r,css,white),selector:'#nxr-panel',viewport:{width:720,height:720,deviceScaleFactor:2},screenshotOptions:{type:'png'}});
 if(!res.ok)throw Error('Browser Run HTTP '+res.status);
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.length<100||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('Captura não retornou PNG');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(16)<1200||view.getUint32(20)<300)throw Error('Captura fora das dimensões esperadas');
 return bytes;
}
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function captureAdmin(req,env,path,latest){
 if(!['/api/adm/colors-capture','/api/adm/colors-capture/preview'].includes(path))return null;
 const config={...defaults,...await get(env,CONFIG,{})};const available=typeof env.NEXO_COLORS_BROWSER?.quickAction==='function';
 if(path.endsWith('/preview')&&req.method==='POST'){
  try{const row=(await latest()).items?.find(valid);if(!row)throw Error('Sem rodada válida no R2');const bytes=await screenshot(env,row);await put(env,CONFIG,{...config,previewAt:fresh()});return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','Content-Disposition':'inline; filename="nexo-cores-previa.png"'}});}catch(e){return json({ok:false,error:String(e.message).slice(0,160)},503);}
 }
 if(req.method==='GET')return json({ok:true,config,available,status:await get(env,STATUS)});
 if(req.method==='PUT'&&path==='/api/adm/colors-capture'){
  const b=await req.json().catch(()=>null);if(!b||typeof b.enabled!=='boolean'||typeof b.includeRed!=='boolean'||(b.replyToEntry!==undefined&&typeof b.replyToEntry!=='boolean'))return json({ok:false,error:'Configuração inválida'},400);
  if(b.enabled&&(!available||!config.previewAt))return json({ok:false,error:'Gere uma prévia válida antes de ativar.'},409);
  const next={...config,enabled:b.enabled,includeRed:b.includeRed,replyToEntry:b.replyToEntry??config.replyToEntry,updatedAt:fresh(),enabledSince:b.enabled?(config.enabled?config.enabledSince||fresh():fresh()):0};await put(env,CONFIG,next);return json({ok:true,config:next,available,status:await get(env,STATUS)});
 }
 return json({ok:false,error:'Método inválido'},405);
}
export async function captureResult(env,evt,{groups,sent,send,reply}){
 // Only post-settlement records; no new signals, no links, no new recipients.
 if(evt.gameId!=='blitz-double'||!['win_black','win_red','win_white','red'].includes(evt.type)||!valid(evt)||!Number.isSafeInteger(evt.at)||fresh()-evt.at>MAX_AGE||fresh()<evt.at-5)return;
 const cfg={...defaults,...await get(env,CONFIG,{})};if(!cfg.enabled||!cfg.previewAt||evt.at<(cfg.enabledSince||0)||(evt.type==='red'&&!cfg.includeRed))return;
 const eligible=[];
 for(const g of (await groups()).filter(g=>g.selected&&g.admin&&/^-\d{1,20}$/.test(String(g.id))).slice(0,5)){
  if(await sent(g.id,evt))eligible.push(String(g.id));
 }
 if(!eligible.length){await put(env,STATUS,{seq:evt.seq,state:'skipped',detail:'Sem entrega original confirmada para grupo selecionado',at:fresh()});return;}
 const stem=ROOT+'rounds/'+evt.seq+'-'+evt.roundId;
 if(!/^[a-zA-Z0-9_-]{1,90}$/.test(String(evt.roundId))){await put(env,STATUS,{seq:evt.seq,state:'skipped',detail:'ID de rodada fora do formato aceito',at:fresh()});return;}
 // At most one capture per round and destination, including uncertain deliveries.
 const pending=[];for(const chat of [...new Set(eligible)])if(!await get(env,stem+'/'+chat+'.json'))pending.push(chat);
 if(!pending.length){await put(env,STATUS,{seq:evt.seq,state:'duplicate',at:fresh()});return;}
 let bytes;
 try{const old=await env.R2.get(stem+'.png');bytes=old?new Uint8Array(await old.arrayBuffer()):await screenshot(env,evt);if(!old)await env.R2.put(stem+'.png',bytes,{httpMetadata:{contentType:'image/png'}});}
 catch(e){await put(env,STATUS,{seq:evt.seq,state:'capture_failed',at:fresh(),detail:String(e.message).slice(0,150)});return;}
 const results=await Promise.all(pending.map(async chat=>{
  if(fresh()-evt.at>MAX_AGE||!(await get(env,CONFIG,{})).enabled)return 'skipped';
  let replyId=null;
  if(cfg.replyToEntry===true&&typeof reply==='function'){try{const id=await reply(chat,evt);if(Number.isSafeInteger(id)&&id>0)replyId=id;}catch{}}
  const key=stem+'/'+chat+'.json';const row={seq:evt.seq,state:'inflight',at:fresh()};
  const lock=await env.R2.put(key,JSON.stringify(row),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});if(!lock)return 'duplicate';
  try{const form=new FormData();form.append('chat_id',chat);if(replyId!==null)form.append('reply_parameters',JSON.stringify({message_id:replyId,allow_sending_without_reply:true}));form.append('photo',new Blob([bytes],{type:'image/png'}),'nexo-rodada-'+evt.seq+'.png');const result=await send(form);if(!Number.isInteger(result?.message_id))throw Error('Entrega não confirmada');await put(env,key,{...row,state:'sent',messageId:result.message_id});return 'sent';}
  catch{await put(env,key,{...row,state:'uncertain'});return 'uncertain';}
 }));
 await put(env,STATUS,{seq:evt.seq,state:results.includes('uncertain')?'uncertain':results.includes('sent')?'sent':'skipped',sent:results.filter(x=>x==='sent').length,at:fresh()});
}

// Enqueue only an already-settled, stored result. No browser or Telegram call here.
export async function queueCapture(env,evt){
 if(evt?.gameId!=='blitz-double'||!['win_black','win_red','win_white','red'].includes(evt.type)||!valid(evt)||!Number.isSafeInteger(evt.at)||fresh()-evt.at>MAX_AGE||fresh()<evt.at-5||typeof evt.id!=='string'||!evt.id||!/^[a-zA-Z0-9_-]{1,90}$/.test(String(evt.roundId)))return false;
 const cfg={...defaults,...await get(env,CONFIG,{})};
 if(!cfg.enabled||!cfg.previewAt||evt.at<(cfg.enabledSince||0)||(evt.type==='red'&&!cfg.includeRed))return false;
 const key=QUEUE+String(evt.seq).padStart(16,'0')+'-'+evt.roundId+'.json';
 const record={id:evt.id,strategyId:evt.strategyId||null,entryRoundId:evt.entryRoundId||null,gameId:evt.gameId,seq:evt.seq,number:evt.number,color:evt.color,minute_epoch:evt.minute_epoch,roundId:evt.roundId,type:evt.type,at:evt.at};
 return !!await env.R2.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
}
// Independent scheduled invocation. Bounded work; no automatic resend after an uncertain delivery.
export async function drainCaptureQueue(env,opts){
 if(!env.R2)return;
 const cfg={...defaults,...await get(env,CONFIG,{})};
 const page=await env.R2.list({prefix:QUEUE,limit:20});let count=0;
 for(const item of page.objects||[]){
  const evt=await get(env,item.key,null);
  if(!evt||!cfg.enabled||evt.at<(cfg.enabledSince||0)||fresh()-evt.at>MAX_AGE){await env.R2.delete(item.key);continue;}
  if(count++>=3)break;
  const claim=ROOT+'claims-v2/'+item.key.slice(QUEUE.length);
  const lock=await env.R2.put(claim,JSON.stringify({at:fresh()}),{onlyIf:{etagDoesNotMatch:'*'}});
  if(!lock){continue;}
  try{await captureResult(env,evt,opts);}
  catch(e){await put(env,STATUS,{seq:evt.seq,state:'capture_failed',at:fresh(),detail:'Falha de processamento da imagem; consulte os logs do Worker'});}
  finally{await env.R2.delete(item.key);}
 }
}
