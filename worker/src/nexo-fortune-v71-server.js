/* NEXO V7.1: exclusive Blitz Fortune Double settings, bot and validation.
 * R2 path is independent from nexo-v3 (Double) and nexo-crash-v2.
 * Telegram dispatch is explicit/private-or-selected-test only in this version.
 */
import {GAME_ID,TARGETS,COLORS,cleanRule,validateFortune,cleanPattern} from './nexo-fortune-v71-core.js';
const ROOT='nexo-fortune-v71/';
const OWNER='nexo-v3/telegram/owner.json';
const LEGACY_DOUBLE='nexo-v3/telegram/bot-encrypted.json';
const LEGACY_CRASH='nexo-crash-v2/telegram/bot.json';
const HISTORY='nexo-cloud-v5/games/blitz-fortune-double/history.json';
const DOC={bot:ROOT+'telegram/bot.json',groups:ROOT+'telegram/groups.json',strategies:ROOT+'strategies.json',media:ROOT+'telegram/media.json',templates:ROOT+'telegram/templates.json'};
const EVENTS=['attention','entry','gale1','gale2','green','red'];
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEAD});
const get=async(env,key,fallback)=>{const object=await env.R2.get(key);return object?await object.json():structuredClone(fallback)};
const put=(env,key,data)=>env.R2.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
const owner=async env=>String((await get(env,OWNER,null))?.id||'');
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const un64=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
function keyPresent(env){return typeof env.NEXO_BOT_ENCRYPTION_KEY==='string'&&env.NEXO_BOT_ENCRYPTION_KEY.length>=32;}
async function cryptoKey(env){if(!keyPresent(env))throw Error('Configure NEXO_BOT_ENCRYPTION_KEY no Worker.');const raw=await crypto.subtle.digest('SHA-256',enc.encode('NEXO-FORTUNE-V71|'+env.NEXO_BOT_ENCRYPTION_KEY));return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(env,token){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('nexo-fortune-v71-bot')},await cryptoKey(env),enc.encode(token));return {ciphertext:b64(new Uint8Array(cipher)),iv:b64(iv)};}
async function openToken(env,doc){if(!doc?.ciphertext)throw Error('Robô Fortune não cadastrado.');const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(doc.iv),additionalData:enc.encode('nexo-fortune-v71-bot')},await cryptoKey(env),un64(doc.ciphertext));return new TextDecoder().decode(raw);}
async function digestSecret(env,botId){if(!keyPresent(env))throw Error('Falta Secret de criptografia.');const raw=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('Fortune-webhook-v71|'+env.NEXO_BOT_ENCRYPTION_KEY+'|'+botId)));return Array.from(raw,x=>x.toString(16).padStart(2,'0')).join('');}
function equalSecret(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<b.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
async function telegram(token,method,body={}){
 const req=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 let data;try{data=await req.json()}catch{throw Error('Resposta do Telegram inválida.');}
 if(!req.ok||data?.ok!==true)throw Error('Telegram '+method+': '+String(data?.description||req.status).slice(0,110));
 return data.result;
}
function mediaView(media){return (Array.isArray(media)?media:[]).map(m=>({id:m.id,name:m.name,kind:m.kind,createdAt:m.createdAt}));}
function msgKey(target,event){if(!Object.hasOwn(TARGETS,target)||!EVENTS.includes(event))throw Error('Alvo/evento inválido.');return target+':'+event;}
function defaultText(target,event){const names={red_gold:'VERMELHO + PANDA',purple_gold:'ROXO + PANDA',red:'VERMELHO',purple:'ROXO',gold:'PANDA'};const n=names[target]||'';return ({attention:'⚠️ POSSÍVEL PADRÃO · FORTUNE DOUBLE',entry:'🎯 ENTRADA FORTUNE\nALVO: '+n,gale1:'1️⃣ GALE 1 · '+n,gale2:'2️⃣ GALE 2 · '+n,green:'✅ GREEN · '+n+'\n{panda_x}',red:'❌ RED · '+n})[event]||'';}
function displayTemplate(input,media){const kind=String(input?.kind||'text');if(!['text','sticker','gif'].includes(kind))throw Error('Tipo de mensagem inválido.');const text=String(input?.text||'').slice(0,900);const assetId=kind==='text'?'':String(input?.assetId||'');if(kind!=='text'&&!media.some(m=>m.id===assetId&&m.kind===kind))throw Error('Sticker/GIF não está na biblioteca Fortune.');return {kind,text,assetId};}
function interpolate(text,info){return String(text).replace(/\{(alvo|estrategia|gale|cor|panda_x)\}/gi,(_m,k)=>String(info[k.toLowerCase()]??''));}
async function handleWebhook(request,env){
 const bot=await get(env,DOC.bot,null);if(!bot)return json({ok:false,error:'Bot Fortune não cadastrado'},404);
 if(!equalSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),await digestSecret(env,bot.id)))return json({ok:false,error:'Não autorizado'},401);
 const raw=await request.text();if(raw.length>60000)return json({ok:false,error:'Mensagem muito grande'},413);
 let update;try{update=JSON.parse(raw)}catch{return json({ok:false,error:'JSON inválido'},400)}
 const change=update.my_chat_member;
 if(change?.chat&&['group','supergroup'].includes(change.chat.type)){
  const groups=await get(env,DOC.groups,[]),id=String(change.chat.id),status=String(change.new_chat_member?.status||'');
  const admin=['administrator','creator'].includes(status),previous=groups.find(x=>x.id===id);
  const next={id,name:String(change.chat.title||id).slice(0,110),admin,selected:admin&&previous?.selected===true,lastSeenAt:Date.now()};
  await put(env,DOC.groups,[...groups.filter(x=>x.id!==id),next].slice(-200));
  return json({ok:true});
 }
 const msg=update.message;if(!msg?.chat)return json({ok:true});
 if(['group','supergroup'].includes(msg.chat.type)){
  const body=String(msg.text||'');if(!/^\/nexo_grupo(?:@\w+)?(?:\s|$)/i.test(body))return json({ok:true});
  const id=String(msg.chat.id),token=await openToken(env,bot);
  try{
   const perm=await telegram(token,'getChatMember',{chat_id:id,user_id:bot.id});const isAdmin=['administrator','creator'].includes(perm.status);
   const groups=await get(env,DOC.groups,[]),prior=groups.find(x=>x.id===id);
   await put(env,DOC.groups,[...groups.filter(x=>x.id!==id),{id,name:String(msg.chat.title||id).slice(0,110),admin:isAdmin,selected:isAdmin&&prior?.selected===true,lastSeenAt:Date.now()}].slice(-200));
  }catch(e){console.warn('Fortune grupo: verificação falhou',String(e?.message||e).slice(0,100));}
  return json({ok:true});
 }
 if(msg.chat.type!=='private'||String(msg.from?.id)!==await owner(env))return json({ok:true});
 const sticker=msg.sticker,animation=msg.animation||(msg.document?.mime_type==='image/gif'?msg.document:null),file=sticker||animation;
 if(!file?.file_id)return json({ok:true});
 const kind=sticker?'sticker':'gif',unique=String(file.file_unique_id||file.file_id).slice(0,125);
 const items=await get(env,DOC.media,[]);
 if(items.length<200&&!items.some(m=>m.kind===kind&&m.unique===unique)){
  const item={id:crypto.randomUUID().replaceAll('-',''),name:(kind==='sticker'?'Sticker':'GIF')+' · '+new Date().toLocaleDateString('pt-BR'),kind,fileId:String(file.file_id),previewFileId:String(file.thumbnail?.file_id||file.file_id),unique,createdAt:Date.now()};
  await put(env,DOC.media,[...items,item]);
 }
 return json({ok:true});
}
export async function fortunePublic(request,env,url){
 if(url.pathname!=='/api/fortune/telegram/webhook')return null;
 if(request.method!=='POST')return json({ok:false,error:'Método inválido'},405);
 if(!env.R2)return json({ok:false,error:'R2 não configurado'},503);
 return handleWebhook(request,env);
}
export async function fortuneAdmin(request,env,url){
 if(!url.pathname.startsWith('/api/adm/fortune/'))return null;
 // Call only AFTER routeAdmin() authenticates the admin cookie.
 if(!env.R2)return json({ok:false,error:'R2 indisponível'},503);
 const action=url.pathname.slice('/api/adm/fortune/'.length),method=request.method;
 const groups=()=>get(env,DOC.groups,[]),strategies=()=>get(env,DOC.strategies,[]),media=()=>get(env,DOC.media,[]),templates=()=>get(env,DOC.templates,{});
 const body=async()=>{const text=await request.text();if(text.length>70000)throw Error('Corpo muito extenso.');return JSON.parse(text||'{}')};
 try{
  if(action==='bootstrap'&&method==='GET'){
   const [bot,gs,ss,ms,tmpl,hist,own]=await Promise.all([get(env,DOC.bot,null),groups(),strategies(),media(),templates(),get(env,HISTORY,{items:[],gaps:[]}),owner(env)]);
   return json({ok:true,game_id:GAME_ID,bot:{connected:!!bot,username:bot?.username||'',id:bot?.id||null,ownerPaired:!!own,signalsAutomatic:false},groups:gs,strategies:ss.filter(s=>!s.archived),media:mediaView(ms),templates:tmpl,
    history:{items:(hist.items||[]).slice(0,200),updated_at:hist.updated_at||null,gaps:hist.gaps||[],precision:'minute'},isolation:'blitz-fortune-double'});
  }
  if(action==='history'&&method==='GET'){
   const hist=await get(env,HISTORY,{items:[],gaps:[]});const limit=Math.max(20,Math.min(1200,Number(url.searchParams.get('limit'))||800));
   return json({ok:true,game_id:GAME_ID,items:(hist.items||[]).slice(0,limit),gaps:hist.gaps||[],updated_at:hist.updated_at||null,precision:'minute'});
  }
  if(action==='validate'&&method==='POST'){
   const input=await body();if(input.gameId&&input.gameId!==GAME_ID)return json({ok:false,error:'Histórico de outro jogo não pode ser validado aqui.'},400);
   const pattern=cleanPattern(input.pattern),target=String(input.target),maxGale=Number(input.maxGale??0);
   const hist=await get(env,HISTORY,{items:[],gaps:[]});return json({ok:true,...validateFortune(hist,{pattern,target,maxGale}),updated_at:hist.updated_at||null});
  }
  if(action==='strategies'&&method==='POST'){
   const list=await strategies();if(list.filter(s=>!s.archived).length>=500)return json({ok:false,error:'Limite de 500 estratégias.'},409);
   const saved=cleanRule({...await body(),enabled:false}); // Always create in paused mode.
   await put(env,DOC.strategies,[...list,saved]);return json({ok:true,strategy:saved});
  }
  if(action.startsWith('strategies/')&&['PUT','DELETE'].includes(method)){
   const id=action.slice('strategies/'.length);if(!/^[0-9a-f]{32}$/i.test(id))return json({ok:false,error:'ID inválido'},400);
   const list=await strategies(),index=list.findIndex(s=>s.id===id&&!s.archived);if(index<0)return json({ok:false,error:'Estratégia não encontrada'},404);
   if(method==='DELETE'){list[index]={...list[index],enabled:false,archived:true,updatedAt:Date.now()};await put(env,DOC.strategies,list);return json({ok:true,archived:true});}
   const saved=cleanRule(await body(),list[index]);list[index]=saved;await put(env,DOC.strategies,list);return json({ok:true,strategy:saved});
  }
  if(action==='bot/connect'&&method==='POST'){
   const ownerId=await owner(env);if(!ownerId)return json({ok:false,error:'Vincule primeiro seu ID privado no ADM do Double.'},409);
   const info=await body(),token=String(info.token||'').trim();if(!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token))return json({ok:false,error:'Token do Telegram inválido.'},400);
   if(!keyPresent(env))return json({ok:false,error:'Falta Secret NEXO_BOT_ENCRYPTION_KEY no Worker.'},409);
   const me=await telegram(token,'getMe');if(!me?.is_bot||!me?.id)throw Error('Token não pertence a um robô válido.');
   const [doubleBot,crashBot,existing,hook]=await Promise.all([get(env,LEGACY_DOUBLE,null),get(env,LEGACY_CRASH,null),get(env,DOC.bot,null),telegram(token,'getWebhookInfo')]);
   if(token===env.NEXO_TELEGRAM_BOT_TOKEN||[doubleBot?.botId,crashBot?.botId].some(x=>x&&String(x)===String(me.id)))return json({ok:false,error:'Use um bot EXCLUSIVO para Fortune. Este token pertence ao Double ou Crash.'},409);
   if(existing&&String(existing.id)!==String(me.id))return json({ok:false,error:'Outro bot Fortune já está vinculado. Substituição automática não é permitida.'},409);
   const desired=url.origin+'/api/fortune/telegram/webhook';if(hook?.url&&hook.url!==desired)return json({ok:false,error:'Este bot usa webhook em outro sistema. Não foi substituído.'},409);
   const secret=await digestSecret(env,me.id);
   await telegram(token,'setWebhook',{url:desired,secret_token:secret,allowed_updates:['message','my_chat_member'],drop_pending_updates:false});
   await put(env,DOC.bot,{id:String(me.id),username:String(me.username||''),...await seal(env,token),configuredAt:Date.now()});
   return json({ok:true,connected:true,username:String(me.username||''),ownerPaired:true});
  }
  if(action==='groups/refresh'&&method==='POST'){
   const bot=await get(env,DOC.bot,null);if(!bot)return json({ok:false,error:'Cadastre o bot Fortune primeiro.'},409);
   const token=await openToken(env,bot),items=await groups(),results=[];
   for(const g of items.slice(0,8)){
    try{const x=await telegram(token,'getChatMember',{chat_id:g.id,user_id:bot.id});const admin=['administrator','creator'].includes(x.status);results.push({...g,admin,selected:g.selected===true&&admin,checkedAt:Date.now()});}
    catch{results.push({...g,admin:false,selected:false,lastCheckError:true})}
   }
   const merged=[...results,...items.slice(8)];await put(env,DOC.groups,merged);return json({ok:true,groups:merged,partial:items.length>8,notice:'O Telegram só permite conferir grupos já descobertos por atualizações recebidas.'});
  }
  if(action==='groups'&&method==='PUT'){
   const input=await body();const selected=new Set((Array.isArray(input.ids)?input.ids:[]).map(String));
   const items=await groups();if([...selected].some(id=>!items.some(g=>g.id===id&&g.admin)))return json({ok:false,error:'Seleção contém grupo sem autorização ADM do bot.'},409);
   const next=items.map(g=>({...g,selected:g.admin===true&&selected.has(g.id)}));await put(env,DOC.groups,next);return json({ok:true,groups:next});
  }
  if(action==='template'&&method==='PUT'){
   const payload=await body(),key=msgKey(String(payload.target),String(payload.event));const ms=await media(),saved=displayTemplate(payload,ms);
   const obj=await templates();obj[key]=saved;await put(env,DOC.templates,obj);return json({ok:true,key,template:saved});
  }
  if(action==='media'&&method==='GET')return json({ok:true,media:mediaView(await media())});
  if(action.startsWith('media/')&&method==='GET'){
   const id=action.slice(6);if(!/^[a-f0-9]{32}$/i.test(id))return json({ok:false,error:'Mídia não encontrada'},404);
   const asset=(await media()).find(m=>m.id===id),bot=await get(env,DOC.bot,null);if(!asset||!bot)return json({ok:false,error:'Mídia não disponível'},404);
   const token=await openToken(env,bot),remote=await telegram(token,'getFile',{file_id:url.searchParams.get('motion')==='1'?asset.fileId:(asset.previewFileId||asset.fileId)});
   if(!remote?.file_path||Number(remote.file_size||0)>20*1024*1024)return json({ok:false,error:'Prévia indisponível'},404);
   const response=await fetch('https://api.telegram.org/file/bot'+token+'/'+remote.file_path,{signal:AbortSignal.timeout(10000)});
   if(!response.ok)return json({ok:false,error:'Arquivo não disponível'},502);
   const ext=remote.file_path.split('.').pop()?.toLowerCase(),mime={webp:'image/webp',png:'image/png',gif:'image/gif',jpg:'image/jpeg',mp4:'video/mp4' }[ext]||'application/octet-stream';
   return new Response(response.body,{headers:{'Content-Type':mime,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
  }
  if(action==='bot/test'&&method==='POST'){
   const input=await body(),target=String(input.target),event=String(input.event);const key=msgKey(target,event);
   const bot=await get(env,DOC.bot,null);if(!bot)return json({ok:false,error:'Robô Fortune não cadastrado'},409);
   const own=await owner(env);if(!own)return json({ok:false,error:'ID do administrador não verificado'},409);
   let chatId=own;const requested=String(input.groupId||'');
   if(requested){const gs=await groups();if(!gs.some(g=>g.id===requested&&g.admin&&g.selected))return json({ok:false,error:'Grupo não selecionado ou bot não é administrador.'},409);chatId=requested;}
   const tpl=(await templates())[key]||{kind:'text',text:defaultText(target,event),assetId:''};
   const label={red_gold:'VERMELHO + PANDA',purple_gold:'ROXO + PANDA',red:'VERMELHO',purple:'ROXO',gold:'PANDA'}[target];
   const txt=interpolate(tpl.text,{alvo:label,estrategia:'TESTE MANUAL',cor:label,gale:event==='gale1'?1:event==='gale2'?2:0,panda_x:'Panda: multiplicador somente quando confirmado'});
   const token=await openToken(env,bot);let sent=0;
   if(txt.trim()){await telegram(token,'sendMessage',{chat_id:chatId,text:'🧪 TESTE FORTUNE · '+txt});sent++;}
   if(tpl.kind!=='text'){
    const asset=(await media()).find(m=>m.id===tpl.assetId&&m.kind===tpl.kind);if(!asset)return json({ok:false,error:'Mídia não cadastrada.'},409);
    await telegram(token,tpl.kind==='gif'?'sendAnimation':'sendSticker',{chat_id:chatId,[tpl.kind==='gif'?'animation':'sticker']:asset.fileId});sent++;
   }
   if(!sent)return json({ok:false,error:'Mensagem de teste vazia; configure texto ou mídia.'},400);
   return json({ok:true,private:!requested,manual:true,events:sent});
  }
  return json({ok:false,error:'Rota Fortune desconhecida'},404);
 }catch(error){console.warn('NEXO Fortune:',String(error?.message||error).slice(0,150));return json({ok:false,error:String(error?.message||error).slice(0,150)},400)}
}
