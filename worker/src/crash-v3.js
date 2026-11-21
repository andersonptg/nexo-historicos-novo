import {readNewestCrash} from './crash-v69-source.js';
import {analyzeCrashAllFast} from './nexo-crash-v692-fast.js';
// NEXO Crash V3: bot, media and signals isolated from Double.
// NEVER queues automatic Telegram messages. Only explicit private tests.
const ROOT='nexo-crash-v2/';
const OWNER='nexo-v3/telegram/owner.json';
const DOUBLE_BOT='nexo-v3/telegram/bot-encrypted.json';
const T=[2,5,10,20,25,50,100];
const ANALYSIS_TARGETS=[2,5,10,25,50,100];
const enc=new TextEncoder();
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const out=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:H});
const read=async(e,k,f)=>{const o=await e.R2.get(k);return o?await o.json():structuredClone(f)};
const put=(e,k,v)=>e.R2.put(k,JSON.stringify(v),{httpMetadata:{contentType:'application/json'}});
const KEY=ROOT+'telegram/bot.json',LIB=ROOT+'telegram/media.json',CFG=ROOT+'signal-config-v3.json';
const blank=(text='')=>({text,kind:'text',assetId:''});
const base=()=>({version:3,targets:Object.fromEntries(T.map(t=>[String(t),{entry:blank('🎯 CRASH | ENTRADA\nAlvo: '+t+'x'),green:blank('✅ GREEN '+t+'x\nVela: {vela}x')} ])),red:blank('❌ RED | A vela não atingiu o alvo.')});
const b64=b=>btoa(String.fromCharCode(...b)),un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function ready(e){if(typeof e.NEXO_BOT_ENCRYPTION_KEY!=='string'||e.NEXO_BOT_ENCRYPTION_KEY.length<32)throw Error('Configure NEXO_BOT_ENCRYPTION_KEY na Cloudflare antes de cadastrar o bot Crash.');}
async function aes(e){ready(e);const raw=await crypto.subtle.digest('SHA-256',enc.encode('NEXO Crash V3 '+e.NEXO_BOT_ENCRYPTION_KEY));return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(e,token){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('NEXO-Crash-V3-Only')},await aes(e),enc.encode(token));return {iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};}
async function unseal(e,row){if(!row?.ciphertext)throw Error('Bot Crash não configurado.');const b=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(row.iv),additionalData:enc.encode('NEXO-Crash-V3-Only')},await aes(e),un64(row.ciphertext));return new TextDecoder().decode(b);}
async function webhookSecret(e,botId){ready(e);const b=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('nexo-crash-webhook-v3|'+e.NEXO_BOT_ENCRYPTION_KEY+'|'+botId)));return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function equalSecret(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<b.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function telegram(token,method,payload){const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
 let x;try{x=await response.json()}catch{throw Error('Telegram indisponível.')}if(!response.ok||!x.ok)throw Error('Telegram '+method+': '+String(x.description||response.status).slice(0,100));return x.result;}
function normalize(src,lib){
 if(!src||typeof src!=='object')throw Error('Configuração inválida');
 const norm=x=>{if(!x||typeof x!=='object')throw Error('Mensagem inválida');const kind=String(x.kind||'text'),text=String(x.text||'').slice(0,900),assetId=String(x.assetId||'');
  if(!['text','sticker','gif'].includes(kind))throw Error('Tipo de mensagem inválido');
  if(kind==='text')return {kind,text,assetId:''};
  if(!/^[a-f0-9]{32}$/i.test(assetId)||!lib.some(z=>z.id===assetId&&z.kind===kind))throw Error('Escolha um '+kind+' recebido pelo bot do Crash');
  return {kind,text,assetId};};
 const o={version:3,targets:{},red:norm(src.red)};
 for(const t of T){const x=src.targets?.[String(t)]||(t===25?base().targets['25']:null);if(!x)throw Error('Configure o alvo '+t+'x');o.targets[String(t)]={entry:norm(x.entry),green:norm(x.green)}}return o;
}
function format(s,target,strategy=''){return String(s||'').replace(/\{alvo\}/gi,String(target)).replace(/\{estrategia\}/gi,strategy).replace(/\{vela\}/gi,'—');}
async function handleWebhook(req,env,u){
 const bot=await read(env,KEY,null);if(!bot)return out({ok:false},404);
 const secret=await webhookSecret(env,bot.botId);
 if(!await equalSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'),secret))return out({ok:false},401);
 const raw=await req.text();if(raw.length>60000)return out({ok:false},413);
 let update;try{update=JSON.parse(raw)}catch{return out({ok:false},400)}
 const msg=update?.message;
 if(!msg||msg.chat?.type!=='private'||String(msg.from?.id||'')!==String(msg.chat?.id||''))return out({ok:true});
 const owner=await read(env,OWNER,null);
 if(!owner?.id||String(owner.id)!==String(msg.from.id))return out({ok:true});
 const sticker=msg.sticker;
 const animation=msg.animation||(msg.document?.mime_type==='image/gif'?msg.document:null);
 const file=sticker||animation;if(!file?.file_id)return out({ok:true});
 const kind=sticker?'sticker':'gif',unique=String(file.file_unique_id||file.file_id).slice(0,120),lib=await read(env,LIB,[]);
 const exists=lib.some(x=>x.kind===kind&&x.fileUniqueId===unique);
 if(!exists){
  if(lib.length>=200)return out({ok:true});
  const item={id:crypto.randomUUID().replaceAll('-',''),name:(kind==='sticker'?'STICKER '+String(sticker.emoji||''):'GIF')+' · '+new Date().toLocaleDateString('pt-BR'),kind,origin:'telegram-crash',fileId:file.file_id,fileUniqueId:unique,previewFileId:file.thumbnail?.file_id||file.file_id,createdAt:Date.now()};
  await put(env,LIB,[...lib,item]);
 }
 // Acknowledgment to the same verified private chat; never a signal to a group.
 try{await telegram(await unseal(env,bot),'sendMessage',{chat_id:owner.id,text:exists?'ℹ️ Esta mídia já está na biblioteca do Crash.':'✅ Sticker/GIF do Crash recebido! Escolha-o em ADM → Crash → GREEN ou RED.'});}catch{}
 return out({ok:true});
}
export async function crashV3Public(req,env,u,{analyze}={}){
 if(!env.R2)return null;
 if(u.pathname==='/api/crash/telegram/webhook'&&req.method==='POST')return handleWebhook(req,env,u);
 if(u.pathname!=='/api/crash/analysis-all'||req.method!=='GET')return null;
 const length=Number(u.searchParams.get('length')??0),minimum=Number(u.searchParams.get('minimum')||3),minHits=Number(u.searchParams.get('min_hits')||1);
 if(!Number.isInteger(length)||length<0||length>12||!Number.isInteger(minimum)||minimum<1||minimum>100||!Number.isInteger(minHits)||minHits<1||minHits>100)return out({ok:false,error:'Filtros inválidos'},400);
 const hist=await readNewestCrash(env);
 const analyses=analyzeCrashAllFast(hist.items||[],{targets:ANALYSIS_TARGETS,length,minimum,minHits,gaps:hist.gaps||[]});
 return out({ok:true,analyses,updated_at:hist.updated_at||null,source:hist.source_label,precision:'minute',length,minimum,minHits});
}
export async function crashV3Admin(req,env,u,{ownerId}={}){
 if(!u.pathname.startsWith('/api/adm/crash/v3/'))return null;
 const action=u.pathname.slice('/api/adm/crash/v3/'.length);
 const lib=()=>read(env,LIB,[]),config=()=>read(env,CFG,base()),bot=()=>read(env,KEY,null);
 if(action==='bot'&&req.method==='GET'){const b=await bot();return out({ok:true,connected:!!b,username:b?.username||'',ownerPaired:!!ownerId});}
 if(action==='bot'&&req.method==='POST'){
  if(!ownerId)return out({ok:false,error:'Vincule primeiro seu ID privado no ADM Telegram do Double. Será reutilizado no Crash.'},400);
  let x;try{x=await req.json()}catch{return out({ok:false,error:'JSON inválido'},400)}
  const token=String(x?.token||'').trim();if(!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token))return out({ok:false,error:'Token de bot Telegram inválido'},400);
  ready(env);
  let info,webhook;
  try{info=await telegram(token,'getMe',{});if(!info?.is_bot||!info.id)throw Error('Token não pertence a um bot');webhook=await telegram(token,'getWebhookInfo',{});}catch(e){return out({ok:false,error:'Não foi possível validar o token Crash no Telegram: '+e.message},400)}
  const double=await read(env,DOUBLE_BOT,null);
  if(double?.botId&&String(double.botId)===String(info.id))return out({ok:false,error:'Este é o bot do Double. Use um bot exclusivo para Crash.'},409);
  const dest=u.origin+'/api/crash/telegram/webhook';
  if(webhook?.url&&webhook.url!==dest)return out({ok:false,error:'Este bot já tem webhook em outro sistema. Não será substituído.'},409);
  const existing=await bot();if(existing&&String(existing.botId)!==String(info.id))return out({ok:false,error:'Já existe outro bot Crash vinculado. Para trocar, use o procedimento de substituição segura.'},409);
  const secret=await webhookSecret(env,info.id);
  try{await telegram(token,'setWebhook',{url:dest,secret_token:secret,allowed_updates:['message'],drop_pending_updates:false});}
  catch{return out({ok:false,error:'Não foi possível registrar o webhook Crash.'},502)}
  await put(env,KEY,{version:3,botId:String(info.id),username:String(info.username||''),...await seal(env,token),configuredAt:Date.now()});
  return out({ok:true,connected:true,username:String(info.username||''),ownerPaired:true});
 }
 if(action==='signals'&&req.method==='GET'){
  const [cfg,media,b,strategies]=await Promise.all([config(),lib(),bot(),read(env,ROOT+'strategies.json',[])]);
  return out({ok:true,config:cfg,media:media.map(x=>({id:x.id,name:String(x.name||'').slice(0,120),kind:x.kind,origin:'telegram-crash'})),bot:{connected:!!b,username:b?.username||'',ownerPaired:!!ownerId},strategies:strategies.map(s=>({id:s.id,name:s.name,target:s.target}))});
 }
 if(action==='signals'&&req.method==='PUT'){
  const raw=await req.text();if(raw.length>35000)return out({ok:false,error:'Configuração extensa'},413);
  let data;try{data=normalize(JSON.parse(raw),await lib())}catch(e){return out({ok:false,error:String(e.message)},400)}
  await put(env,CFG,data);return out({ok:true,config:data});
 }
 if(action.startsWith('media/')&&req.method==='GET'){
  const id=action.slice('media/'.length);if(!/^[a-f0-9]{32}$/i.test(id))return out({ok:false},404);
  const meta=(await lib()).find(x=>x.id===id);if(!meta)return out({ok:false},404);
  const b=await bot();if(!b)return out({ok:false,error:'Bot Crash não configurado'},409);
  const token=await unseal(env,b);
  const fileId=(meta.kind==='gif'&&u.searchParams.get('motion')==='1'?meta.fileId:meta.previewFileId)||meta.fileId;
  let file;try{file=await telegram(token,'getFile',{file_id:fileId});}catch{return out({ok:false,error:'Prévia indisponível'},502)}
  if(!file?.file_path||Number(file.file_size||0)>20*1024*1024)return out({ok:false,error:'Prévia indisponível'},404);
  const res=await fetch('https://api.telegram.org/file/bot'+token+'/'+file.file_path,{signal:AbortSignal.timeout(10000)});
  if(!res.ok)return out({ok:false,error:'Arquivo indisponível'},502);
  const ext=file.file_path.split('.').pop()?.toLowerCase();const mime={webp:'image/webp',png:'image/png',gif:'image/gif',jpg:'image/jpeg',jpeg:'image/jpeg',mp4:'video/mp4',webm:'video/webm'}[ext]||'application/octet-stream';
  return new Response(res.body,{headers:{'Content-Type':mime,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
 }
 if(action==='test-private'&&req.method==='POST'){
  if(!ownerId)return out({ok:false,error:'Vincule o ID no ADM Telegram do Double.'},400);
  let x;try{x=await req.json()}catch{return out({ok:false,error:'JSON inválido'},400)}
  const target=Number(x?.target),event=String(x?.event||'');if(!T.includes(target)||!['entry','green','red'].includes(event))return out({ok:false,error:'Alvo ou evento inválido'},400);
  const cfg=await config();let doc=event==='red'?cfg.red:cfg.targets?.[String(target)]?.[event];if(!doc)return out({ok:false,error:'Mensagem não configurada'},400);
  let strategyName='';
  if(x?.strategyId){const ss=await read(env,ROOT+'strategies.json',[]),strategy=ss.find(s=>s.id===x.strategyId&&Number(s.target)===target);if(!strategy)return out({ok:false,error:'Estratégia não encontrada para este alvo'},404);strategyName=strategy.name;const override=event==='entry'?strategy.entryText:event==='green'?strategy.greenText:'';if(override)doc={...doc,text:override};}
  const b=await bot();if(!b)return out({ok:false,error:'Cadastre primeiro o token do bot Crash.'},409);
  const token=await unseal(env,b);let asset=null;
  if(doc.kind!=='text'){asset=(await lib()).find(a=>a.id===doc.assetId&&a.kind===doc.kind);if(!asset)return out({ok:false,error:'Sticker/GIF não cadastrado no bot Crash'},409);}
  let result;
  try{
   const msg=format(doc.text,target,strategyName);if(msg.trim())result=await telegram(token,'sendMessage',{chat_id:ownerId,text:msg});
   if(asset){const method=doc.kind==='gif'?'sendAnimation':'sendSticker';result=await telegram(token,method,{chat_id:ownerId,[doc.kind==='gif'?'animation':'sticker']:asset.fileId});}
   if(!result)return out({ok:false,error:'Texto e mídia vazios'},400);
  }catch(e){return out({ok:false,error:'Falha no teste privado do bot Crash: '+e.message+'; abra o bot Crash e envie /start antes do teste.'},502)}
  return out({ok:true,private_only:true,telegram_message_id:result.message_id||null});
 }
 return out({ok:false,error:'Rota Crash V3 desconhecida'},404);
}
