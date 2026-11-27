// NEXO V3 ADM. Isolated from the V2 history archive and ingestion authentication.
// NEXO V13 BRANCO POR MINUTO
import {routeWhiteAdmin} from './white.js';
// NEXO_BRANCO_VIP_V1
import {brancoVipAdmin} from './branco-vip.js';
import {crashAdmin} from './crash-v2.js';
import {cloudAdmin} from './nexo-cloud-v5.js';
import {crashV3Admin} from './crash-v3.js';
import {fortuneAdmin} from './nexo-fortune-v71-server.js';
import {captureAdmin,queueCapture,drainCaptureQueue,confirmedEntryText} from './nexo-colors-capture-v2.js';
const ROOT='nexo-v3/';
const K={settings:ROOT+'admin/settings.json',strategies:ROOT+'admin/strategies.json',groups:ROOT+'telegram/groups.json',media:ROOT+'media/catalog.json',bot:ROOT+'telegram/bot-encrypted.json',owner:ROOT+'telegram/owner.json',pair:ROOT+'telegram/pair.json'};
const activeGame=env=>env?.NEXO_ACTIVE_GAME==='blitz-double'?'blitz-double':'brabet-double';
const strategyStorage=env=>activeGame(env)==='blitz-double'?ROOT+'admin/strategies-blitz-v1.json':K.strategies;
const E=['attention','entry_black','entry_red','entry_white','gale1','gale2','win_black','win_red','win_white','red'];
const TARGETS=['black','red','white'];
// Limite técnico de segurança para o processamento e armazenamento no Worker.
const MAX_PATTERN_STONES=256;
const UTF=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const idSafe=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,90}$/.test(x);
const err=(message,status=400)=>json({ok:false,error:message},status);
const getDoc=async(env,key,defaultValue)=>{const x=await env.R2.get(key);if(!x)return structuredClone(defaultValue);try{return await x.json()}catch{throw new Error('Arquivo de configuracao danificado: '+key)}};
const putDoc=async(env,key,value)=>env.R2.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
const settingsDefault={botEnabled:false,showNumbers:true,jokerWhite:false,resetMidnight:true,updatedAt:0};
// V7: mensagens globais isoladas; sem migrar/apagar estratégias antigas.
const GLOBAL_KEY=ROOT+'admin/global-signals.json';
// V8: solicitação de ID de administrador, verificada apenas por mensagem real do Telegram.
const OWNER_ID_KEY=ROOT+'telegram/owner-request.json';
const GLOBAL_KEYS=['entry_black','entry_red','entry_white','green','white','red','attention','bot_on','gale1','gale2'];
const GLOBAL_MAP={entry_black:'entry_black',entry_red:'entry_red',entry_white:'entry_white',win_black:'green',win_red:'green',win_white:'white',red:'red',attention:'attention',gale1:'gale1',gale2:'gale2',bot_on:'bot_on'};
const V12_2_AFTER_PATTERN_DEFAULT='🎲 Após pedra: {pedra}';
const emptyGlobal=()=>({version:3,registration:{enabled:false,url:'',label:'🔗 CADASTRE-SE'},afterPattern:{enabled:true,text:V12_2_AFTER_PATTERN_DEFAULT},stone:{enabled:true,text:'🎲 Pedra sorteada: {pedra}'},templates:{},updatedAt:0});
const globalDoc=env=>getDoc(env,GLOBAL_KEY,emptyGlobal());
function validRegistration(r){
 if(!r||typeof r!=='object')throw Error('Dados do link inválidos.');
 const url=String(r.url||'').trim(),label=String(r.label||'🔗 CADASTRE-SE').trim();
 if(url.length>500||label.length>80||!label)throw Error('Link ou descrição longa demais.');
 if(r.enabled===true){
  let u;try{u=new URL(url)}catch{throw Error('Informe uma URL HTTPS válida.')}
  if(u.protocol!=='https:'||u.username||u.password||!u.hostname||url.includes(String.fromCharCode(92)))throw Error('Use apenas um endereço HTTPS público, sem usuário e senha.');
 }
 return {enabled:r.enabled===true,url,label};
}
function normalizeGlobalEvent(key,item,media){
 if(!GLOBAL_KEYS.includes(key))throw Error('Evento global desconhecido.');
 if(!item||typeof item!=='object')throw Error('Mensagem inválida.');
 const type=String(item.type||'text'),text=String(item.text||'');
 if(!['text','sticker','gif'].includes(type)||text.length>1500)throw Error('Texto ou tipo de mídia inválido.');
 if(['gale1','gale2'].includes(key)&&type!=='text')throw Error('GALE 1 e GALE 2 aceitam somente texto.');
 const assetId=type==='text'?'':String(item.assetId||'');
 if(type!=='text'&&(!idSafe(assetId)||!media.some(a=>a.id===assetId&&a.kind===type)))throw Error('Mídia não encontrada na biblioteca do bot.');
 return {text,type,assetId,sendWithMedia:item.sendWithMedia!==false,saved:true,updatedAt:now()};
}

const strategyDefault=()=>({id:crypto.randomUUID().replaceAll('-',''),name:'',gameId:'brabet-double',enabled:false,archived:false,target:'black',pattern:['red','red'],maxGale:0,showStoneBeforeMedia:false,showStoneAfter:true,showAfterPattern:true,showNumbers:true,jokerWhite:false,messages:Object.fromEntries(E.map(x=>[x,''])),media:Object.fromEntries(E.map(x=>[x,{type:'text',assetId:''}])),createdAt:now(),updatedAt:now()});
const scoreDefault=(day)=>({day,entries:0,green:0,white:0,red:0,gale1:0,gale2:0,updatedAt:now()});
const scoreKey=id=>ROOT+'scores/'+id+'.json';
const runtimeKey=id=>ROOT+'runtime/'+id+'.json';
const eventKey=id=>ROOT+'events/'+id+'.json';
const pendingKey=id=>ROOT+'outbox/pending/'+id+'.json';
const sentKey=id=>ROOT+'outbox/sent/'+id+'.json';
// Um registro por pré-aviso: só os IDs enviados pelo robô são elegíveis para exclusão.
const ATTENTION_ROOT=ROOT+'telegram/temporary-attention/';
const ATTENTION_MESSAGES_ROOT=ROOT+'telegram/attention-message-ids/';
const attentionKey=(strategyId,eventId)=>ATTENTION_ROOT+strategyId+'/'+eventId+'.json';
const attentionMessagesPrefix=(strategyId,eventId)=>ATTENTION_MESSAGES_ROOT+strategyId+'/'+eventId+'/';
const attentionMessageKey=(strategyId,eventId,chatId,messageId)=>attentionMessagesPrefix(strategyId,eventId)+String(chatId)+'_'+String(messageId)+'.json';
const attentionRetryKey=(strategyId,eventId)=>ROOT+'telegram/temporary-attention-retry/'+strategyId+'_'+eventId+'.json';
const purgeTaskKey=id=>ROOT+'maintenance/purge/'+id+'.json';
function dayBR(seconds=now()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(seconds*1000));
 const f=k=>parts.find(p=>p.type===k).value;
 return f('year')+'-'+f('month')+'-'+f('day');
}
const isoTime=(s)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s*1000));
const eqHash=async(a,b)=>{
 const ah=new Uint8Array(await crypto.subtle.digest('SHA-256',UTF.encode(String(a))));
 const bh=new Uint8Array(await crypto.subtle.digest('SHA-256',UTF.encode(String(b))));
 let r=0;for(let i=0;i<ah.length;i++)r|=ah[i]^bh[i];return r===0;
};
const sign=async(exp,env)=>{
 const k=await crypto.subtle.importKey('raw',UTF.encode(env.NEXO_ADM_PASSWORD),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,UTF.encode('nexo-v3:'+exp)))).map(x=>x.toString(16).padStart(2,'0')).join('');
};
const hasPassword=e=>typeof e.NEXO_ADM_PASSWORD==='string'&&e.NEXO_ADM_PASSWORD.length>=16;
async function authenticated(request,env){
 if(!hasPassword(env))return false;
 const c=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)nexo_adm_v3=([^;]+)/)?.[1];
 if(!c)return false;
 const m=/^(\d{10})\.([0-9a-f]{64})$/.exec(c);if(!m)return false;
 const exp=Number(m[1]);if(exp<now()||exp>now()+7201)return false;
 return eqHash(m[2],await sign(m[1],env));
}
const sessionCookie=(value,maxage)=>`nexo_adm_v3=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/adm; Max-Age=${maxage}`;
function sameOrigin(req){const o=req.headers.get('Origin');return !o||o===new URL(req.url).origin;}
async function login(req,env){
 if(!hasPassword(env))return err('Defina NEXO_ADM_PASSWORD como Secret do Worker (minimo 16 caracteres).',503);
 let body;try{body=await req.json()}catch{return err('JSON invalido')}
 const ip=req.headers.get('CF-Connecting-IP')||'local';
 const bucket=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',UTF.encode('nexo:'+ip+':'+env.NEXO_ADM_PASSWORD)))).slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=ROOT+'security/logins/'+bucket+'.json';
 const state=await getDoc(env,key,{fails:0,until:0,window:0});
 // Senha correta desbloqueia o proprio dono; tentativas invalidas seguem limitadas.
 const valid=typeof body.password==='string'&&await eqHash(body.password,env.NEXO_ADM_PASSWORD);
 if(state.until>now()&&!valid)return err('Muitas tentativas. Tente novamente mais tarde.',429);
 if(!valid){const recent=now()-state.window<900;state.fails=recent?state.fails+1:1;state.window=recent?state.window:now();state.until=state.fails>=5?now()+900:0;await putDoc(env,key,state);return err('Senha incorreta.',401)}
 await putDoc(env,key,{fails:0,until:0,window:now()});
 const exp=String(now()+7200),sig=await sign(exp,env);
 return json({ok:true,expires_at:Number(exp)},200,{'Set-Cookie':sessionCookie(exp+'.'+sig,7200)});
}
const textLimit=(x,n)=>typeof x==='string'?x.slice(0,n):'';
function validateStrategy(input,previous){
 if(!input||typeof input!=='object')throw Error('Dados da estrategia invalidos');
 const x={...(previous||strategyDefault())};
 x.name=textLimit(input.name,70).trim();if(x.name.length<2)throw Error('Informe nome da estrategia (2 a 70 caracteres).');
 if(input.gameId!==undefined){if(!['brabet-double','blitz-double'].includes(input.gameId))throw Error('Jogo Double invalido.');x.gameId=input.gameId;}
 x.target=TARGETS.includes(input.target)?input.target:'black';
 x.maxGale=Number(input.maxGale);if(![0,1,2].includes(x.maxGale))throw Error('Gale deve ser 0, 1 ou 2.');
 if(!Array.isArray(input.pattern)||input.pattern.length<1||input.pattern.length>MAX_PATTERN_STONES||input.pattern.some(z=>!(['red','black','white','*'].includes(z)||/^(?:n:)(?:[0-9]|1[0-4])$/.test(z))))throw Error('Padrão inválido (1 a '+MAX_PATTERN_STONES+' pedras).');
 x.pattern=[...input.pattern];
 x.showStoneBeforeMedia=input.showStoneBeforeMedia===true;x.showStoneAfter=input.showStoneAfter!==false;x.showAfterPattern=input.showAfterPattern!==false;x.showNumbers=input.showNumbers!==false;x.jokerWhite=input.jokerWhite===true;
 x.messages={};for(const e of E)x.messages[e]=textLimit(input.messages?.[e],1500);
 x.media={};for(const e of E){const m=input.media?.[e];x.media[e]={type:['text','sticker','gif'].includes(m?.type)?m.type:'text',assetId:idSafe(m?.assetId)?m.assetId:''};}
 x.enabled=input.enabled===true; x.archived=previous?.archived||false;
 x.updatedAt=now();x.revision=crypto.randomUUID();return x;
}
const recentR2=async(env,gameId)=>getDoc(env,'nexo-v1/games/'+gameId+'/latest.json',{items:[]});
const list=async(env,prefix,limit=100)=>{let cursor;const rows=[];for(let k=0;k<5&&rows.length<limit;k++){const r=await env.R2.list({prefix,limit:Math.min(500,limit),...(cursor?{cursor}:{})});rows.push(...r.objects);if(!r.truncated||!r.cursor)break;cursor=r.cursor;}return rows.slice(0,limit)};
async function scores(env,strategies){const today=dayBR();return Promise.all(strategies.map(async s=>({id:s.id,name:s.name,...await scoreRead(env,s.id,today)})))}
async function scoreRead(env,id,today=dayBR()){const p=await getDoc(env,scoreKey(id),scoreDefault(today));return p.day===today?p:scoreDefault(today)}
async function resetScore(env,id){const s=scoreDefault(dayBR());await putDoc(env,scoreKey(id),s);return s}
// V4: administrator-managed Telegram bot.  Encryption key is a Worker Secret, NOT stored in R2 or sent to browsers.
const botKeyReady=env=>typeof env.NEXO_BOT_ENCRYPTION_KEY==='string'&&env.NEXO_BOT_ENCRYPTION_KEY.length>=32;
const bytesToB64=arr=>btoa(String.fromCharCode(...arr));
const b64ToBytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function aesKey(env){
 if(!botKeyReady(env))throw Error('Configure o Secret NEXO_BOT_ENCRYPTION_KEY na Cloudflare (minimo 32 caracteres).');
 const hash=await crypto.subtle.digest('SHA-256',UTF.encode(env.NEXO_BOT_ENCRYPTION_KEY));
 return crypto.subtle.importKey('raw',hash,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function sealBot(env,token){const iv=crypto.getRandomValues(new Uint8Array(12));const body=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:UTF.encode('NEXO-V4-BOT')},await aesKey(env),UTF.encode(token)));return {version:1,iv:bytesToB64(iv),ciphertext:bytesToB64(body)};}
async function openBot(env,row){if(!row?.ciphertext)return '';const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(row.iv),additionalData:UTF.encode('NEXO-V4-BOT')},await aesKey(env),b64ToBytes(row.ciphertext));return new TextDecoder().decode(data);}
async function botInfo(env){return getDoc(env,K.bot,null)}
async function botToken(env){const stored=await botInfo(env);if(stored?.ciphertext)return openBot(env,stored);return typeof env.NEXO_TELEGRAM_BOT_TOKEN==='string'?env.NEXO_TELEGRAM_BOT_TOKEN:'';}
async function hasBot(env){const stored=await botInfo(env);return !!stored?.ciphertext||!!env.NEXO_TELEGRAM_BOT_TOKEN;}
async function webhookSecret(env){if(typeof env.NEXO_TELEGRAM_WEBHOOK_SECRET==='string'&&env.NEXO_TELEGRAM_WEBHOOK_SECRET.length>=16)return env.NEXO_TELEGRAM_WEBHOOK_SECRET;
 if(!botKeyReady(env))return '';
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',UTF.encode('nexo-v4-webhook:'+env.NEXO_BOT_ENCRYPTION_KEY)));
 return [...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function tgUsing(token,method,body){
 if(!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token||''))throw Error('Token Telegram invalido');
 const res=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',body:body instanceof FormData?body:JSON.stringify(body),headers:body instanceof FormData?{}:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000)});
 const data=await res.json();if(!res.ok||!data.ok)throw Error('Telegram '+method+': '+String(data.description||res.status).slice(0,120));return data.result;
}
async function tg(env,method,body){return tgUsing(await botToken(env),method,body)}

async function botAdmin(env,chatId,sharedToken='',identity=null){try{const me=identity?await identity():(sharedToken?await tgUsing(sharedToken,'getMe',{}):await tg(env,'getMe',{}));const item=sharedToken?await tgUsing(sharedToken,'getChatMember',{chat_id:chatId,user_id:me.id}):await tg(env,'getChatMember',{chat_id:chatId,user_id:me.id});return ['administrator','creator'].includes(item.status)&&item.can_post_messages!==false}catch{return false}}
const normChat=c=>c&&String(c.id).match(/^-?\d{1,20}$/)&&['group','supergroup','channel'].includes(c.type);
async function discoverChat(env,chat,{force=false}={}){
  if(!normChat(chat))return false;
  const d=await getDoc(env,K.groups,[]),id=String(chat.id),old=d.find(x=>x.id===id);
  // Atualizacoes frequentes nao devem sobrecarregar a API do Telegram e o R2.
  if(!force&&old&&old.type===chat.type&&old.name===String(chat.title||old.name).slice(0,120)&&now()-old.updatedAt<300)return old.admin;
  const permitted=await botAdmin(env,chat.id);
  const row={id,name:String(chat.title||old?.name||'Grupo sem nome').slice(0,120),type:chat.type,admin:permitted,selected:permitted&&(old?.selected||false),updatedAt:now()};
  await putDoc(env,K.groups,[...d.filter(x=>x.id!==id),row].slice(-100));return permitted;
}
async function sendOwnerConfirmation(env,chatId,username){
 await tg(env,'sendMessage',{chat_id:chatId,text:'🟢 ROBÔ CADASTRADO COM SUCESSO!\n\n✅ '+(username?'@'+username:'Seu bot')+' conectado ao NEXO HISTÓRICOS.\n🔐 Cadastro protegido.\n📥 Envie stickers ou GIFs aqui para aparecerem na biblioteca do painel.\n\n⚙️ Os sinais permanecem DESLIGADOS até você ativá-los no ADM.'});
}
async function saveReceivedMedia(env,msg){
 const sticker=msg.sticker,animation=msg.animation||(msg.document?.mime_type==='image/gif'?msg.document:null);
 const media=sticker||animation;if(!media||typeof media.file_id!=='string')return false;
 const kind=sticker?'sticker':'gif',unique=String(media.file_unique_id||media.file_id).slice(0,120);
 const all=await getDoc(env,K.media,[]);
 if(all.some(x=>x.fileUniqueId===unique&&x.kind===kind))return false;
 if(all.length>=200)throw Error('Biblioteca cheia (200 itens).');
 const filename=kind==='sticker'?'STICKER '+String(sticker.emoji||'').slice(0,12):'GIF TELEGRAM';
 const meta={id:crypto.randomUUID().replaceAll('-',''),name:filename+' · '+new Date(now()*1000).toLocaleDateString('pt-BR'),kind,mime:sticker?(sticker.is_animated?'application/x-tgsticker':sticker.is_video?'video/webm':'image/webp'):String(media.mime_type||'video/mp4'),size:Number(media.file_size)||0,createdAt:now(),origin:'telegram',fileId:media.file_id,fileUniqueId:unique,previewFileId:media.thumbnail?.file_id||media.file_id,animated:!!sticker?.is_animated,videoSticker:!!sticker?.is_video};
 await putDoc(env,K.media,[...all,meta]);return true;
}
async function handlePrivateMessage(env,msg){
 const from=String(msg.from?.id||''),chatId=String(msg.chat?.id||'');if(!from||from!==chatId)return;
 const owner=await getDoc(env,K.owner,null),text=String(msg.text||'').trim();
 // O ID isolado nunca valida uma conta: o Telegram precisa entregar mensagem
 // privada com from.id e chat.id iguais ao ID cadastrado no ADM autenticado.
 const requested=await getDoc(env,OWNER_ID_KEY,null);
 if(!owner?.id&&requested?.id===chatId){
   await putDoc(env,K.owner,{id:chatId,pairedAt:now(),method:'telegram-id-verified'});
   const bot=await botInfo(env);await sendOwnerConfirmation(env,chatId,bot?.username||'');
   if(msg.sticker||msg.animation||msg.document?.mime_type==='image/gif')await saveReceivedMedia(env,msg);
   return;
 }
 const pairing=/^\/vincular(?:@\w+)?\s+([A-Za-z0-9_-]{8,32})$/i.exec(text)||/^\/start(?:@\w+)?\s+vincular_([A-Za-z0-9_-]{8,32})$/i.exec(text);
 if(pairing){
   const data=await getDoc(env,K.pair,null),expected=data?.hash||'';
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',UTF.encode(pairing[1].toUpperCase())))).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(!data||data.until<now()||!expected||!await eqHash(digest,expected)){await tg(env,'sendMessage',{chat_id:chatId,text:'⚠️ Código de vinculação inválido ou expirado. Gere outro no painel ADM.'});return;}
   if(owner?.id&&owner.id!==chatId){await tg(env,'sendMessage',{chat_id:chatId,text:'⚠️ Já existe um administrador vinculado a este bot.'});return;}
   await putDoc(env,K.owner,{id:chatId,pairedAt:now()});await env.R2.delete?.(K.pair);
   const bot=await botInfo(env);await sendOwnerConfirmation(env,chatId,bot?.username||'');return;
 }
 if(!owner||owner.id!==chatId){if(/^\/start(?:@\w+)?$/i.test(text))await tg(env,'sendMessage',{chat_id:chatId,text:'🔐 Abra o NEXO ADM → Telegram, gere o código de vinculação e envie /vincular CODIGO aqui.'});return;}
 if(/^\/nexo(?:@\w+)?$/i.test(text)||/^\/menu(?:@\w+)?$/i.test(text)){await nx5Clear(env,chatId);await nx5Send(env,chatId,await nx5View(env));return;}
 if(await nx5Reply(env,msg))return;
 if(msg.sticker||msg.animation||msg.document?.mime_type==='image/gif'){
    const added=await saveReceivedMedia(env,msg);
    await tg(env,'sendMessage',{chat_id:chatId,text:added?'✅ Mídia recebida! Abra Stickers e GIFs no ADM e selecione-a para o sinal desejado.':'ℹ️ Essa mídia já está na biblioteca do NEXO.'});
 }
}
// NEXO BOT V1 ETAPA 5: admin via private Telegram, no new webhook or sender.
const NX5_PAGES={motor:'⚡ Motor',results:'🔴 Histórico',strategies:'🎯 Estratégias',validation:'🧪 Validação',stickers:'🖼 Stickers',messages:'✍️ Mensagens',groups:'👥 Grupos',scores:'📈 Placares',settings:'⚙️ Ajustes',logs:'📋 Logs'};
const NX5_EVENTS={attention:'⚠️ Atenção',entry_black:'⚫ Entrada preto',entry_red:'🔴 Entrada vermelho',entry_white:'⚪ Entrada branco',gale1:'1️⃣ Gale 1',gale2:'2️⃣ Gale 2',green:'✅ WIN',white:'⚪ Branco',red:'❌ RED',bot_on:'🟢 Ativação'};
const NX5_EVENT_NAMES=Object.keys(NX5_EVENTS);
const NX5_DRAFT_PREFIX=ROOT+'telegram/menu-v5/draft/';
const nx5DraftKey=id=>NX5_DRAFT_PREFIX+id+'.json';
const nx5Btn=(label,data)=>({text:label,callback_data:'nx5:'+data});
function nx5Keyboard(rows){return {inline_keyboard:rows.map(row=>row.map(([label,data])=>nx5Btn(label,data)))}}
const nx5Back=()=>[['◀ Menu principal','home']];
function nx5Time(r){
 const sec=Number(r.minute_epoch||r.timestamp||0);
 if(Number.isFinite(sec)&&sec>1600000000&&sec<2100000000)return isoTime(sec);
 const raw=String(r.time||r.created_at||r.createdAt||'');
 const m=raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
 return m?m[1].padStart(2,'0')+':'+m[2]:'--:--';
}
function nx5Date(r){
 const sec=Number(r.minute_epoch||r.timestamp||0);
 if(Number.isFinite(sec)&&sec>1600000000&&sec<2100000000)return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(new Date(sec*1000));
 const raw=String(r.time||r.created_at||r.createdAt||'');const m=raw.match(/\b(\d\d)\/(\d\d)\/(\d{4})\b/);return m?m[1]+'/'+m[2]:'--/--';
}
const nx5Stone=r=>(r.color==='red'?'🔴':r.color==='black'?'⚫':r.color==='white'?'⚪':'❔')+String(r.number??'?');
const nx5Escape=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function nx5Table(items,page){
 const start=page*15,rows=items.slice(start,start+15);
 const header='POS  DATA   HORA   PEDRA';
 const lines=rows.map((r,i)=>`${String(start+i+1).padStart(3,'0')}  ${nx5Date(r)}  ${nx5Time(r)}  ${nx5Stone(r)}`);
 return '🔴 HISTÓRICO — BRABET DOUBLE\n\n<pre>'+nx5Escape(header+'\n'+(lines.join('\n')||'Nenhuma rodada disponível'))+'</pre>\nPágina '+(page+1)+' de '+Math.max(1,Math.ceil(items.length/15))+' · '+items.length+' registros disponíveis no recorte da Cloudflare.\nHorário em minutos conforme a fonte; não representa o instante exato da jogada.';
}
async function nx5Owner(env,id){const o=await getDoc(env,K.owner,null);return !!(o?.id&&o.id===String(id))}
async function nx5Send(env,chatId,view){await tg(env,'sendMessage',{chat_id:chatId,text:view.text,...(view.html?{parse_mode:'HTML'}:{}),reply_markup:nx5Keyboard(view.rows)})}
async function nx5Edit(env,q,view){
 try{await tg(env,'editMessageText',{chat_id:q.message.chat.id,message_id:q.message.message_id,text:view.text,...(view.html?{parse_mode:'HTML'}:{}),reply_markup:nx5Keyboard(view.rows)})}
 catch(e){if(!String(e?.message||e).includes('message is not modified'))throw e}
}
async function nx5View(env,screen='home',page=0){
 const back=[nx5Back()];
 if(screen==='home'){
  const [st,ss,gs]=await Promise.all([getDoc(env,K.settings,settingsDefault),getDoc(env,strategyStorage(env),[]),getDoc(env,K.groups,[])]);
  return {text:'🤖 NEXO BOT V1 — ADMINISTRADOR\n\nSinais Cloudflare: '+(st.botEnabled?'🟢 ligados':'🔴 desligados')+'\nEstratégias: '+ss.filter(x=>!x.archived).length+' cadastradas\nGrupos selecionados: '+gs.filter(x=>x.selected&&x.admin).length+'\n\nEscolha uma área para administrar pelo Telegram.',rows:[[['⚡ Motor','motor'],['🔴 Histórico','results:0']],[['🎯 Estratégias','strategies'],['🧪 Validação','validation']],[['🖼 Stickers','stickers'],['✍️ Mensagens','messages']],[['👥 Grupos','groups'],['📈 Placares','scores']],[['⚙️ Ajustes','settings'],['📋 Logs','logs']]]};
 }
 if(screen==='results'){
  const h=await recentR2(env,activeGame(env)),items=Array.isArray(h.items)?h.items:[];
  const max=Math.max(0,Math.ceil(items.length/15)-1);page=Math.max(0,Math.min(max,page));
  const pager=[];if(page>0)pager.push(['◀ Anterior','results:'+(page-1)]);if(page<max)pager.push(['Próxima ▶','results:'+(page+1)]);
  return {text:nx5Table(items,page),html:true,rows:[...(pager.length?[pager]:[]),[['🔄 Atualizar','results:'+page]],...back]};
 }
 if(screen==='strategies'){
  const ss=(await getDoc(env,strategyStorage(env),[])).filter(s=>!s.archived),start=page*7,max=Math.max(0,Math.ceil(ss.length/7)-1);page=Math.max(0,Math.min(page,max));
  const current=ss.slice(page*7,page*7+7),rows=current.map(s=>[[`${s.enabled?'🟢':'⚪'} ${s.name.slice(0,42)}`,'strategy:'+s.id]]);
  const pager=[];if(page>0)pager.push(['◀','strategies:'+(page-1)]);if(page<max)pager.push(['▶','strategies:'+(page+1)]);
  return {text:`🎯 ESTRATÉGIAS\n\n${ss.length} cadastradas · ${ss.filter(s=>s.enabled).length} ativas.\n\nSelecione uma estratégia para editar, pausar ou excluir.`,rows:[[['➕ Cadastrar estratégia','strategynew']],...rows,...(pager.length?[pager]:[]),...back]};
 }
 if(screen==='strategynew')return {text:'🎯 CADASTRAR ESTRATÉGIA\n\nResponda com o NOME da nova estratégia (2 a 70 caracteres).\nO bot pedirá padrão, cor e Gale em seguida.\nEla será criada DESLIGADA, para evitar sinais inesperados.',rows:[[['❌ Cancelar','cancel']],...back]};
 if(screen==='messages')return {text:'✍️ MENSAGENS GLOBAIS\n\nEscolha o evento. O bot vai pedir o texto e salvar no mesmo banco usado pelo site.\n\nAs mensagens atuais não serão apagadas.',rows:[...Object.entries(NX5_EVENTS).reduce((a,[k,v],i)=>{if(i%2===0)a.push([]);a[a.length-1].push([v,'message:'+k]);return a},[]),...back]};
 if(screen==='groups'){
  const gs=await getDoc(env,K.groups,[]);
  return {text:'👥 GRUPOS E CANAIS\n\nToque em um destino para marcar/desmarcar. O salvamento é imediato.\n\nSomente destinos em que o bot é administrador podem ser selecionados.\nSelecionados: '+gs.filter(g=>g.selected&&g.admin).length,rows:[...gs.slice(0,30).map((g,i)=>[[`${g.selected?'✅':'⬜'} ${String(g.name||g.id).slice(0,37)}${g.admin?'':' 🔒'}`,'group:'+i]]),[['🔄 Atualizar','groups']],...back]};
 }
 if(screen==='stickers'){
  const media=await getDoc(env,K.media,[]);
  return {text:'🖼 STICKERS E GIFS\n\nBiblioteca: '+media.length+' mídia(s).\n\nPara cadastrar um sticker ou GIF, envie-o nesta conversa privada. Depois selecione um evento abaixo para associar uma mídia.',rows:[[['🎯 Atribuir mídia','mediaevents'],['🔄 Atualizar','stickers']],...back]};
 }
 if(screen==='mediaevents')return {text:'🖼 ATRIBUIR STICKER OU GIF\n\nSelecione o evento que receberá uma mídia cadastrada. Gale 1 e Gale 2 continuam somente texto.',rows:[...Object.entries(NX5_EVENTS).filter(([k])=>!['gale1','gale2'].includes(k)).map(([k,v])=>[[v,'mediaevent:'+k]]),...back]};
 if(screen==='settings'){
  const st=await getDoc(env,K.settings,settingsDefault);
  return {text:'⚙️ AJUSTES\n\nEnvio oficial atual: '+(st.botEnabled?'LIGADO':'DESLIGADO')+'\nMostrar números: '+(st.showNumbers?'SIM':'NÃO')+'\nBranco curinga: '+(st.jokerWhite?'SIM':'NÃO')+'\nZerar placar à meia-noite: '+(st.resetMidnight?'SIM':'NÃO')+'\n\nMudar estas opções afeta os próximos sinais.',rows:[[['🔢 Alternar números','setting:showNumbers']],[['⚪ Alternar branco curinga','setting:jokerWhite']],[['🌙 Alternar reset diário','setting:resetMidnight']],...back]};
 }
 if(screen==='scores'){
  const ss=(await getDoc(env,strategyStorage(env),[])).filter(x=>!x.archived);const rows=[];
  for(const s of ss.slice(page*8,page*8+8)){const c=await scoreRead(env,s.id);rows.push(`${s.name.slice(0,24)}\n✅${c.green||0} ⚪${c.white||0} ❌${c.red||0}`)}
  const max=Math.max(0,Math.ceil(ss.length/8)-1),pager=[];if(page>0)pager.push(['◀','scores:'+(page-1)]);if(page<max)pager.push(['▶','scores:'+(page+1)]);
  return {text:'📈 PLACARES DO DIA\n\n'+(rows.join('\n\n')||'Nenhuma estratégia cadastrada')+'\n\nPágina '+(page+1),rows:[...(pager.length?[pager]:[]),[['🔄 Atualizar','scores:'+page]],...back]};
 }
 if(screen==='validation')return {text:'🧪 VALIDAÇÃO\n\nO painel antigo tem rotinas próprias de análise. A execução de backtests por Telegram ainda não está conectada; não exibiremos porcentagens simuladas nem aprovação automática sem testes reais.',rows:back};
 if(screen==='logs')return {text:'📋 LOGS E DIAGNÓSTICO\n\nO menu está conectado ao receptor Cloudflare. Logs do motor Termux ainda não estão sincronizados aqui.\n\nUse o histórico para verificar a última janela recebida pela Cloudflare.',rows:[[['🔴 Histórico','results:0']],...back]};
 if(screen==='motor')return {text:'⚡ MOTOR\n\nCloudflare: emissor oficial atual.\nTermux V1: ainda não conectado por canal autenticado.\n\nNão é possível ligar ou reiniciar remotamente o Termux apenas com botões do Telegram. Evitamos criar um segundo emissor.',rows:back};
 return nx5View(env,'home');
}
async function nx5Draft(env,chatId,stage,extras={}){await putDoc(env,nx5DraftKey(chatId),{stage,created:now(),...extras})}
async function nx5Clear(env,chatId){await env.R2.delete(nx5DraftKey(chatId))}
function nx5Pattern(raw){
 const map={r:'red',red:'red',vermelho:'red','🔴':'red',b:'black',black:'black',preto:'black','⚫':'black',w:'white',white:'white',branco:'white','⚪':'white','*':'*'};
 return raw.trim().split(/[\s,;|]+/).filter(Boolean).map(x=>map[x.toLowerCase()]||'');
}
async function nx5Reply(env,msg){
 const chatId=String(msg.chat?.id||'');if(!chatId||chatId!==String(msg.from?.id||'')||!await nx5Owner(env,chatId))return false;
 const d=await getDoc(env,nx5DraftKey(chatId),null);if(!d||!d.stage)return false;
 const t=String(msg.text||'').trim();if(!t)return false;
 if(/^\/cancelar$/i.test(t)){await nx5Clear(env,chatId);await nx5Send(env,chatId,{text:'❎ Operação cancelada.',rows:[nx5Back()]});return true}
 if(now()-d.created>1200){await nx5Clear(env,chatId);await nx5Send(env,chatId,{text:'⌛ Cadastro expirado. Reabra o menu /nexo.',rows:[nx5Back()]});return true}
 let answer='';
 if(d.stage==='newname'){
  if(t.length<2||t.length>70)answer='Nome inválido. Envie um nome entre 2 e 70 caracteres.';
  else {await nx5Draft(env,chatId,'newpattern',{name:t});answer='Padrão recebido no formato de cores.\nExemplo: vermelho preto vermelho branco\nOu: 🔴 ⚫ 🔴 ⚪\nMáximo: '+MAX_PATTERN_STONES+' pedras.\n\nEnvie o padrão:'}
 }else if(d.stage==='newpattern'){
  const p=nx5Pattern(t);if(!p.length||p.length>MAX_PATTERN_STONES)answer='Padrão inválido. Use 🔴 ⚫ ⚪ ou vermelho/preto/branco.';
  else{await nx5Draft(env,chatId,'newtarget',{name:d.name,pattern:p});answer='Escolha a cor-alvo. Responda: PRETO, VERMELHO ou BRANCO.'}
 }else if(d.stage==='newtarget'){
  const target=nx5Pattern(t);if(target.length!==1||!TARGETS.includes(target[0]))answer='Digite somente PRETO, VERMELHO ou BRANCO.';
  else {await nx5Draft(env,chatId,'newgale',{name:d.name,pattern:d.pattern,target:target[0]});answer='Defina o Gale máximo: 0, 1 ou 2.'}
 }else if(d.stage==='newgale'){
  if(!['0','1','2'].includes(t))answer='Digite 0, 1 ou 2.';
  else{
   const ss=await getDoc(env,strategyStorage(env),[]);if(ss.length>=1000)answer='Limite de estratégias atingido.';
   else{
    const row=validateStrategy({...strategyDefault(),gameId:activeGame(env),name:d.name,pattern:d.pattern,target:d.target,maxGale:Number(t),enabled:false},null);
    const h=await recentR2(env,activeGame(env)),max=Math.max(0,...(h.items||[]).map(x=>Number(x.seq)||0));
    await putDoc(env,runtimeKey(row.id),{lastSeq:max,recent:[],active:null});await resetScore(env,row.id);
    await putDoc(env,strategyStorage(env),[...ss,row]);await nx5Clear(env,chatId);
    answer='✅ Estratégia cadastrada DESLIGADA!\n'+row.name+'\nPadrão: '+row.pattern.join(', ')+'\nCor: '+row.target+' · Gale '+row.maxGale+'\n\nAbra Estratégias para ativar quando estiver pronto.';
   }
  }
 }else if(d.stage.startsWith('edit')){
  const ss=await getDoc(env,strategyStorage(env),[]),row=ss.find(x=>x.id===d.id&&!x.archived);
  if(!row){await nx5Clear(env,chatId);answer='Estratégia não encontrada.'}
  else{
   const updated={...row};let valid=true;
   if(d.stage==='editname'){if(t.length<2||t.length>70){valid=false;answer='Nome inválido (2 a 70 caracteres).'}else updated.name=t}
   else if(d.stage==='editpattern'){const p=nx5Pattern(t);if(!p.length||p.length>MAX_PATTERN_STONES||p.some(x=>!x)){valid=false;answer='Padrão inválido. Use vermelho/preto/branco e *.'}else updated.pattern=p}
   else if(d.stage==='edittarget'){const p=nx5Pattern(t);if(p.length!==1||!TARGETS.includes(p[0])){valid=false;answer='Responda PRETO, VERMELHO ou BRANCO.'}else updated.target=p[0]}
   else if(d.stage==='editgale'){if(!['0','1','2'].includes(t)){valid=false;answer='Responda 0, 1 ou 2.'}else updated.maxGale=Number(t)}
   if(valid){
    const checked=validateStrategy(updated,row);
    const i=ss.findIndex(x=>x.id===d.id);ss[i]={...checked,enabled:false,updatedAt:now(),revision:crypto.randomUUID()};
    await putDoc(env,strategyStorage(env),ss);await nx5Clear(env,chatId);
    answer='✅ Estratégia editada e PAUSADA por segurança. Reative no menu depois de conferir os dados.';
   }
  }
 }else if(d.stage==='message'){
  if(t.length>1500)answer='Mensagem longa demais (máx. 1500 caracteres).';
  else{
   const g=await globalDoc(env);g.templates={...(g.templates||{}),[d.event]:{...(g.templates?.[d.event]||{}),text:t,type:'text',assetId:'',saved:true,updatedAt:now()}};
   g.updatedAt=now();await putDoc(env,GLOBAL_KEY,g);await nx5Clear(env,chatId);answer='✅ Texto salvo para '+NX5_EVENTS[d.event]+'.';
  }
 }else return false;
 await nx5Send(env,chatId,{text:answer+'\n\nDigite /cancelar para interromper um cadastro.',rows:[nx5Back()]});return true;
}
async function nx5Callback(env,q){
 const data=String(q?.data||'');if(!data.startsWith('nx5:'))return false;
 const chatId=String(q.message?.chat?.id||''),from=String(q.from?.id||'');
 if(!chatId||chatId!==from||q.message.chat.type!=='private'||!await nx5Owner(env,from)){
  await tg(env,'answerCallbackQuery',{callback_query_id:q.id,text:'Acesso restrito ao administrador',show_alert:true});return true;
 }
 await tg(env,'answerCallbackQuery',{callback_query_id:q.id});
 const key=data.slice(4);let screen=key,page=0;
 if(key==='cancel'){await nx5Clear(env,chatId);screen='home'}
 if(key==='strategynew'){await nx5Draft(env,chatId,'newname');return nx5Edit(env,q,await nx5View(env,'strategynew'))}
 if(/^message:(attention|entry_black|entry_red|entry_white|gale1|gale2|green|white|red|bot_on)$/.test(key)){
  const ev=key.slice(8);await nx5Draft(env,chatId,'message',{event:ev});return nx5Edit(env,q,{text:'✍️ '+NX5_EVENTS[ev]+'\n\nEnvie a nova mensagem neste chat. O texto atual só será substituído depois de receber a mensagem.\n\nDigite /cancelar para cancelar.',rows:[nx5Back()]});
 }
 if(key.startsWith('group:')){
  const ix=Number(key.slice(6)),gs=await getDoc(env,K.groups,[]);
  if(!Number.isInteger(ix)||ix<0||ix>=gs.length)return nx5Edit(env,q,await nx5View(env,'groups'));
  const g=gs[ix];if(!g.admin)return nx5Edit(env,q,{text:'🔒 Este destino precisa conceder privilégios de administrador ao bot.',rows:[nx5Back()]});
  const selected=gs.filter(x=>x.selected&&x.admin).length;
  if(!g.selected&&selected>=5)return nx5Edit(env,q,{text:'Máximo de 5 destinos selecionados.',rows:[nx5Back()]});
  gs[ix]={...g,selected:!g.selected,updatedAt:now()};await putDoc(env,K.groups,gs);
  return nx5Edit(env,q,await nx5View(env,'groups'));
 }
 if(key.startsWith('setting:')){
  const name=key.slice(8);if(!['showNumbers','jokerWhite','resetMidnight'].includes(name))return;
  const st=await getDoc(env,K.settings,settingsDefault);st[name]=!st[name];st.updatedAt=now();await putDoc(env,K.settings,st);
  return nx5Edit(env,q,await nx5View(env,'settings'));
 }
 if(/^strategy:[0-9a-f]{32}$/.test(key)){
  const id=key.slice(9),ss=await getDoc(env,strategyStorage(env),[]),s=ss.find(x=>x.id===id&&!x.archived);
  if(!s)return nx5Edit(env,q,await nx5View(env,'strategies'));
  return nx5Edit(env,q,{text:'🎯 '+s.name+'\n\nEstado: '+(s.enabled?'🟢 LIGADA':'⚪ DESLIGADA')+'\nPadrão: '+s.pattern.join(' ').slice(0,750)+'\nEntrada: '+s.target+' · Gale '+s.maxGale+'\n\nConfirme alterações pelo botão.',rows:[[[s.enabled?'⏸ Pausar':'▶ Ativar','strtoggle:'+id]],[['✏️ Editar','stredit:'+id],['🗑 Excluir','strdelete:'+id]],[['◀ Estratégias','strategies']]]});
 }
 if(/^stredit:[0-9a-f]{32}$/.test(key)){
  const id=key.slice(8),ss=await getDoc(env,strategyStorage(env),[]),s=ss.find(x=>x.id===id&&!x.archived);
  if(!s)return nx5Edit(env,q,await nx5View(env,'strategies'));
  return nx5Edit(env,q,{text:'✏️ EDITAR ESTRATÉGIA\n\n'+s.name+'\nAs alterações pausam a estratégia para revisão.\nSelecione o campo:',rows:[[['Nome','editfield:name:'+id],['Padrão','editfield:pattern:'+id]],[['Cor de entrada','editfield:target:'+id],['Gale máximo','editfield:gale:'+id]],[['◀ Voltar','strategy:'+id]]]});
 }
 if(/^editfield:(name|pattern|target|gale):[0-9a-f]{32}$/.test(key)){
  const m=/^editfield:(name|pattern|target|gale):([0-9a-f]{32})$/.exec(key),field=m[1],id=m[2];
  await nx5Draft(env,chatId,'edit'+field,{id});
  const hint={name:'Envie o novo nome (2 a 70 caracteres).',pattern:'Envie o novo padrão: 🔴 ⚫ ⚪ ou vermelho preto branco.',target:'Responda PRETO, VERMELHO ou BRANCO.',gale:'Envie 0, 1 ou 2.'};
  return nx5Edit(env,q,{text:'✏️ EDITAR '+field.toUpperCase()+'\n\n'+hint[field]+'\n\nA estratégia ficará pausada quando salvar.',rows:[[['❌ Cancelar','cancel']]]});
 }
 if(/^strtoggle:[0-9a-f]{32}$/.test(key)){
  const id=key.slice(10),ss=await getDoc(env,strategyStorage(env),[]),s=ss.find(x=>x.id===id&&!x.archived);if(!s)return;
  if(!s.enabled){const h=await recentR2(env,activeGame(env)),max=Math.max(0,...(h.items||[]).map(x=>Number(x.seq)||0));await putDoc(env,runtimeKey(id),{lastSeq:max,recent:[],active:null})}
  s.enabled=!s.enabled;s.updatedAt=now();s.revision=crypto.randomUUID();await putDoc(env,strategyStorage(env),ss);
  return nx5Edit(env,q,{text:'✅ Estratégia '+s.name+' '+(s.enabled?'ATIVADA':'PAUSADA')+'.\n\nAlterações afetam os próximos resultados.',rows:[[['◀ Estratégias','strategies']]]});
 }
 if(/^strdelete:[0-9a-f]{32}$/.test(key))return nx5Edit(env,q,{text:'⚠️ Confirmar EXCLUSÃO permanente da estratégia? Essa ação não pode ser desfeita pelo menu.',rows:[[['✅ Confirmar exclusão','strconfirm:'+key.slice(10)]],[['❌ Cancelar','strategies']]]});
 if(/^strconfirm:[0-9a-f]{32}$/.test(key)){
  const id=key.slice(11),ss=await getDoc(env,strategyStorage(env),[]),s=ss.find(x=>x.id===id&&!x.archived);
  if(!s)return nx5Edit(env,q,await nx5View(env,'strategies'));
  if(s.enabled)return nx5Edit(env,q,{text:'⚠️ Pause a estratégia antes de excluir, para não interromper sinais ativos.',rows:[[['◀ Estratégias','strategies']]]});
  await putDoc(env,purgeTaskKey(id),{id,queuedAt:now(),pending:true,version:26});await putDoc(env,strategyStorage(env),ss.filter(x=>x.id!==id));
  return nx5Edit(env,q,{text:'✅ Estratégia excluída. Limpeza histórica agendada.',rows:[[['◀ Estratégias','strategies']]]});
 }
 if(/^mediaevent:/.test(key)){
  const ev=key.slice(11),media=await getDoc(env,K.media,[]);if(!NX5_EVENTS[ev]||['gale1','gale2'].includes(ev))return;
  const rows=media.slice(-20).reverse().map((m,i)=>[[`${m.kind==='sticker'?'🖼':'🎞'} ${String(m.name||'Mídia').slice(0,36)}`,'mediaassign:'+ev+':'+m.id]]);
  return nx5Edit(env,q,{text:'🖼 '+NX5_EVENTS[ev]+'\nEscolha uma mídia da biblioteca.\n\nÚltimas '+rows.length+' mídias:',rows:[...rows,[['🚫 Somente texto','mediatxt:'+ev]],...nx5Back()]});
 }
 if(/^mediaassign:/.test(key)){
  const m=/^mediaassign:([a-z_]+):([a-zA-Z0-9_-]{8,90})$/.exec(key);if(!m||!NX5_EVENTS[m[1]])return;
  const media=await getDoc(env,K.media,[]),a=media.find(x=>x.id===m[2]);if(!a)return;
  const g=await globalDoc(env);g.templates={...(g.templates||{}),[m[1]]:{...(g.templates?.[m[1]]||{}),type:a.kind,assetId:a.id,text:g.templates?.[m[1]]?.text||'',sendWithMedia:true,saved:true,updatedAt:now()}};g.updatedAt=now();await putDoc(env,GLOBAL_KEY,g);
  return nx5Edit(env,q,{text:'✅ Mídia associada ao evento '+NX5_EVENTS[m[1]]+'.',rows:[[['◀ Stickers','stickers']]]});
 }
 if(/^mediatxt:/.test(key)){
  const ev=key.slice(9);if(!NX5_EVENTS[ev])return;const g=await globalDoc(env);g.templates={...(g.templates||{}),[ev]:{...(g.templates?.[ev]||{}),type:'text',assetId:'',saved:true,updatedAt:now()}};g.updatedAt=now();await putDoc(env,GLOBAL_KEY,g);
  return nx5Edit(env,q,{text:'✅ Evento configurado para somente texto.',rows:[[['◀ Stickers','stickers']]]});
 }
 const match=/^(results|strategies|scores):(\d+)$/.exec(key);if(match){screen=match[1];page=Math.min(1000,Number(match[2]))}
 await nx5Edit(env,q,await nx5View(env,screen,page));return true;
}

async function telegramWebhook(request,env){
 const secret=await webhookSecret(env);
 if(!secret||!await eqHash(request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',secret))return err('Nao autorizado',401);
 if(!await hasBot(env))return err('Bot nao configurado',503);
 if(Number(request.headers.get('content-length')||0)>100000)return err('Atualizacao grande demais',413);
 let b;try{b=await request.json()}catch{return err('JSON invalido')}
 const c=b.my_chat_member?.chat||b.message?.chat||b.channel_post?.chat;
 // Reconhece grupos por eventos normais, nao exige comando /nexo_grupo.
 if(normChat(c)){
   try{await discoverChat(env,c,{force:!!b.my_chat_member})}catch(e){console.warn('ADM webhook group',String(e.message||e).slice(0,80))}
 }
 if(b.callback_query)try{await nx5Callback(env,b.callback_query)}catch(e){console.warn('NEXO MENU callback:',String(e.message||e).slice(0,90))}
 if(b.message?.chat?.type==='private')try{await handlePrivateMessage(env,b.message)}catch(e){console.warn('ADM webhook private:',String(e.message||e).slice(0,90))}
 return json({ok:true});
}

function matchPat(history,pattern,joker=false){
 if(history.length<pattern.length)return false;
 const tail=history.slice(-pattern.length);
 return pattern.every((v,i)=>v==='*'||(joker&&tail[i].number===0)||v===tail[i].color||(v.startsWith('n:')&&Number(v.slice(2))===tail[i].number));
}
const validName=(n)=>E.includes(n);
function formatMessage(template,r,s,step){
 const values={quadrado_espaco:(r.color==='red'?'🟥':r.color==='black'?'⬛':'⬜')+' '+String(r.number),pedra:(r.color==='red'?'🔴':r.color==='black'?'⚫':'⚪')+String(r.number),quadrado:(r.color==='red'?'🟥':r.color==='black'?'⬛':'⬜')+String(r.number),numero:String(r.number),cor:r.color==='red'?'VERMELHO':r.color==='black'?'PRETO':'BRANCO',gale:String(step),limite_gale:String(s.maxGale??0),estrategia:s.name,hora:isoTime(r.minute_epoch),data:dayBR(r.minute_epoch)};
 return String(template||'').replace(/\{(pedra|quadrado|quadrado_espaco|numero|cor|gale|limite_gale|estrategia|hora|data)\}/g,(_,k)=>values[k]);
}
function stoneText(r,withNumber){return '🎲 Pedra sorteada: '+(r.color==='red'?'🟥':r.color==='black'?'⬛':'⬜')+(withNumber?' '+r.number:'');}
// V10: aviso de ATENÇÃO é temporário. Guarda SOMENTE message_id retornados pelo Telegram.
async function beginAttention(env,evt){
 const key=attentionKey(evt.strategyId,evt.id);
 await putDoc(env,key,{eventId:evt.id,strategyId:evt.strategyId,active:true,createdAt:now(),messages:{},cancelledAt:0,attempts:0});
}
// R2 por mensagem/chat, evitando perda de IDs quando privado e grupos recebem em paralelo.
async function rememberAttentionMessage(env,evt,chatId,messageId){
 if(!Number.isSafeInteger(messageId)||messageId<=0)return;
 const k=attentionMessageKey(evt.strategyId,evt.id,chatId,messageId);
 // Guardar primeiro: se o cancelamento ocorrer durante a entrega, o ID não se perde.
 await putDoc(env,k,{chatId:String(chatId),messageId,eventId:evt.id,strategyId:evt.strategyId});
 const main=attentionKey(evt.strategyId,evt.id);
 const track=await getDoc(env,main,null);
 if(!track||!track.active){
  await eraseAttentionMessagePart(env,k,{chatId:String(chatId),messageId});
  // Requisição de envio começou ANTES do cancelamento: se o delete falhar,
  // manter um registro fechado para o agendador conseguir repetir a operação.
  const remaining=await list(env,attentionMessagesPrefix(evt.strategyId,evt.id),50);
  if(remaining.length){
   const closed=track||{eventId:evt.id,strategyId:evt.strategyId,active:false,createdAt:now(),attempts:0};
   closed.active=false;
   await putDoc(env,main,closed);
   await putDoc(env,attentionRetryKey(evt.strategyId,evt.id),{key:main,createdAt:closed.createdAt,updatedAt:now()});
  }
 }
}
async function eraseAttentionMessagePart(env,key,row){
 const chatId=String(row.chatId||''),messageId=Number(row.messageId);
 if(!/^-?[0-9]{5,20}$/.test(chatId)||!Number.isSafeInteger(messageId)||messageId<=0){await env.R2.delete?.(key);return true}
 try{await tg(env,'deleteMessage',{chat_id:chatId,message_id:messageId});await env.R2.delete?.(key);return true}
 catch(e){
  const why=String(e.message||e);
  // A plataforma já apagou ou recusou definitivamente; não insistir sem fim.
  if(/message to delete not found|message can't be deleted|message can.t be deleted|message is too old/i.test(why)){
   await env.R2.delete?.(key);return true;
  }
  console.warn('NEXO atenção exclusão pendente:',why.slice(0,90));return false;
 }
}
async function eraseAttentionMessages(env,key,data){
 const prefix=attentionMessagesPrefix(data.strategyId,data.eventId);
 const entries=await list(env,prefix,100);
 await Promise.allSettled(entries.map(async entry=>{
  const row=await getDoc(env,entry.key,null);
  if(!row){await env.R2.delete?.(entry.key);return}
  await eraseAttentionMessagePart(env,entry.key,row);
 }));
 const remaining=await list(env,prefix,100);
 if(!remaining.length){
  await env.R2.delete?.(key);
  await env.R2.delete?.(attentionRetryKey(data.strategyId,data.eventId));
  return true;
 }
 data.active=false;data.attempts=(data.attempts||0)+1;
 await putDoc(env,key,data);
 await putDoc(env,attentionRetryKey(data.strategyId,data.eventId),{key,createdAt:data.createdAt,updatedAt:now()});
 return false;
}
async function dismissAttention(env,strategyId,eventId){
 if(!eventId)return;
 const key=attentionKey(strategyId,eventId),data=await getDoc(env,key,null);
 // Cancelar tentativas que ainda estiverem na fila antes de publicar outro sinal.
 const queued=await list(env,ROOT+'outbox/pending/'+eventId+'_',30);
  for(const entry of queued){
   const row=await getDoc(env,entry.key,null);
   if(row?.groupId){const key=v11BlockKey(row.groupId),blocked=await getDoc(env,key,null);if(blocked?.eventId===eventId)await env.R2.delete?.(key);}
   await env.R2.delete?.(entry.key);
  }
 if(!data)return;
 data.active=false;data.cancelledAt=data.cancelledAt||now();
 await putDoc(env,key,data); // Persistir o cancelamento antes do deleteMessage.
 await eraseAttentionMessages(env,key,data);
}
async function cleanupOldAttention(env){
 // Somente avisos que falharam ao apagar; avisos ativos nunca são removidos pelo cron.
 const entries=await list(env,ROOT+'telegram/temporary-attention-retry/',50);
 for(const e of entries.slice(0,12)){
  const task=await getDoc(env,e.key,null),key=String(task?.key||'');
  if(!key.startsWith(ATTENTION_ROOT)){await env.R2.delete?.(e.key);continue}
  const row=await getDoc(env,key,null);
  if(!row||row.active){await env.R2.delete?.(e.key);continue}
  if(now()-(row.createdAt||0)>48*3600){await env.R2.delete?.(key);await env.R2.delete?.(e.key);continue}
  await eraseAttentionMessages(env,key,row);
 }
}
function defaultSignalText(key){
 switch(key){
  case 'entry_black':return '🎯 ENTRADA CONFIRMADA\nAlvo: PRETO ⚫ + BRANCO ⚪\n- - - - ATÉ GALE {limite_gale} - - - -\n🤖 NEXO DOUBLE PRO 🤖';
  case 'entry_red':return '🎯 ENTRADA CONFIRMADA\nAlvo: VERMELHO 🔴 + BRANCO ⚪\n- - - - ATÉ GALE {limite_gale} - - - -\n🤖 NEXO DOUBLE PRO 🤖';
   case 'entry_white':return '🎯 ENTRADA CONFIRMADA\nAlvo: SOMENTE BRANCO ⚪\n- - - - ATÉ GALE {limite_gale} - - - -\n🤖 NEXO DOUBLE PRO 🤖';
  case 'gale1':return '- - - - GALE 1 - - - -';
  case 'gale2':return '- - - - GALE 2 - - - -';
  case 'green':return '✅ WIN NO {pedra}';
  case 'white':return '✅ WIN NO {pedra}';
  case 'red':return '❌ RED - sequência encerrada.';
  case 'attention':return '🚨 ATENÇÃO: possível sinal em análise.';
  case 'bot_on':return '🤖 NEXO DOUBLE PRO 🤖\n✅ ROBÔ ATIVADO\n🔔 Avisos habilitados neste privado.\nAs estratégias só analisarão rodadas novas.';
  default:return '';
 }
}
// V11: entrega por etapas duráveis. Nunca reenviar automaticamente uma etapa
// cujo resultado no Telegram ficou incerto. Os grupos trabalham em paralelo.
const V22_RETRY_MAX_AGE_S=14;
const v22ExpiredEvent=evt=>!!evt&&((Number(evt.expiresAtMs)>0&&Date.now()>=Number(evt.expiresAtMs))||(Number(evt.expiresAtMs||0)===0&&Number.isSafeInteger(evt.at)&&now()-evt.at>=V22_RETRY_MAX_AGE_S));
const V11_STAGE_ROOT=ROOT+'outbox/stages/';
const V11_BLOCK_ROOT=ROOT+'outbox/chat-block/';
const v11ChatTag=id=>String(id).replace(/[^\d-]/g,'').replace('-','m');
const v11StageKey=(evt,chatId)=>V11_STAGE_ROOT+evt.id+'_'+v11ChatTag(chatId)+'.json';
const v11BlockKey=chatId=>V11_BLOCK_ROOT+v11ChatTag(chatId)+'.json';
const V11_ADMIN_CACHE=new Map();
async function v11IsAdmin(env,group,sharedToken='',identity=null){
 if(group.private)return true;
 const id=String(group.id),old=V11_ADMIN_CACHE.get(id);
 if(old&&old.until>now())return old.ok;
 const ok=await botAdmin(env,id,sharedToken,identity);
 if(V11_ADMIN_CACHE.size>64)V11_ADMIN_CACHE.clear();
 V11_ADMIN_CACHE.set(id,{ok,until:now()+(ok?180:5)});
 return ok;
}
async function transmit(env,group,evt,sharedToken='',identity=null){
 // NEXO V26.5: leituras independentes em paralelo; barreiras de envio mantidas.
 // A verificacao ADM, a etapa confirmada e o bloqueio sao conferidos ANTES do envio.
 // Testes manuais e placares nao compartilham estado com os sinais.
 const tracked=!!evt.id;
 const stageKey=tracked?v11StageKey(evt,group.id):null;
 const initial={eventId:evt.id||'',chatId:String(group.id),confirmed:{},uncertain:null,completed:false,updatedAt:now()};
 const [adminOk,progress,gate]=await Promise.all([
  v11IsAdmin(env,group,sharedToken,identity),
  tracked?getDoc(env,stageKey,initial):Promise.resolve(initial),
  tracked?getDoc(env,v11BlockKey(group.id),null):Promise.resolve(null)
 ]);
 if(!adminOk)throw Error('Bot nao e administrador deste grupo');
 // V12.2: resolver o token uma única vez por evento, não em cada balão.
 const deliveryToken=sharedToken||await botToken(env);
 if(tracked&&gate&&gate.eventId!==evt.id)throw Error('Chat aguardando revisao do ciclo '+gate.eventId);
 if(tracked&&progress.inFlight&&!progress.confirmed[progress.inFlight]){
  progress.uncertain=progress.inFlight;progress.updatedAt=now();
  await putDoc(env,stageKey,progress);
  await putDoc(env,v11BlockKey(group.id),{eventId:evt.id,chatId:String(group.id),stage:progress.inFlight,updatedAt:now()});
 }
 if(progress.uncertain)throw Error('Envio incerto em '+progress.uncertain+'; revisar antes de retentar');
 if(progress.completed)return;
  const deliver=async(stage,method,body)=>{
  if(progress.confirmed[stage])return;
  const v26StageStart=Date.now(); // NEXO V26.4 TELEMETRIA
   if(v22ExpiredEvent(evt)){console.warn('V22: etapa Telegram vencida, omitida',evt.type,stage);return;}
  if(tracked){
   progress.inFlight=stage;progress.updatedAt=now();
   await putDoc(env,stageKey,progress);
  }
  let result;
  const v26TelegramStart=Date.now(); // NEXO V26.4 TELEMETRIA
  let v26TelegramMs=0;
  try{
   result=await tgUsing(deliveryToken,method,body);
   v26TelegramMs=Date.now()-v26TelegramStart;
   console.log('NEXO V26.4 HTTP',JSON.stringify({type:evt.type,stage,private:!!group.private,ms:v26TelegramMs,ok:true}));
  }
  catch(e){
   v26TelegramMs=Date.now()-v26TelegramStart;
   console.warn('NEXO V26.4 HTTP',JSON.stringify({type:evt.type,stage,private:!!group.private,ms:v26TelegramMs,ok:false}));
   if(tracked){
    progress.uncertain=stage;progress.updatedAt=now();
    await putDoc(env,stageKey,progress);
    await putDoc(env,v11BlockKey(group.id),{eventId:evt.id,chatId:String(group.id),stage,updatedAt:now()});
   }
   throw e;
  }
  // A mensagem passou pelo Telegram: persistir ID antes do passo seguinte.
  if(evt.type==='attention'&&result?.message_id)await rememberAttentionMessage(env,evt,group.id,Number(result.message_id));
  if(tracked){
   progress.confirmed[stage]={messageId:result?.message_id||null,at:now()};
   progress.inFlight=null;progress.updatedAt=now();
   await putDoc(env,stageKey,progress);
  }
  const v26StageMs=Date.now()-v26StageStart; // NEXO V26.4 TELEMETRIA
  console.log('NEXO V26.4 ETAPA',JSON.stringify({type:evt.type,stage,private:!!group.private,totalMs:v26StageMs,telegramMs:v26TelegramMs,outrasOperacoesMs:Math.max(0,v26StageMs-v26TelegramMs)}));
 };
 // V12: somente UMA forma de mensagem por evento: TEXTO OU STICKER OU GIF.
 if(evt.message&&!['sticker','gif'].includes(evt.media?.type))await deliver('text','sendMessage',{chat_id:group.id,text:evt.message,disable_web_page_preview:true});
 const m=evt.media;
 if(m?.type==='sticker'||m?.type==='gif'){
  const assets=await getDoc(env,K.media,[]),asset=assets.find(a=>a.id===m.assetId&&a.kind===m.type);
  if(!asset)throw Error('Midia nao encontrada para '+evt.type);
  const method=m.type==='gif'?'sendAnimation':'sendSticker',field=m.type==='gif'?'animation':'sticker';
  if(asset.fileId)await deliver('media',method,{chat_id:group.id,[field]:asset.fileId});
  else{
   const obj=await env.R2.get(ROOT+'media/files/'+asset.id);
   if(!obj)throw Error('Arquivo de midia nao encontrado');
   const form=new FormData();form.append('chat_id',group.id);
   form.append(field,new Blob([await obj.arrayBuffer()],{type:asset.mime}),asset.name);
   await deliver('media',method,form);
  }
 }
 // V12.2: ENTRADA -> CADASTRE-SE -> APÓS PEDRA, balões independentes.
 if(['entry_black','entry_red','entry_white'].includes(evt.type)&&evt.registration?.enabled&&evt.registration.url){
  const label=evt.registration.label||'🔗 CADASTRE-SE';
  await deliver('link','sendMessage',{chat_id:group.id,text:label,entities:[{type:'text_link',offset:0,length:[...label].reduce((n,c)=>n+(c.codePointAt(0)>65535?2:1),0),url:evt.registration.url}],disable_web_page_preview:true});
  }
 if(['entry_black','entry_red','entry_white'].includes(evt.type)&&evt.afterPattern)await deliver('after-pattern','sendMessage',{chat_id:group.id,text:evt.afterPattern,disable_web_page_preview:true});
 if(['win_black','win_red','win_white'].includes(evt.type)&&evt.stoneAfter)await deliver('stone','sendMessage',{chat_id:group.id,text:evt.stoneAfter,disable_web_page_preview:true});
 if(tracked){
  progress.completed=true;progress.updatedAt=now();await putDoc(env,stageKey,progress);
  const current=await getDoc(env,v11BlockKey(group.id),null);
  if(current?.eventId===evt.id)await env.R2.delete?.(v11BlockKey(group.id));
 }
}
// NEXO V9 - prioridade do chat privado verificado; canais continuam opcionais.
// Envio para privado + grupos em paralelo; a ordem dentro de cada chat é mantida.
async function dispatch(env,config,evt,{privateOnly=false}={}){
 if(!config.botEnabled||v22ExpiredEvent(evt))return;
 // V26.5: ler privado e grupos juntos; decidir os destinos somente apos ambas as leituras.
 const [owner,all]=await Promise.all([
  getDoc(env,K.owner,null),
  privateOnly?Promise.resolve([]):getDoc(env,K.groups,[])
 ]);
 const privateChat=owner?.id&&/^[1-9][0-9]{4,19}$/.test(String(owner.id))
   ? [{id:String(owner.id),private:true}] : [];
 const candidates=[...privateChat,...all.filter(x=>x.selected&&x.admin).slice(0,5)];
 const targets=candidates.filter((g,i)=>candidates.findIndex(x=>String(x.id)===String(g.id))===i);
 // V25: um token e uma consulta getMe compartilhados por evento.
 // Mantem getChatMember por grupo, etapas duraveis e ordem dentro de cada chat.
 const sharedDeliveryToken=targets.length?await botToken(env):'';
 let sharedBotIdentityPromise;
 const sharedBotIdentity=()=>sharedBotIdentityPromise||(sharedBotIdentityPromise=tgUsing(sharedDeliveryToken,'getMe',{}));
 await Promise.allSettled(targets.map(async(group)=>{
   if(evt.type==='attention'){
    const tracked=await getDoc(env,attentionKey(evt.strategyId,evt.id),null);
    if(!tracked?.active)return;
   }
   const uid=evt.id+'_'+String(group.id).replace('-','m');
   // V26.5: apenas leituras em paralelo; checar enviado ANTES de gravar pendencia.
   const key=pendingKey(uid);
   const [sent,existing]=await Promise.all([
    getDoc(env,sentKey(uid),null),
    getDoc(env,key,null)
   ]);
   if(sent)return;
   const row={id:uid,groupId:String(group.id),evt,status:'pending',attempts:existing?.attempts||0,createdAt:existing?.createdAt||now(),updatedAt:now(),lastError:''};
   await putDoc(env,key,row);
   try{
     // A checagem extra diminui o risco de enviar um alerta já cancelado.
     if(evt.type==='attention'){
       const tracked=await getDoc(env,attentionKey(evt.strategyId,evt.id),null);
       if(!tracked?.active){await env.R2.delete?.(key);return}
     }
     await transmit(env,group,evt,sharedDeliveryToken,sharedBotIdentity);
     await putDoc(env,sentKey(uid),{id:uid,sentAt:now()});
     await env.R2.delete?.(key);
   }catch(e){
     row.attempts++;row.lastError=String(e.message||e).slice(0,160);row.updatedAt=now();
     console.warn('Telegram pending',row.lastError);await putDoc(env,key,row);
      await putDoc(env,v11BlockKey(group.id),{eventId:evt.id,chatId:String(group.id),stage:'pending-error',updatedAt:now()});
   }
 }));
}

async function fireEvent(env,settings,strategy,r,type,step,deadlineAtMs=0,globalCache=null,numberLookup=null,entryRoundId=null){
 const v26FireStart=Date.now(); // NEXO V26.4 TELEMETRIA
 // O estado/placar continua correto, mas notificacoes velhas nao serao enviadas.
 if(deadlineAtMs&&Date.now()>=deadlineAtMs){console.warn('V22: evento vencido nao enviado',type,r.seq);return;}
 const global=globalCache||await globalDoc(env),key=GLOBAL_MAP[type],template=global?.templates?.[key];
 const globalSaved=template?.saved===true;
 const savedText=globalSaved?template.text:(strategy.messages?.[type]||'');
 const message=String(savedText||'').trim()?savedText:defaultSignalText(key);
 const media=globalSaved?{type:template.type,assetId:template.assetId}:(strategy.media?.[type]||{type:'text'});
 const evt={id:strategy.id+'_'+r.id+'_'+type,seq:r.seq,strategyId:strategy.id,strategyName:strategy.name,type,gameId:strategy.gameId,roundId:r.id,number:r.number,color:r.color,minute_epoch:r.minute_epoch,at:now(),expiresAtMs:deadlineAtMs||0,message:formatMessage(message,r,strategy,step),media,showStoneBeforeMedia:strategy.showStoneBeforeMedia};
  if(['entry_black','entry_red','entry_white'].includes(type)){
   if(global.registration?.enabled===true)evt.registration=global.registration;
   const after=global?.afterPattern||{enabled:true,text:V12_2_AFTER_PATTERN_DEFAULT};
   if(after.enabled!==false&&strategy.showAfterPattern!==false){
    const afterTemplate=String(after.text||V12_2_AFTER_PATTERN_DEFAULT).slice(0,400);
    evt.afterPattern=formatMessage(afterTemplate,r,strategy,step);
   }
  }
  // RED não gera mensagem de pedra sorteada.
  const sc=global?.stone||{enabled:true,text:'🎲 Pedra sorteada: {pedra}'};
  if(['win_black','win_red','win_white'].includes(type)&&sc.enabled!==false&&strategy.showStoneAfter!==false){
   const stoneTemplate=String(sc.text||'🎲 Pedra sorteada: {pedra}').slice(0,400).replace(/\{quadrado(?:_espaco)?\}/g,'{pedra}');
   evt.stoneAfter=formatMessage(stoneTemplate,r,strategy,step);
  }
  // NEXO Blitz V5.1: mensagem de entrada sem rodape automatico est N.
 await putDoc(env,eventKey(evt.id),evt);
 const v26EventSavedAt=Date.now(); // NEXO V26.4 TELEMETRIA
 if(type==='attention'&&settings.botEnabled)await beginAttention(env,evt);
 await dispatch(env,settings,evt);
 // NEXO_COLORS_CAPTURE_V2: apenas fila de registros encerrados; nenhuma captura nesta execução.
 if(settings.botEnabled&&evt.gameId==='blitz-double'&&['win_black','win_red','win_white','red'].includes(evt.type)){try{await queueCapture(env,{...evt,entryRoundId});}catch(e){console.warn('Fila Cores: falha isolada');}}
 console.log('NEXO V26.4 EVENTO',JSON.stringify({type,seq:r.seq,totalMs:Date.now()-v26FireStart,preDespachoMs:v26EventSavedAt-v26FireStart,despachoMs:Date.now()-v26EventSavedAt}));
}
async function simulate(s,rows){const state={recent:[],active:null};const score=scoreDefault(dayBR());const events=[];
 for(const r of [...rows].sort((a,b)=>(a.seq||0)-(b.seq||0)||a.minute_epoch-b.minute_epoch)){
   if(state.active){const a=state.active;let type;
     if(r.color==='white'){type='win_white';score.white++}
     else if(r.color===s.target){type=s.target==='red'?'win_red':'win_black';score.green++}
     else if(a.step<s.maxGale){a.step++;type='gale'+a.step;score[type]++}
     else{type='red';score.red++}
     events.push({type,number:r.number,minute_epoch:r.minute_epoch});if(['red','win_white','win_red','win_black'].includes(type))state.active=null;
   }else if(matchPat([...state.recent,r],s.pattern,s.jokerWhite)){
     state.active={step:0};score.entries++;events.push({type:s.target==='red'?'entry_red':s.target==='white'?'entry_white':'entry_black',number:r.number,minute_epoch:r.minute_epoch});
   }
   state.recent.push(r);if(state.recent.length>Math.max(1,s.pattern.length-1))state.recent.shift();
 }
 return {score,events:events.slice(-30)};
}
// V11: apenas um ciclo ativo por jogo, compartilhado por todas as estrategias.
const V11_GAME_ROOT=ROOT+'runtime/game-owner/';
const v11GameKey=gameId=>V11_GAME_ROOT+gameId+'.json';
export async function resetAfterCatchup(env,game,records){
 if(!records.length)return;
 const maxSeq=Math.max(...records.map(r=>Number(r.seq)||0));
 if(maxSeq<=0)return;
 const strategies=(await getDoc(env,strategyStorage(env),[])).filter(s=>!s.archived&&s.gameId===game.id);
 const prior=await getDoc(env,v11GameKey(game.id),null);
 if(prior&&maxSeq<=Number(prior.lastSeq||0))return;
 // V24: com dezenas de estrategias, uma unica marcacao de cursor basta.
 // O snapshot consolidado invalida ciclos antigos na proxima rodada nova.
 // Nenhum evento antigo e reemitido; a lista de resultados R2 nao e tocada.
 if(strategies.length>64||(await getDoc(env,v24SnapshotKey(game.id),null))?.version===24){
  await putDoc(env,v11GameKey(game.id),{ownerId:null,lastSeq:maxSeq,rebaseSeq:maxSeq,reason:'catchup',updatedAt:now()});
  return;
 }
 // V23: recuperar estados independentes em paralelismo limitado.
 // Cada estrategia tem chave propria, e o cursor do jogo so avanca APOS todas.
 let position=0;
 const worker=async()=>{
  while(position<strategies.length){
   const s=strategies[position++];
   const old=await getDoc(env,runtimeKey(s.id),null);
   if(old&&Number(old.lastSeq||0)>maxSeq)continue;
   if(old?.attentionEventId)await dismissAttention(env,s.id,old.attentionEventId);
   if(!old||maxSeq>Number(old.lastSeq||0)){
    await putDoc(env,runtimeKey(s.id),{lastSeq:maxSeq,recent:[],active:null,attentionEventId:null,catchupAt:now()});
   }
  }
 };
 await Promise.all(Array.from({length:Math.min(8,strategies.length)},()=>worker()));
 // Importacao historica nao abre nem continua sinais; nunca apagar rodadas.
 await putDoc(env,v11GameKey(game.id),{ownerId:null,lastSeq:maxSeq,updatedAt:now(),reason:'catchup'});
}
// NEXO V24: estado consolidado para muitas estrategias. Persistencia no R2,
// sem depender de RAM do Worker. Compatibilidade com runtime individual V23.
const v24SnapshotKey=gameId=>ROOT+'runtime/v24/'+gameId+'.json';
async function v24Each(items,max,work){
 let index=0;
 const runner=async()=>{while(index<items.length){const i=index++;await work(items[i],i)}};
 await Promise.all(Array.from({length:Math.min(max,items.length)},()=>runner()));
}
const v24Sig=s=>JSON.stringify([s.enabled,s.updatedAt,s.pattern,s.target,s.maxGale,s.jokerWhite,s.revision||'']);
const v24Compact=rows=>(rows||[]).map(r=>({number:r.number,color:r.color}));
async function v24ProcessMany(env,game,records,deadlineAtMs,strategies,snapshot,allStrategies=[],diagnostics=null){
 const ordered=[...records].filter(r=>Number.isInteger(r.seq)).sort((a,b)=>a.seq-b.seq);
 if(!ordered.length)return;
 const gameState=await getDoc(env,v11GameKey(game.id),{ownerId:null,lastSeq:0});
 const fresh=ordered.filter(r=>r.seq>Number(gameState.lastSeq||0));
 if(!fresh.length)return;
 // V26.5: configuracoes independentes lidas simultaneamente.
 const [settings,global]=await Promise.all([
  getDoc(env,K.settings,settingsDefault),
  globalDoc(env)
 ]);
 // V25: manter a mesma numeracao exibida no Telegram sem nova leitura R2.
 const strategyNumbers=new Map(allStrategies.filter(s=>!s.archived).map((s,i)=>[s.id,i+1]));
 let analysisStarted=Date.now();
 const rebaseSeq=Math.max(0,Number(gameState.rebaseSeq)||0);
 const states=new Map(),sigs=new Map(),scoreMap=new Map(),refreshed=new Set();
 const maxSeq=Math.max(...fresh.map(r=>r.seq));
 await v24Each(strategies,6,async s=>{
  const sig=v24Sig(s),cached=snapshot?.states?.[s.id];let st;
  if(cached&&cached.sig===sig){st={...cached.state};}
  else{
   st=await getDoc(env,runtimeKey(s.id),null);
  }
  if(!st){
   // Como no motor V23, nao disparar um cadastro sem cursor confirmado.
   st={lastSeq:maxSeq,recent:[],active:null,attentionEventId:null};
  }
  if(rebaseSeq>Number(st.lastSeq||0)){
   if(st.active||st.attentionEventId)refreshed.add(s.id);
   st={lastSeq:rebaseSeq,recent:[],active:null,attentionEventId:null};
  }
  st.recent=v24Compact(st.recent).slice(-Math.max(1,s.pattern.length-1));
  states.set(s.id,st);sigs.set(s.id,sig);
 });
 const scoreFor=async(s)=>{
  if(!scoreMap.has(s.id))scoreMap.set(s.id,await scoreRead(env,s.id));
  return scoreMap.get(s.id);
 };
 let ownerId=states.get(gameState.ownerId)?.active?gameState.ownerId:null;
 let attentionOwnerId=strategies.find(s=>states.get(s.id)?.attentionEventId)?.id||null;
 if(!ownerId){const oldOwner=strategies.find(s=>states.get(s.id)?.active);if(oldOwner)ownerId=oldOwner.id;}
 for(const s of strategies){const st=states.get(s.id);if(st?.active&&s.id!==ownerId){st.active=null;refreshed.add(s.id)}}
 for(const r of fresh){
  // V25: mesmo resultado, padrao e historico geram a mesma verificacao.
  // Compartilhar a verificacao evita milhares de repeticoes em regras iguais.
  const patternCache=new Map();
  const matches=(st,s,almost=false)=>{
   const pattern=almost?s.pattern.slice(0,-1):s.pattern;
   const tail=pattern.length>1?(st.recent||[]).slice(-(pattern.length-1)):[];
   const key=pattern.join('\u001f')+'|'+(s.jokerWhite?'1':'0')+'|'+[...tail,r].map(x=>String(x.number)+':'+x.color).join(',');
   if(patternCache.has(key))return patternCache.get(key);
   const ok=matchPat([...tail,r],pattern,s.jokerWhite);
   patternCache.set(key,ok);
   return ok;
  };
  let closedInThisRound=false;
  const preferred=!ownerId?strategies.find(s=>{const st=states.get(s.id);return st&&r.seq>Number(st.lastSeq||0)&&matches(st,s)}):null;
  const events=[],scoreDirty=new Set(),runtimeDirty=new Set();
  for(const s of strategies){
   const st=states.get(s.id);if(!st||r.seq<=Number(st.lastSeq||0))continue;
   const history=[...(st.recent||[]),r],full=matches(st,s);
   const almost=global.templates?.attention?.saved===true&&s.pattern.length>=2&&matches(st,s,true);
   if(st.attentionEventId&&(full||!almost||ownerId||preferred||!settings.botEnabled)){
    try{await dismissAttention(env,s.id,st.attentionEventId)}
    catch(e){console.warn('V24 attention cleanup:',String(e.message||e).slice(0,100))}
    st.attentionEventId=null;runtimeDirty.add(s.id);if(attentionOwnerId===s.id)attentionOwnerId=null;
   }
   if((ownerId&&ownerId!==s.id)||(preferred&&preferred.id!==s.id)){
    if(st.active){st.active=null;runtimeDirty.add(s.id)}
   }else if(st.active){
    const a=st.active;let type;
    if(r.color==='white'){type='win_white';(await scoreFor(s)).white++}
    else if(r.color===s.target){type=s.target==='red'?'win_red':'win_black';(await scoreFor(s)).green++}
    else if(a.step<s.maxGale){a.step++;type='gale'+a.step;(await scoreFor(s))[type]++}
    else{type='red';(await scoreFor(s)).red++}
    scoreDirty.add(s.id);runtimeDirty.add(s.id);
    events.push({s,r,type,step:a.step,entryRoundId:a.roundId});
    if(['red','win_white','win_red','win_black'].includes(type)){st.active=null;ownerId=null;closedInThisRound=true;}
   }else if(!ownerId&&!closedInThisRound&&full&&(!preferred||preferred.id===s.id)){
    st.active={step:0,roundId:r.id};ownerId=s.id;
    (await scoreFor(s)).entries++;scoreDirty.add(s.id);runtimeDirty.add(s.id);
    events.push({s,r,type:s.target==='red'?'entry_red':s.target==='white'?'entry_white':'entry_black',step:0});
   }else if(!ownerId&&!preferred&&!closedInThisRound&&!attentionOwnerId&&settings.botEnabled&&almost&&!st.attentionEventId){
    st.attentionEventId=s.id+'_'+r.id+'_attention';attentionOwnerId=s.id;runtimeDirty.add(s.id);
    events.push({s,r,type:'attention',step:0});
   }
   st.recent=v24Compact(history).slice(-Math.max(1,s.pattern.length-1));st.lastSeq=r.seq;
  }
  // Um documento R2 por jogo, em vez de ler e escrever estado e placar de
  // centenas de estrategias em toda rodada sem mudanca de pontuacao.
  const values={};for(const s of strategies){const st=states.get(s.id);if(st)values[s.id]={sig:sigs.get(s.id),state:st};}
  await putDoc(env,v24SnapshotKey(game.id),{version:24,gameId:game.id,lastSeq:r.seq,states:values,updatedAt:now()});
  await Promise.all([
   v24Each([...new Set([...runtimeDirty,...refreshed])],6,async id=>putDoc(env,runtimeKey(id),states.get(id))),
   v24Each([...scoreDirty],6,async id=>{const score=scoreMap.get(id);score.updatedAt=now();await putDoc(env,scoreKey(id),score)})
  ]);
  if(diagnostics)diagnostics.analysisMs=(diagnostics.analysisMs||0)+Date.now()-analysisStarted;
  refreshed.clear();
  const deliveryStarted=Date.now();
  for(const e of events)await fireEvent(env,settings,e.s,e.r,e.type,e.step,deadlineAtMs,global,strategyNumbers,e.entryRoundId);
  if(diagnostics)diagnostics.deliveryMs=(diagnostics.deliveryMs||0)+Date.now()-deliveryStarted;
  await putDoc(env,v11GameKey(game.id),{ownerId,lastSeq:r.seq,updatedAt:now()});
  analysisStarted=Date.now();
 }
}

export async function processNewRounds(env,game,records,deadlineAtMs=0,diagnostics=null){
 if(!env.R2||!records.length)return;
 const allStrategies=await getDoc(env,strategyStorage(env),[]);
 const strategies=allStrategies.filter(s=>s.enabled&&!s.archived&&s.gameId===game.id);
 if(!strategies.length)return;
 // V24: snapshot persistente para bases grandes. O modo rapido, uma vez
 // iniciado, continua valido mesmo apos pausar diversas estrategias.
 const fastSnapshot=await getDoc(env,v24SnapshotKey(game.id),null);
 if(allStrategies.length>64||strategies.length>48||fastSnapshot?.version===24)
  return v24ProcessMany(env,game,records,deadlineAtMs,strategies,fastSnapshot,allStrategies,diagnostics);
 const settings=await getDoc(env,K.settings,settingsDefault);
 const ordered=[...records].filter(x=>Number.isInteger(x.seq)).sort((a,b)=>a.seq-b.seq);
 if(!ordered.length)return;
 const global=await globalDoc(env);
 const states=new Map(),scoreMap=new Map();
 for(const s of strategies){
  const state=await getDoc(env,runtimeKey(s.id),null);
  // Mesma semantica da V10: estrategia nova nao dispara sobre lote antigo.
  if(!state){await putDoc(env,runtimeKey(s.id),{lastSeq:Math.max(...ordered.map(x=>x.seq)),recent:[],active:null});continue}
  states.set(s.id,state);scoreMap.set(s.id,await scoreRead(env,s.id));
 }
 const gameState=await getDoc(env,v11GameKey(game.id),{ownerId:null,lastSeq:0});
 let ownerId=states.get(gameState.ownerId)?.active?gameState.ownerId:null;
 let attentionOwnerId=strategies.find(s=>states.get(s.id)?.attentionEventId)?.id||null;
 // Compatibilidade: uma entrada ativa na V10 continua sendo dona do ciclo.
 if(!ownerId){const oldOwner=strategies.find(s=>states.get(s.id)?.active);if(oldOwner)ownerId=oldOwner.id}
 for(const s of strategies){
  const st=states.get(s.id);
  if(st?.active&&s.id!==ownerId)st.active=null;
 }
 for(const r of ordered){
  let closedInThisRound=false;
  // Se mais de uma estratégia casar na mesma rodada, priorizar a primeira da lista.
  const preferred=!ownerId?strategies.find(s=>{const st=states.get(s.id);return st&&r.seq>Number(st.lastSeq||0)&&matchPat([...(st.recent||[]),r],s.pattern,s.jokerWhite)}):null;
  for(const s of strategies){
   const state=states.get(s.id);if(!state||r.seq<=Number(state.lastSeq||0))continue;
   const score=scoreMap.get(s.id);const actions=[];
   const history=[...(state.recent||[]),r];
   const full=matchPat(history,s.pattern,s.jokerWhite);
   const almost=global.templates?.attention?.saved===true&&s.pattern.length>=2&&matchPat(history,s.pattern.slice(0,-1),s.jokerWhite);
   if(state.attentionEventId&&(full||!almost||ownerId||preferred||!settings.botEnabled)){
    try{await dismissAttention(env,s.id,state.attentionEventId)}
    catch(e){console.warn('V11 attention cleanup:',String(e.message||e).slice(0,100))}
    state.attentionEventId=null;if(attentionOwnerId===s.id)attentionOwnerId=null;
   }
   if((ownerId&&ownerId!==s.id)||(preferred&&preferred.id!==s.id)){
    state.active=null;
   }else if(state.active){
    const a=state.active;let type;
    if(r.color==='white'){type='win_white';score.white++}
    else if(r.color===s.target){type=s.target==='red'?'win_red':'win_black';score.green++}
    else if(a.step<s.maxGale){a.step++;type='gale'+a.step;score[type]++}
    else{type='red';score.red++}
    actions.push({type,step:a.step,entryRoundId:a.roundId});
    if(['red','win_white','win_red','win_black'].includes(type)){
     state.active=null;ownerId=null;closedInThisRound=true;
    }
   }else if(!ownerId&&!closedInThisRound&&full&&(!preferred||preferred.id===s.id)){
    state.active={step:0,roundId:r.id};ownerId=s.id;score.entries++;
    actions.push({type:s.target==='red'?'entry_red':s.target==='white'?'entry_white':'entry_black',step:0});
   }else if(!ownerId&&!preferred&&!closedInThisRound&&!attentionOwnerId&&settings.botEnabled&&almost&&!state.attentionEventId){
    state.attentionEventId=s.id+'_'+r.id+'_attention';
    actions.push({type:'attention',step:0});attentionOwnerId=s.id;
   }
   state.recent=history.slice(-Math.max(1,s.pattern.length-1));state.lastSeq=r.seq;
    // Operações de R2 independentes: confirmar ambas antes de emitir eventos.
    score.updatedAt=now();
    await Promise.all([putDoc(env,runtimeKey(s.id),state),putDoc(env,scoreKey(s.id),score)]);
   for(const action of actions)await fireEvent(env,settings,s,r,action.type,action.step,deadlineAtMs,global,null,action.entryRoundId);
  }
  await putDoc(env,v11GameKey(game.id),{ownerId,lastSeq:r.seq,updatedAt:now()});
 }
}
async function registerWebhook(req,env){
 if(!await hasBot(env))return err('Cadastre o token do bot primeiro.',503);
 const secret=await webhookSecret(env);if(!secret)return err('Configure o Secret NEXO_BOT_ENCRYPTION_KEY no Worker.',503);
 const existing=await tg(env,'getWebhookInfo',{}),desired=new URL(req.url).origin+'/api/telegram/webhook';
 if(existing.url&&existing.url!==desired)return err('Esse bot ainda usa o webhook de outro sistema. Desative o sistema anterior antes de transferir o webhook; NEXO nao ira substitui-lo.',409);
 const result=await tg(env,'setWebhook',{url:desired,secret_token:secret,allowed_updates:['my_chat_member','message','channel_post','callback_query'],drop_pending_updates:false});
 return json({ok:!!result,webhook:desired});
}
async function saveBotToken(req,env){
 if(!botKeyReady(env))return err('Configure NEXO_BOT_ENCRYPTION_KEY como Secret no Worker antes de salvar o bot.',503);
 const body=await req.json();const token=String(body?.token||'').trim();
 if(!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token))return err('Token do BotFather invalido.',400);
 const me=await tgUsing(token,'getMe',{});if(!me?.is_bot||!me?.id)return err('Token nao pertence a um bot Telegram.',400);
 const existing=await botInfo(env);const previousId=String(existing?.botId||'');
 const current=await getDoc(env,K.settings,settingsDefault);
 if(current.botEnabled)return err('Desative o envio de sinais antes de trocar o token do bot.',409);
 const tokenCipher=await sealBot(env,token);
 const row={...tokenCipher,botId:String(me.id),username:String(me.username||'').slice(0,70),savedAt:now()};
 await putDoc(env,K.bot,row);
 if(previousId&&previousId!==row.botId){
   const all=await getDoc(env,K.groups,[]);await putDoc(env,K.groups,all.map(g=>({...g,selected:false,admin:false})));await env.R2.delete?.(K.owner);
 }
 const owner=await getDoc(env,K.owner,null);let notified=false,webhook='nao configurado';
 try{if(owner?.id&&(!previousId||previousId===row.botId)){await sendOwnerConfirmation(env,owner.id,row.username);notified=true}}catch{notified=false}
 try{
  const info=await tgUsing(token,'getWebhookInfo',{}),desired=new URL(req.url).origin+'/api/telegram/webhook';
  if(info.url&&info.url!==desired)webhook='outro sistema';
  else{await tgUsing(token,'setWebhook',{url:desired,secret_token:await webhookSecret(env),allowed_updates:['my_chat_member','message','channel_post','callback_query'],drop_pending_updates:false});webhook='conectado'}
 }catch{webhook='falha ao registrar; use o botao de webhook'}
 return json({ok:true,bot:{username:row.username,id:row.botId},notified,webhook,notice:notified?'Confirmacao enviada ao chat privado vinculado.':'Para receber confirmacao no privado, vincule seu Telegram com o codigo do painel. O Telegram nao permite iniciar conversa antes disso.'});
}
async function createPairing(env){
 if(!await hasBot(env))return err('Cadastre o bot primeiro.',400);
 const code=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(x=>(x%36).toString(36).toUpperCase()).join('')+Array.from(crypto.getRandomValues(new Uint8Array(4))).map(x=>(x%36).toString(36).toUpperCase()).join('');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',UTF.encode(code)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 await putDoc(env,K.pair,{hash:digest,until:now()+600});return json({ok:true,command:'/vincular '+code,expires_in:600});
}

function fileOk(bytes,kind){const a=new Uint8Array(bytes);if(kind==='gif')return a.length>=10&&String.fromCharCode(...a.slice(0,6)).match(/^GIF8[79]a$/);
 return (a.length>=24&&a.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')||(a.length>=12&&String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP');}
// V25.4: exclusao rapida e em lotes. Nunca executar limpeza R2 pesada
// dentro da solicitacao HTTP; o cron faz a remocao por ID, com limite.
async function v26ScheduleStrategyPurge(env,ids){
 const all=await getDoc(env,strategyStorage(env),[]),wanted=new Set(ids);
 if(wanted.size!==ids.length||!ids.length||ids.length>10||ids.some(id=>!/^[a-f0-9]{32}$/.test(id)))
  return err('Escolha entre 1 e 10 estrategias validas e diferentes.',400);
 const found=all.filter(s=>wanted.has(s.id)&&!s.archived);
 if(found.length!==ids.length)return err('Uma ou mais estrategias nao existem ou ja foram excluidas. Atualize a pagina.',409);
 // Enfileirar a limpeza ANTES de ocultar as regras. O cron sempre valida que
 // a regra nao esteja ativa no catalogo: falha parcial nao apaga regra valida.
 for(const s of found)await putDoc(env,purgeTaskKey(s.id),{id:s.id,queuedAt:now(),pending:true,version:26});
 // Um unico update do catalogo remove todos os IDs sem tocar nos demais.
 await putDoc(env,strategyStorage(env),all.filter(s=>!wanted.has(s.id)));
 // Liberar imediatamente o ciclo se o dono foi excluido. Nao zerar o cursor.
 // Se esta escrita complementar falhar, a remocao confirmada nao pode
 // ser reportada como falha: V25.3 tambem saneia dono inativo na proxima rodada.
 for(const gameId of new Set(found.map(s=>s.gameId||activeGame(env)))){
  const gameKey=v11GameKey(gameId);
  try{
   const owner=await getDoc(env,gameKey,null);
   if(owner&&wanted.has(owner.ownerId))await putDoc(env,gameKey,{...owner,ownerId:null,updatedAt:now(),reason:'owner-strategy-deleted'});
  }catch(e){console.warn('V25.4.1: limpeza do dono pendente',String(e?.message||e).slice(0,100));}
 }
 return json({ok:true,deleted:found.length,ids:found.map(s=>s.id),cleanup:'scheduled'});
}


// NEXO_PRO_V15_GOOGLE: identidade Google validada no servidor, nunca apenas pelo email do navegador.
const nproGoogleB64=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Base64URL invalida');const b=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(b+'='.repeat((4-b.length%4)%4)),c=>c.charCodeAt(0));};
async function nproGoogleVerified(jwt,env){
 if(!env.NEXO_GOOGLE_CLIENT_ID||!env.NEXO_GOOGLE_ADMIN_EMAIL||!hasPassword(env))throw Error('Google nao configurado');
 if(typeof jwt!=='string'||jwt.length>6500)throw Error('Token invalido');
 const p=jwt.split('.');if(p.length!==3)throw Error('JWT invalido');
 const header=JSON.parse(new TextDecoder().decode(nproGoogleB64(p[0]))),claims=JSON.parse(new TextDecoder().decode(nproGoogleB64(p[1])));
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>180)throw Error('Algoritmo rejeitado');
 const nowTs=now();
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==env.NEXO_GOOGLE_CLIENT_ID||
   (claims.azp&&claims.azp!==env.NEXO_GOOGLE_CLIENT_ID)||claims.email_verified!==true||
   String(claims.email||'').toLowerCase()!==String(env.NEXO_GOOGLE_ADMIN_EMAIL).trim().toLowerCase()||
   !/^[0-9]{5,30}$/.test(String(claims.sub||''))||
   !Number.isInteger(claims.exp)||claims.exp<=nowTs||claims.exp>nowTs+3700||
   !Number.isInteger(claims.iat)||claims.iat>nowTs+60||claims.iat<nowTs-3700)throw Error('Conta Google nao autorizada');
 const keysResponse=await fetch('https://www.googleapis.com/oauth2/v3/certs',{headers:{Accept:'application/json'}});
 if(!keysResponse.ok)throw Error('Certificado Google indisponivel');
 const keys=await keysResponse.json(),jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');
 if(!jwk)throw Error('Assinatura Google nao reconhecida');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,nproGoogleB64(p[2]),UTF.encode(p[0]+'.'+p[1]));
 if(!ok)throw Error('Assinatura Google invalida');
 return claims;
}

export async function routeAdmin(req,env,url){
 const path=url.pathname;
 if(path==='/api/telegram/webhook'&&req.method==='POST')return telegramWebhook(req,env);
 if(!path.startsWith('/api/adm/'))return null;
 if(!env.R2)return err('Binding R2 indisponivel',503);

 // Google Sign-In: o Client ID e publico, mas a identidade só vale após verificacao RS256.
 if(path==='/api/adm/google-config'&&req.method==='GET'){
   return json({ok:true,enabled:!!(env.NEXO_GOOGLE_CLIENT_ID&&env.NEXO_GOOGLE_ADMIN_EMAIL&&hasPassword(env)),clientId:env.NEXO_GOOGLE_CLIENT_ID||''});
 }
 if(path==='/api/adm/google-login'&&req.method==='POST'){
   if(!sameOrigin(req))return err('Origem nao permitida',403);
   try{
     if(Number(req.headers.get('Content-Length')||0)>8000)return err('Requisicao muito grande',413);
     const body=await req.json();await nproGoogleVerified(body?.credential,env);
     const exp=String(now()+7200),sig=await sign(exp,env);
     return json({ok:true,expires_at:Number(exp)},200,{'Set-Cookie':sessionCookie(exp+'.'+sig,7200)});
   }catch{return err('Conta Google nao autorizada ou validacao indisponivel',401);}
 }

 // NEXO_PRO_V13: only the explicitly public platform link is readable without a session.
 if(path==='/api/adm/nexo-pro-public'&&req.method==='GET'){
  const c=await getDoc(env,'nexo-pro/v13/public-link.json',{enabled:false,name:'Acessar plataforma',url:''});
  return json({ok:true,enabled:c.enabled===true,name:String(c.name||'Acessar plataforma'),url:c.enabled===true?String(c.url||''):''});
 }
 if(!sameOrigin(req)&&req.method!=='GET')return err('Origem nao permitida',403);
 if(path==='/api/adm/login'&&req.method==='POST')return login(req,env);
 if(path==='/api/adm/me')return json({ok:await authenticated(req,env),configured:hasPassword(env)});
 if(path==='/api/adm/local-control-panel'&&req.method==='GET')return Response.redirect(new URL('/controle-termux',req.url),302); // NEXO_TERMO_CONTROL_PUBLIC_SHELL
 if(!await authenticated(req,env))return err('Entre com a senha de administrador.',401);
 if(path.startsWith('/api/adm/colors-capture')){const cap=await captureAdmin(req,env,path,()=>recentR2(env,'blitz-double'));if(cap)return cap;}
 if(path==='/api/adm/nexo-pro-public'&&req.method==='POST'){
  const c=await req.json().catch(()=>null);
  if(!c||typeof c.enabled!=='boolean'||typeof c.name!=='string'||typeof c.url!=='string')return err('Parametros invalidos',400);
  const label=c.name.trim(),raw=c.url.trim();if(label.length>55||raw.length>600)return err('Nome ou URL muito longos',400);
  let valid='';if(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||!u.hostname||u.hostname==='localhost')return err('Use URL publica HTTPS',400);valid=u.href;}catch{return err('URL invalida',400)}}
  if(c.enabled&&(!label||!valid))return err('Informe nome e link HTTPS antes de ativar',400);
  const next={enabled:c.enabled,name:label||'Acessar plataforma',url:valid};
  await putDoc(env,'nexo-pro/v13/public-link.json',next);return json({ok:true,...next});
 }
 // NEXO_BIBLIOTECA_CENTRAL_V7: only the Cores catalog is a shared source; no Crash data.
 if(path==='/api/adm/shared-media/for-branco'&&req.method==='POST'){
  const payload=await req.json().catch(()=>null),id=String(payload?.id||'');
  if(!/^[a-f0-9]{32}$/.test(id))return err('ID da biblioteca Cores invalido',400);
  const catalog=await getDoc(env,K.media,[]),item=catalog.find(m=>m.id===id&&['sticker','gif'].includes(m.kind));
  if(!item)return err('Sticker ou GIF nao encontrado na biblioteca das Cores',404);
  // Never use a Telegram file_id from one bot in another bot.
  let bytes,mime=String(item.mime||'');
  if(item.fileId){
   try{
    const f=await tg(env,'getFile',{file_id:item.fileId});
    if(!f?.file_path||Number(f.file_size||0)>4*1024*1024)return err('Arquivo maior que 4 MB ou indisponivel',413);
    const colorsToken=await botToken(env);
    const r=await fetch('https://api.telegram.org/file/bot'+colorsToken+'/'+f.file_path,{signal:AbortSignal.timeout(14000)});
    if(!r.ok)return err('Nao foi possivel baixar a figurinha da biblioteca Cores',502);
    bytes=await r.arrayBuffer();
    const ext=f.file_path.toLowerCase().split('.').pop();
    mime=({webp:'image/webp',png:'image/png',gif:'image/gif',mp4:'video/mp4',tgs:'application/x-tgsticker',webm:'video/webm'})[ext]||mime;
   }catch(e){return err('Erro ao obter midia do bot Cores: '+String(e.message||e).slice(0,100),502)}
  }else{
   const object=await env.R2.get(ROOT+'media/files/'+id);
   if(!object)return err('Arquivo original da biblioteca Cores nao encontrado',404);
   bytes=await object.arrayBuffer();
  }
  if(bytes.byteLength<30||bytes.byteLength>4*1024*1024)return err('Midia excede limite de 4 MB do Branco',413);
  const content=new Uint8Array(bytes);
  const isPng=content[0]===137&&content[1]===80&&content[2]===78&&content[3]===71;
  const isWebp=content[0]===82&&content[1]===73&&content[2]===70&&content[3]===70&&String.fromCharCode(...content.slice(8,12))==='WEBP';
  const isGif=String.fromCharCode(...content.slice(0,3))==='GIF';
  const isMp4=String.fromCharCode(...content.slice(4,8))==='ftyp';
  const isTgs=content[0]===31&&content[1]===139&&content[2]===8;
  const isWebm=content[0]===26&&content[1]===69&&content[2]===223&&content[3]===163;
  mime=isWebp?'image/webp':isPng?'image/png':isGif?'image/gif':isMp4?'video/mp4':isTgs?'application/x-tgsticker':isWebm?'video/webm':'';
  if(!mime||(item.kind==='sticker'&&!['image/webp','image/png','application/x-tgsticker','video/webm'].includes(mime))||(item.kind==='gif'&&!['image/gif','video/mp4'].includes(mime)))return err('Formato nao suportado pelo Branco. Use sticker WEBP/PNG/TGS/WEBM ou GIF/MP4',415);
  const whiteCatalog=await getDoc(env,'nexo-branco-vip/v1/media.json',[]);
  const previous=whiteCatalog.find(m=>m.colorsId===id);
  if(previous)return json({ok:true,id:previous.id,kind:previous.kind,reused:true});
  const chunks=[];for(let i=0;i<content.length;i+=16384)chunks.push(String.fromCharCode(...content.slice(i,i+16384)));
  const b64=btoa(chunks.join(''));
  const url=new URL('/api/adm/branco-vip/media/import',req.url);
  const delegated=new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:item.kind,mime,name:String(item.name||'STICKER CORES').slice(0,60),data:b64})});
  const reply=await brancoVipAdmin(delegated,env,url);
  if(!reply)return err('Importador Branco indisponivel',503);
  if(!reply.ok)return reply;
  const result=await reply.json();
  if(!result.ok)return json(result,reply.status);
  // Link source for deterministic reuse while keeping White bot-specific file_id isolated.
  const list=await getDoc(env,'nexo-branco-vip/v1/media.json',[]);
  const matched=list.find(m=>m.id===result.id);
  if(matched){matched.colorsId=id;await putDoc(env,'nexo-branco-vip/v1/media.json',list)}
  return json({ok:true,id:result.id,kind:item.kind,reused:false});
 }
 const brancoAdm=await brancoVipAdmin(req,env,url);if(brancoAdm)return brancoAdm;
 if(path.startsWith('/api/adm/fortune/')){const fortuneReply=await fortuneAdmin(req,env,url);if(fortuneReply)return fortuneReply;}
  if(path.startsWith('/api/adm/crash/v3/')){const owner=(await getDoc(env,K.owner,null))?.id;const reply=await crashV3Admin(req,env,url,{ownerId:owner});if(reply)return reply;}
 if(path.startsWith('/api/adm/cloud/')){const r=await cloudAdmin(req,env,url);if(r)return r;}
 if(path.startsWith('/api/adm/crash/')){const crashReply=await crashAdmin(req,env,url,{sendTelegram:(method,body)=>tg(env,method,body),ownerId:(await getDoc(env,K.owner,null))?.id,groups:await getDoc(env,K.groups,[])});if(crashReply)return crashReply;}
  const whiteReply=await routeWhiteAdmin(req,env,url);if(whiteReply)return whiteReply;
 if(path==='/api/adm/logout'&&req.method==='POST')return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
 const settings=()=>getDoc(env,K.settings,settingsDefault);
 const strategies=()=>getDoc(env,strategyStorage(env),[]);
  const groups=()=>getDoc(env,K.groups,[]);
  try{
// NEXO_REMOTE_CONTROL_V5 - use within routeAdmin authenticated try{} block.
  if(path==='/api/adm/local-control' && req.method==='GET'){
    const current=await getDoc(env,'nexo-v3/local-control/desired-v5.json',null);
    const heartbeat=await getDoc(env,'nexo-v3/local-control/heartbeat-v5.json',null);
    const remote=await settings();
    return json({ok:true,desired:current?.enabled ?? null,configured:!!current,
      revision:current?.revision||0,heartbeat:heartbeat||null,
      remoteBotEnabled:remote.botEnabled===true});
  }
  if(path==='/api/adm/local-control' && req.method==='POST'){
    const b=await req.json().catch(()=>null);
    if(!b || typeof b.enabled!=='boolean')return err('enabled deve ser booleano',400);
    const remote=await settings();
    if(b.enabled && remote.botEnabled===true)return err('Envio remoto Cloudflare ainda habilitado; desligue antes de ligar Termux',409);
    const key='nexo-v3/local-control/desired-v5.json';
    const previous=await getDoc(env,key,null);
    const current={enabled:b.enabled,revision:(Number(previous?.revision)||0)+1,updatedAt:now(),source:'site-admin'};
    await putDoc(env,key,current);
    return json({ok:true,...current,notice:'Comando salvo; aguarde confirmacao do Termux no painel.'});
  }
  if(path==='/api/adm/local-control-panel' && req.method==='GET'){
    return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXO Termux • Controle</title><style>body{font:16px system-ui;background:#101319;color:#f4f5f7;max-width:560px;margin:32px auto;padding:18px}section{background:#1c232e;padding:24px;border-radius:18px}button{font-size:18px;font-weight:700;padding:16px 24px;border:0;border-radius:12px;margin:8px;cursor:pointer}button:disabled{opacity:.4}.on{background:#1cbd6c;color:#101810}.off{background:#e65353;color:#fff}pre{white-space:pre-wrap;background:#0d1118;padding:15px;border-radius:12px;line-height:1.6}a{color:#b5cbff}</style><section><h1>⚡ NEXO BLITZ PRO</h1><p>Controle do motor TERMUX. O site não envia sinais.</p><button class="on" id="on">LIGAR</button><button class="off" id="off">DESLIGAR</button><pre id="status">Carregando...</pre><p id="info"></p><a href="/adm/">Voltar ao ADM</a></section><script>
const e=id=>document.getElementById(id);const endpoint='/api/adm/local-control';
async function refresh(){try{const r=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);const h=j.heartbeat||{};const delta=h.at?Math.floor(Date.now()/1000)-h.at:null;const online=delta!==null&&delta<75;e('status').textContent='Comando salvo: '+(j.desired?'LIGADO':'DESLIGADO')+'\nTermux: '+(online?'CONECTADO':'SEM CONFIRMAÇÃO RECENTE')+'\nMotor real: '+(online?(h.motor?'ATIVO':'PARADO'):'DESCONHECIDO')+'\nColeta: '+(online?(h.collector?'ATIVA':'PARADA'):'DESCONHECIDA')+'\nÚltima comunicação: '+(delta===null?'nunca':delta+' s')+'\nRevisão aplicada: '+(h.revision||0)+' / '+j.revision+'\nEnvio pelo Worker: '+(j.remoteBotEnabled?'ATIVO (CONFLITO)':'desligado');e('on').disabled=j.remoteBotEnabled;e('info').textContent=j.configured?'O comando fica salvo até você alterá-lo.':'Estado inicial ainda não definido: clique LIGAR ou DESLIGAR para salvar.'}catch(err){e('status').textContent='Erro ao consultar: '+err.message}}
async function set(enabled){if(!confirm(enabled?'Ligar sinais no Termux?':'Desligar sinais no Termux e manter desligado até novo comando?'))return;e('on').disabled=e('off').disabled=true;try{const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);e('info').textContent='Comando salvo. Aguardando Termux confirmar.'}catch(err){e('info').textContent='Falha: '+err.message}finally{e('off').disabled=false;refresh()}}
e('on').onclick=()=>set(true);e('off').onclick=()=>set(false);refresh();setInterval(refresh,10000);
</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }

   if(path==='/api/adm/queue-health'&&req.method==='GET'){
    if(!env.NEXO_COORDINATOR)return err('Coordenador da fila indisponivel.',503);
    const id=env.NEXO_COORDINATOR.idFromName(activeGame(env)==='blitz-double'?'nexo-blitz-double-v11':'nexo-brabet-double-v11');
    return env.NEXO_COORDINATOR.get(id).fetch('https://nexo.internal/v11/queue-health');
   }
  if(path==='/api/adm/bootstrap'&&req.method==='GET'){
   const [st,ss,gs,media]=await Promise.all([settings(),strategies(),groups(),getDoc(env,K.media,[])]);
   const active=ss.filter(x=>!x.archived);
   const scoresData=await scores(env,active);
   const latest=await recentR2(env,activeGame(env));
   const stored=await botInfo(env),owner=await getDoc(env,K.owner,null);return json({ok:true,settings:st,strategies:active.map((s,i)=>({...s,displayNumber:i+1})),groups:gs,media,scores:scoresData,latestCount:latest.items?.length||0,telegramConfigured:!!stored||!!env.NEXO_TELEGRAM_BOT_TOKEN,botName:stored?.username||'',ownerPaired:!!owner?.id,webhookSecretConfigured:!!await webhookSecret(env)});
  }
  if(path==='/api/adm/global-signals'&&req.method==='GET')return json({ok:true,config:await globalDoc(env)});
  if(path==='/api/adm/global-signals'&&req.method==='PUT'){
   const b=await req.json();if(!b||typeof b!=='object')return err('Configuração inválida');
   const current=await globalDoc(env),next={...emptyGlobal(),...current,templates:{...(current.templates||{})}};
   if(b.mode==='link')next.registration=validRegistration(b.registration);
   else if(b.mode==='afterPattern'){
      if(!b.afterPattern||typeof b.afterPattern!=='object'||typeof b.afterPattern.text!=='string'||b.afterPattern.text.length>400)return err('Mensagem Após pedra inválida. Limite: 400 caracteres.',400);
      const afterText=b.afterPattern.text.trim();
      if(b.afterPattern.enabled!==false&&!afterText)return err('Informe a mensagem Após pedra.',400);
      next.afterPattern={enabled:b.afterPattern.enabled!==false,text:afterText};
    }
   else if(b.mode==='stone'){
     if(!b.stone||typeof b.stone!=='object'||typeof b.stone.text!=='string'||b.stone.text.length>400)return err('Configuração da pedra inválida. Máximo 400 caracteres.',400);
     const stText=b.stone.text.trim();
     if(b.stone.enabled!==false&&!stText)return err('Informe o texto da pedra sorteada.',400);
     next.stone={enabled:b.stone.enabled!==false,text:stText};
    }
   else if(b.mode==='event'){
    const catalog=await getDoc(env,K.media,[]);
    next.templates[b.key]=normalizeGlobalEvent(b.key,b.template,catalog);
   }else return err('Escolha um evento ou link válido.');
   next.updatedAt=now();await putDoc(env,GLOBAL_KEY,next);
   return json({ok:true,config:next});
  }
  if(path==='/api/adm/settings'&&req.method==='PUT'){
   const b=await req.json(),current=await settings();
   const next={...current,showNumbers:b.showNumbers!==false,jokerWhite:b.jokerWhite===true,resetMidnight:b.resetMidnight!==false,updatedAt:now()};
   await putDoc(env,K.settings,next);return json({ok:true,settings:next});
  }
   // V20: importacao idempotente em lotes limitados. NUNCA ativa sinais.
   if(path==='/api/adm/strategies/import-batch'&&req.method==='POST'){
     const body=await req.json();const input=body?.items;
     if(!Array.isArray(input)||input.length<1||input.length>10)return err('Envie de 1 a 10 padroes por lote.',400);
     const gale=Number(body.maxGale);
     if(![0,1,2].includes(gale))return err('Gale deve ser 0, 1 ou 2.',400);
     const all=await strategies();const keys=new Set(all.filter(x=>!x.archived).map(x=>x.target+'|'+JSON.stringify(x.pattern)));
     const added=[];let skipped=0;
     for(const raw of input){
       if(!raw||typeof raw!=='object'||!Array.isArray(raw.tokens)||raw.tokens.length<1||raw.tokens.length>MAX_PATTERN_STONES||!TARGETS.includes(raw.target)||raw.tokens.some(t=>typeof t!=='string'||!(['red','black','white','*'].includes(t)||/^(?:n:)(?:[0-9]|1[0-4])$/.test(t))))return err('Padrao ou alvo invalido.',400);
       const key=raw.target+'|'+JSON.stringify(raw.tokens);
       if(keys.has(key)){skipped++;continue;}
       const title='Histórico · '+raw.tokens.map(t=>t==='red'?'🔴':t==='black'?'⚫':t==='white'?'⚪':t.startsWith('n:')?t.slice(2):'★').join(' ')+' → '+(raw.target==='white'?'⚪':raw.target==='red'?'🔴':'⚫');
       const item=validateStrategy({name:title.slice(0,70),gameId:activeGame(env),target:raw.target,pattern:raw.tokens,maxGale:gale,enabled:false,showStoneAfter:true,showAfterPattern:true,showNumbers:true,jokerWhite:false},null);
       added.push(item);keys.add(key);
     }
     if(added.length){
       const latest=await recentR2(env,activeGame(env)),cursor=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));
       // Persistir runtime de cada regra ANTES da lista de estrategias; em caso
       // de falha, nenhuma regra ativa nasce sem cursor de seguranca.
       for(const s of added){await putDoc(env,runtimeKey(s.id),{lastSeq:cursor,recent:[],active:null});await resetScore(env,s.id);}
       await putDoc(env,strategyStorage(env),[...all,...added]);
     }
     return json({ok:true,added:added.length,skipped,ids:added.map(s=>s.id)});
   }
   // V20: mudar o Gale de TODAS as regras existentes com uma unica acao.
   if(path==='/api/adm/strategies/gale-all'&&req.method==='POST'){
     const body=await req.json(),gale=Number(body?.maxGale);
     if(body?.confirm!==true||![0,1,2].includes(gale))return err('Confirme um Gale valido (0, 1 ou 2).',400);
     const all=await strategies(),updated=all.map(s=>s.archived?s:{...s,maxGale:gale,updatedAt:now()});
     await putDoc(env,strategyStorage(env),updated);
     return json({ok:true,count:all.filter(s=>!s.archived).length,maxGale:gale,notice:'O Gale atualizado vale tambem para os proximos eventos das regras ativas.'});
   }
   // NEXO V21: alterar apenas as regras cujo estado difere do solicitado.
   // Um lote pequeno evita exceder as cotas de subrequests no Worker.
   // NUNCA liga/desliga o bot global e NUNCA importa rodadas como sinais.
   if(path==='/api/adm/strategies/toggle-batch'&&req.method==='POST'){
     const body=await req.json();
     const ids=body?.ids;
     if(body?.confirm!==true||typeof body?.enabled!=='boolean'||!Array.isArray(ids)||ids.length<1||ids.length>10||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))||new Set(ids).size!==ids.length)
       return err('Confirme o estado e informe 1 a 10 IDs únicos de estratégias.',400);
     const all=await strategies(),desired=body.enabled,idSet=new Set(ids);
     const changed=all.filter(x=>idSet.has(x.id)&&!x.archived&&x.enabled!==desired);
     const notFound=ids.filter(id=>!all.some(s=>s.id===id&&!s.archived));
     if(notFound.length)return err('Uma ou mais estratégias não existem ou foram arquivadas.',404);
     if(!changed.length)return json({ok:true,changed:0,unchanged:ids.length,enabled:desired});
     if(desired){
       // Regra recém-ativada inicia DEPOIS da última pedra disponível.
       // Regras que já estavam ativas conservam seu estado e placar.
       const latest=await recentR2(env,activeGame(env));
       const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));
       await Promise.all(changed.map(s=>putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null})));
     }
     await putDoc(env,strategyStorage(env),all.map(s=>idSet.has(s.id)&&!s.archived&&s.enabled!==desired?{...s,enabled:desired,updatedAt:now(),revision:crypto.randomUUID()}:s));
     const warnings=[];
     if(!desired){
       // Persistir o estado pausado primeiro; depois limpar avisos/bloqueios.
       for(const s of changed){
         try{
           const state=await getDoc(env,runtimeKey(s.id),null);
           if(state?.attentionEventId)await dismissAttention(env,s.id,state.attentionEventId);
           await v11DropStrategyBlocks(env,s.id);
         }catch(e){warnings.push(s.id);console.warn('V21 desativacao: limpeza pendente',s.id,String(e?.message||e).slice(0,80));}
       }
     }
     return json({ok:true,changed:changed.length,unchanged:ids.length-changed.length,enabled:desired,cleanupWarnings:warnings.length});
   }
  if(path==='/api/adm/strategies/purge-batch'&&req.method==='POST'){
   const b=await req.json();
   if(b?.confirm!==true||!Array.isArray(b.ids))return err('Confirmacao e IDs obrigatorios.',400);
   return await v26ScheduleStrategyPurge(env,b.ids);
  }
  if(path==='/api/adm/strategies'&&req.method==='POST'){
   const b=await req.json();const all=await strategies();/* V10: sem limite artificial de 30 estratégias; o armazenamento e as cotas do Worker continuam valendo. */
   if(b&&typeof b==='object'&&!String(b.name||'').trim()){let n=1;const existing=new Set(all.filter(x=>!x.archived).map(x=>x.name));while(existing.has('Estratégia '+n))n++;b.name='Estratégia '+n;}
    const s=validateStrategy({...b,gameId:activeGame(env),enabled:false},null);all.push(s);await putDoc(env,strategyStorage(env),all);
   const latest=await recentR2(env,s.gameId);const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));
   await putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null});await resetScore(env,s.id);
   return json({ok:true,strategy:s});
  }
  const match=path.match(/^\/api\/adm\/strategies\/([a-f0-9]{32})(?:\/(simulate|purge))?$/);
  if(match){const id=match[1],all=await strategies(),idx=all.findIndex(x=>x.id===id&&!x.archived);if(idx<0)return err('Estrategia nao encontrada',404);
   if(match[2]==='simulate'&&req.method==='POST'){const hist=await recentR2(env,all[idx].gameId);return json({ok:true,...await simulate(all[idx],hist.items||[])});}
   if(match[2]==='purge'&&req.method==='POST'){
    const b=await req.json(),s=all[idx];
    if(b?.confirm!==true||(b?.id!==s.id&&b?.name!==s.name))return err('Confirme o ID ou nome da estrategia selecionada.',400);
    return await v26ScheduleStrategyPurge(env,[id]);
   }
   if(req.method==='PUT'&&!match[2]){
    const b=await req.json();const was=all[idx].enabled;const previous=all[idx],s=validateStrategy(b,previous);
    const changed=JSON.stringify(s.pattern)!==JSON.stringify(previous.pattern)||s.jokerWhite!==previous.jokerWhite;
    const reset=changed||(s.enabled&&!was);
    if(reset||!s.enabled){
      const oldRuntime=await getDoc(env,runtimeKey(s.id),null);
      if(oldRuntime?.attentionEventId)await dismissAttention(env,s.id,oldRuntime.attentionEventId);
    }
    // Não reprocessar histórico antigo quando uma regra muda ou volta a ser ativada.
    if(reset){const latest=await recentR2(env,s.gameId);const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));await putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null});}
    all[idx]=s;await putDoc(env,strategyStorage(env),all);if(was&&!s.enabled)await v11DropStrategyBlocks(env,s.id);return json({ok:true,strategy:s});
   }
   if(req.method==='DELETE'&&!match[2]){
    const runtime=await getDoc(env,runtimeKey(id),null);
    if(runtime?.attentionEventId)await dismissAttention(env,id,runtime.attentionEventId);
    all[idx]={...all[idx],enabled:false,archived:true,updatedAt:now()};await putDoc(env,strategyStorage(env),all);await v11DropStrategyBlocks(env,id);
    return json({ok:true});
   }
  }
  if(path==='/api/adm/bot/save'&&req.method==='POST')return saveBotToken(req,env);
  if(path==='/api/adm/bot/pair'&&req.method==='POST')return createPairing(env);
  if(path==='/api/adm/telegram/owner-id'&&req.method==='PUT'){
    if(!await hasBot(env))return err('Cadastre o token do robô antes do ID.',409);
    const b=await req.json(),id=String(b.id||'').trim();
    if(!/^[1-9][0-9]{4,19}$/.test(id))return err('Informe o ID numérico da sua conta Telegram, de 5 a 20 dígitos.',400);
    const owner=await getDoc(env,K.owner,null);
    if(owner?.id&&owner.id!==id)return err('Existe outro administrador verificado. Desvincule-o primeiro pelo ADM.',409);
    await putDoc(env,OWNER_ID_KEY,{id,requestedAt:now()});
    return json({ok:true,id,verified:owner?.id===id,notice:'Abra o privado do bot e envie /start para confirmar o ID. Nenhum código precisa ser copiado.'});
   }
  if(path==='/api/adm/telegram/owner/unlink'&&req.method==='POST'){
    const b=await req.json();if(b.confirm!==true)return err('Confirmação obrigatória.',400);
    await env.R2.delete?.(K.owner);await env.R2.delete?.(OWNER_ID_KEY);await env.R2.delete?.(K.pair);
    return json({ok:true,notice:'ID desvinculado. O token e os grupos continuam preservados.'});
   }
  if(path==='/api/adm/telegram/bot/remove'&&req.method==='POST'){
    const b=await req.json();if(b.confirm!==true)return err('Confirme a remoção do bot.',400);
    const st=await settings();if(st.botEnabled)return err('Desative os envios antes de remover o robô.',409);
    const stored=await botInfo(env);if(!stored)return err('Não há bot cadastrado no ADM.',404);
    if(env.NEXO_TELEGRAM_BOT_TOKEN)return err('Existe token adicional no Worker. Remova o Secret externo antes de descadastrar o bot.',409);
    let info;
    try{info=await tg(env,'getWebhookInfo',{})}catch{return err('Não foi possível verificar o webhook. Confira a chave NEXO_BOT_ENCRYPTION_KEY antes de remover.',503)}
    const desired=new URL(req.url).origin+'/api/telegram/webhook';
    if(info.url===desired){
      try{await tg(env,'deleteWebhook',{drop_pending_updates:false})}catch{return err('O webhook não foi desconectado. Nada foi removido.',503)}
    }
    await env.R2.delete?.(K.bot);await env.R2.delete?.(K.owner);
    await env.R2.delete?.(OWNER_ID_KEY);await env.R2.delete?.(K.pair);
    const current=await groups();await putDoc(env,K.groups,current.map(g=>({...g,selected:false,admin:false})));
    return json({ok:true,notice:'Bot removido; estratégias, mídias e históricos preservados. Grupos desmarcados.'});
   }
  if(path==='/api/adm/telegram/status'&&req.method==='GET'){
    const stored=await botInfo(env),configured=!!stored||!!env.NEXO_TELEGRAM_BOT_TOKEN;
    const [owner,requested,known,st]=await Promise.all([
       getDoc(env,K.owner,null),getDoc(env,OWNER_ID_KEY,null),groups(),settings()]);
    let webhook='inactive',keyState=stored?.ciphertext?(botKeyReady(env)?'ready':'missing'):'external';
    let canUseToken=true;
    if(stored?.ciphertext&&botKeyReady(env)){
      try{await botToken(env)}catch{canUseToken=false;keyState='mismatch';webhook='error'}
    }else if(stored?.ciphertext){canUseToken=false;webhook='error'}
    if(configured&&canUseToken){
     try{
      const info=await tg(env,'getWebhookInfo',{}),expected=new URL(req.url).origin+'/api/telegram/webhook';
      webhook=info.url===expected?'connected':info.url?'foreign':'inactive';
     }catch(e){webhook='error';console.warn('ADM bot status:',String(e.message||e).slice(0,70));}
    }
    return json({ok:true,configured,botName:stored?.username||'',ownerPaired:!!owner?.id,
      ownerId:owner?.id||'',requestedId:requested?.id||'',webhook,keyState,
      botEnabled:st.botEnabled===true,groupsDetected:known.length,groupsSelected:known.filter(g=>g.selected&&g.admin).length});
   }
  if(path==='/api/adm/groups'&&req.method==='GET')return json({ok:true,groups:await groups()});
  if(path==='/api/adm/groups/selection'&&req.method==='PUT'){
   const b=await req.json();if(!Array.isArray(b.ids)||b.ids.length>5||b.ids.some(x=>!/^[-\d]{1,20}$/.test(String(x))))return err('Selecione ate 5 grupos validos.');
   const existing=await groups(),ids=new Set(b.ids.map(String));
   if(b.ids.some(x=>!existing.some(g=>g.id===String(x)&&g.admin)))return err('Bot precisa estar ADM em todos os grupos selecionados.');
   const next=existing.map(x=>({...x,selected:x.admin&&ids.has(x.id)}));await putDoc(env,K.groups,next);return json({ok:true,groups:next});
  }
  if(path==='/api/adm/groups/refresh'&&req.method==='POST'){
   if(!await hasBot(env))return err('Cadastre o token do bot no ADM.',503);
   const all=await groups();const next=[];for(const g of all.slice(0,30))next.push({...g,admin:await botAdmin(env,g.id),updatedAt:now()});
   await putDoc(env,K.groups,next);const info=await tg(env,'getWebhookInfo',{});
   return json({ok:true,groups:next,webhookActive:!!info.url,ourWebhook:info.url===new URL(req.url).origin+'/api/telegram/webhook',notice:'O Telegram so envia grupos atraves de eventos recentes ou comando /nexo_grupo.'});
  }
  if(path==='/api/adm/webhook/register'&&req.method==='POST')return registerWebhook(req,env);
  // NEXO_BLITZ_RECOVERY_V2: transferencia segura somente do BLITZ DOUBLE.
  if(path==='/api/adm/blitz-live-check'&&req.method==='GET'){
    const d=await getDoc(env,'nexo-v3/local-control/desired-v5.json',null);
    const h=await getDoc(env,'nexo-v3/local-control/heartbeat-v5.json',null);
    const st=await settings();
    const latest=await recentR2(env,'blitz-double');
    const head=(latest.items||[])[0]||null;
    const age=head?.minute_epoch?now()-Number(head.minute_epoch):null;
    const owner=await getDoc(env,K.owner,null);
    const gs=await groups();
    const a=(await strategies()).filter(s=>s.enabled&&!s.archived&&s.gameId==='blitz-double');
    const localStopped=d?.enabled===false&&h?.motor===false&&now()-Number(h.at||0)<60;
    return json({ok:true,game:'blitz-double',remoteEnabled:st.botEnabled===true,
      localDesired:d?.enabled??null,localMotor:h?.motor??null,heartbeatAge:h?.at?now()-Number(h.at):null,
      localStopped,feedAgeSeconds:age,feedFresh:age!==null&&age>=-180&&age<=180,
      lastSeq:head?.seq??null,privateVerified:!!owner?.id,
      selectedGroups:gs.filter(g=>g.selected&&g.admin).length,activeStrategies:a.length,
      ready:localStopped&&age!==null&&age>=-180&&age<=180&&a.length>0&&await hasBot(env)&&
         (!!owner?.id||gs.some(g=>g.selected&&g.admin))});
  }
  if(path==='/api/adm/telegram/activate'&&req.method==='POST'){
   // NEXO_BLITZ_RECOVERY_V2: previne Cloudflare + Termux simultaneos e dados obsoletos.
   const localDesired=await getDoc(env,'nexo-v3/local-control/desired-v5.json',null);
   const heartbeat=await getDoc(env,'nexo-v3/local-control/heartbeat-v5.json',null);
   if(localDesired?.enabled!==false||heartbeat?.motor!==false||now()-Number(heartbeat?.at||0)>=60)
     return err('Motor Termux nao confirmou PARADO. Desligue Cores em /controle-termux e aguarde confirmacao recente.',409);
   const last=await recentR2(env,'blitz-double');
   const recent=(last.items||[])[0];
   const age=recent?.minute_epoch?now()-Number(recent.minute_epoch):Infinity;
   if(!Number.isFinite(age)||age>180||age< -180)
     return err('Fonte do Blitz Double sem rodada recente na API principal. Verifique o sincronizador Termux -> /api/ingest antes de ativar.',409);

   const b=await req.json();if(b.confirm!==true)return err('Confirme explicitamente a ativacao.');
   const all=await groups(),selected=all.filter(g=>g.selected&&g.admin);
   const owner=await getDoc(env,K.owner,null);
   const privateReady=!!(owner?.id&&/^[1-9][0-9]{4,19}$/.test(String(owner.id)));
   if(!privateReady&&!selected.length)return err('Confirme seu ID no privado do bot enviando /start ou selecione um grupo com bot ADM.',400);
   if(!await hasBot(env))return err('Cadastre o token do bot no ADM.',503);
   const active=(await strategies()).filter(s=>s.enabled&&!s.archived);
   if(!active.length)return err('Ative ao menos uma estrategia antes de ligar os sinais.',400);
   const global=await globalDoc(env);
   // V9: texto vazio nao bloqueia o bot; usar modelo padrao em tempo de envio.
   // Midias continuam opcionais, e configuracoes salvas nao sao sobrescritas.
   // Starting live delivery opens a fresh baseline: never send a WIN/RED
   // for an entry that was only observed while Telegram was disabled.
   for(const s of active){
    const latest=await recentR2(env,s.gameId);
    const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));
    await putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null});
   }
   const current=await settings();current.botEnabled=true;current.updatedAt=now();await putDoc(env,K.settings,current);
   const ss=active[0],activation=global.templates?.bot_on;
   // Primeiro: confirmacao SOMENTE no privado; canais recebem apenas sinais futuros.
   if(ss&&privateReady){
    const message=String(activation?.text||'').trim()?activation.text:defaultSignalText('bot_on');
    const media=activation?.saved?{type:activation.type,assetId:activation.assetId}:{type:'text',assetId:''};
    const event={id:'bot_on_'+now()+'_'+ss.id,strategyId:ss.id,strategyName:ss.name,type:'bot_on',media,message:formatMessage(message,{number:0,color:'white',minute_epoch:now()},ss,0),at:now()};
    await dispatch(env,current,event,{privateOnly:true});
   }
   return json({ok:true,settings:current,attentionTriggered:false,botOnTriggered:!!(ss&&privateReady),privateFirst:privateReady});
  }
  if(path==='/api/adm/telegram/deactivate'&&req.method==='POST'){
   const st=await settings();st.botEnabled=false;st.updatedAt=now();await putDoc(env,K.settings,st);
   for(const s of (await strategies()).filter(x=>x.enabled&&!x.archived)){
     const state=await getDoc(env,runtimeKey(s.id),null);
     if(state?.attentionEventId){await dismissAttention(env,s.id,state.attentionEventId);state.attentionEventId=null;await putDoc(env,runtimeKey(s.id),state)}
   }
   return json({ok:true,settings:st});
  }
  if(path==='/api/adm/telegram/test'&&req.method==='POST'){
   const b=await req.json(),g=(await groups()).find(x=>x.id===String(b.groupId)&&x.selected&&x.admin);
   if(!g)return err('Grupo nao selecionado ou sem permissao de administrador.');
   await transmit(env,g,{type:'test',message:'✅ NEXO V3: mensagem de teste solicitada pelo administrador.',media:{type:'text'}});
   return json({ok:true});
  }
  if(path==='/api/adm/telegram/scoreboard'&&req.method==='POST'){
    const b=await req.json();
    const privateChat=b.groupId==='__private__';
    const g=privateChat?null:(await groups()).find(x=>x.id===String(b.groupId)&&x.selected&&x.admin);
    if(!privateChat&&!g)return err('Grupo nao selecionado ou sem permissao de administrador.');
    const all=(await strategies()).filter(x=>!x.archived),data=await scores(env,all);
    let name='GERAL · TODAS AS ESTRATEGIAS';
    let stat;
    if(b.strategyId==='__all__'){
      stat={entries:0,green:0,white:0,red:0,gale1:0,gale2:0,day:dayBR()};
      for(const item of data)for(const field of ['entries','green','white','red','gale1','gale2'])stat[field]+=Number(item[field]||0);
    }else{
      stat=data.find(x=>x.id===b.strategyId);if(!stat)return err('Estrategia nao encontrada');name=stat.name;
    }
    const msg='🏆 PLACAR — '+name+'\n🟢 WIN: '+stat.green+'\n⚪ BRANCO: '+stat.white+'\n🔴 RED: '+stat.red+'\n↪️ GALE 1: '+stat.gale1+' | GALE 2: '+stat.gale2+'\nEntradas: '+stat.entries+'\nDia: '+stat.day;
    if(privateChat){
      const owner=await getDoc(env,K.owner,null);
      if(!owner?.id)return err('Vincule primeiro o privado do administrador ao bot.');
      await tg(env,'sendMessage',{chat_id:owner.id,text:msg});
    }else await transmit(env,g,{type:'scoreboard',message:msg,media:{type:'text'}});
    return json({ok:true});
   }
   if(path==='/api/adm/scores'&&req.method==='GET')return json({ok:true,scores:await scores(env,(await strategies()).filter(x=>!x.archived))});
  if(path==='/api/adm/scores/reset'&&req.method==='POST'){
   const b=await req.json();if(b.confirm!==true)return err('Confirmacao obrigatoria.');
   const ss=(await strategies()).filter(x=>!x.archived);if(b.id&&!ss.some(x=>x.id===b.id))return err('Estrategia inexistente');
   for(const s of ss.filter(x=>!b.id||s.id===b.id))await resetScore(env,s.id);
   return json({ok:true});
  }
  if(path==='/api/adm/media'&&req.method==='POST'){
   const form=await req.formData();const file=form.get('file'),kind=form.get('kind');
   if(!(file instanceof File)||!['sticker','gif'].includes(kind))return err('Envie arquivo sticker PNG/WEBP ou GIF.');
   const max=kind==='sticker'?512*1024:5*1024*1024;if(file.size<10||file.size>max)return err('Arquivo excede o limite (sticker 512 KB; GIF 5 MB).');
   const buf=await file.arrayBuffer();if(!fileOk(buf,kind))return err('Formato de arquivo nao reconhecido.');
   const mime=kind==='gif'?'image/gif':(new Uint8Array(buf)[0]===137?'image/png':'image/webp');
   const original=(file.name||'arquivo').replace(/[^\w.\-]/g,'_').slice(0,80);
   const id=crypto.randomUUID().replaceAll('-','');
   await env.R2.put(ROOT+'media/files/'+id,buf,{httpMetadata:{contentType:mime}});
   const all=await getDoc(env,K.media,[]);const meta={id,name:original,kind,mime,size:file.size,createdAt:now()};
   all.push(meta);await putDoc(env,K.media,all);return json({ok:true,asset:meta});
  }
  if(path==='/api/adm/media'&&req.method==='GET')return json({ok:true,items:await getDoc(env,K.media,[])});
  const mf=path.match(/^\/api\/adm\/media\/([a-f0-9]{32})$/);
  if(mf&&req.method==='GET'){
   const meta=(await getDoc(env,K.media,[])).find(x=>x.id===mf[1]);if(!meta)return err('Midia nao encontrada',404);
   if(meta.fileId){
    const motion=new URL(req.url).searchParams.get('motion')==='1';const previewId=motion&&(meta.kind==='gif'||meta.videoSticker)?meta.fileId:(meta.previewFileId||meta.fileId);
    const file=await tg(env,'getFile',{file_id:previewId});
    if(!file.file_path||Number(file.file_size||0)>20*1024*1024)return err('Previa indisponivel',404);
    const t=await botToken(env);const res=await fetch('https://api.telegram.org/file/bot'+t+'/'+file.file_path,{signal:AbortSignal.timeout(10000)});
    if(!res.ok)return err('Nao foi possivel carregar a previa',404);
    const ext=(file.file_path.split('.').pop()||'').toLowerCase();const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='mp4'?'video/mp4':ext==='webm'?'video/webm':'application/octet-stream';
    return new Response(res.body,{headers:{'Content-Type':mime,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
   }
   const obj=await env.R2.get(ROOT+'media/files/'+meta.id);if(!obj)return err('Arquivo nao encontrado',404);
   return new Response(obj.body,{headers:{'Content-Type':meta.mime,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
  }

   if(path==='/api/adm/v11/status'&&req.method==='GET'){
    const waiting=await list(env,ROOT+'outbox/pending/',100);
    const blocked=await list(env,V11_BLOCK_ROOT,100);
    const recent=[];
    for(const entry of blocked.slice(0,12)){
      const data=await getDoc(env,entry.key,null);
      if(data)recent.push({id:entry.key.slice(V11_BLOCK_ROOT.length).replace(/\.json$/,''),type:'ENTREGA INCERTA',stage:data.stage||'—',chatMasked:'••'+String(data.chatId||'').slice(-4),at:new Date((data.updatedAt||now())*1000).toISOString()});
    }
    const cycle=await getDoc(env,v11GameKey(activeGame(env)),{ownerId:null});
    return json({ok:true,pending:waiting.length,uncertain:blocked.length,recent,cycle});
   }
   if(path==='/api/adm/v11/discard-delivery'&&req.method==='POST'){
    const body=await req.json();
    const tag=String(body?.chatTag||'');
    if(body?.confirm!==true||!/^m?[0-9]{5,20}$/.test(tag))return err('Confirme um destino válido.',400);
    const key=V11_BLOCK_ROOT+tag+'.json',blocked=await getDoc(env,key,null);
    if(!blocked)return err('Não há envio incerto neste destino.',404);
    const pending=await list(env,ROOT+'outbox/pending/'+blocked.eventId+'_',30);
    let discarded=0;
    for(const x of pending){const row=await getDoc(env,x.key,null);
      if(row?.groupId!==blocked.chatId)continue;
      await putDoc(env,ROOT+'outbox/cancelled/'+row.id+'.json',{...row,cancelledAt:now(),reason:'manual-v11-discard'});
      await env.R2.delete?.(x.key);discarded++;
    }
    const stageKey=v11StageKey({id:blocked.eventId},blocked.chatId);
    const stage=await getDoc(env,stageKey,null);
    if(stage){stage.cancelledAt=now();stage.completed=true;stage.uncertain=null;await putDoc(env,stageKey,stage)}
    await env.R2.delete?.(key);
    return json({ok:true,discarded,notice:'Evento do destino descartado; nenhuma mensagem foi reenviada.'});
   }
   if(path==='/api/adm/v11/reset-cycles'&&req.method==='POST'){
    const body=await req.json();if(body?.confirm!==true)return err('Confirme o reset de ciclos.',400);
    const st=await settings();if(st.botEnabled)return err('Desligue o robô antes de reinicializar ciclos.',409);
    const latest=await recentR2(env,activeGame(env));const rows=latest.items||[];
    if(!rows.length)return err('Histórico remoto vazio; não há cursor confirmado.',409);
    await resetAfterCatchup(env,{id:activeGame(env)},rows);
    // Arquivar apenas pendências de sinais desta aplicação; nunca tocar no histórico R2.
    const old=await list(env,ROOT+'outbox/pending/',100);
    for(const entry of old){const task=await getDoc(env,entry.key,null);if(!task)continue;
     await putDoc(env,ROOT+'outbox/cancelled/'+task.id+'.json',{...task,cancelledAt:now(),reason:'manual-v11-reset'});
     await env.R2.delete?.(entry.key);
    }
    const gates=await list(env,V11_BLOCK_ROOT,100);
    for(const entry of gates){const gate=await getDoc(env,entry.key,null);
     if(gate)await putDoc(env,ROOT+'outbox/cancelled/block_'+entry.key.slice(V11_BLOCK_ROOT.length),{...gate,cancelledAt:now(),reason:'manual-v11-reset'});
     await env.R2.delete?.(entry.key);
    }
    return json({ok:true,reset:true,items:rows.length,cancelled:old.length,clearedBlocks:gates.length});
   }
  if(path==='/api/adm/events'&&req.method==='GET'){
   const all=await list(env,ROOT+'events/',250);const recent=all.sort((a,b)=>String(b.key).localeCompare(String(a.key))).slice(0,60);
   const events=await Promise.all(recent.map(x=>getDoc(env,x.key,null)));
   return json({ok:true,events:events.filter(Boolean).sort((a,b)=>b.at-a.at).slice(0,50)});
  }
  return err('Rota ADM nao encontrada',404);
 }catch(e){console.error('ADM API:',String(e.message||e).slice(0,200));return err(e.message?.startsWith('Telegram ')?'Falha ao comunicar com Telegram. Verifique token e permissoes.':String(e.message||'Falha interna').slice(0,180),400)}
}

 // Desarquivamento seguro: descarta apenas bloqueios originados pela estratégia excluída.
 async function v11DropStrategyBlocks(env,strategyId){
  const entries=await list(env,V11_BLOCK_ROOT,100);
  for(const x of entries){const gate=await getDoc(env,x.key,null);
   if(!gate?.eventId?.startsWith(strategyId+'_'))continue;
   await putDoc(env,ROOT+'outbox/cancelled/block_'+x.key.slice(V11_BLOCK_ROOT.length),{...gate,cancelledAt:now(),reason:'strategy-disabled'});
   await env.R2.delete?.(x.key);
  }
 }
 // V10: limpeza gradual, sempre por ID de estratégia; não toca no histórico de jogo.
async function purgeStrategyFiles(env,id,limit=35){
 const prefixes=[ROOT+'outbox/pending/'+id+'_',ROOT+'outbox/sent/'+id+'_',ROOT+'outbox/stages/'+id+'_',ROOT+'events/'+id+'_',ATTENTION_ROOT+id+'/',ATTENTION_MESSAGES_ROOT+id+'/'];
 let more=false,used=0;
 for(const prefix of prefixes){
  if(used>=limit){more=true;break}
  const entries=await list(env,prefix,Math.min(35,limit-used));
  for(const x of entries){await env.R2.delete?.(x.key);used++}
  if(entries.length===Math.min(35,limit-used+entries.length))more=true;
 }
 // Uma passada extra garante que o número exatamente igual ao lote não deixa restos.
 if(!more){await env.R2.delete?.(purgeTaskKey(id));return}
 await putDoc(env,purgeTaskKey(id),{id,lastPass:now(),pending:true});
}
async function runPurgeQueue(env){
 const pending=await list(env,ROOT+'maintenance/purge/',6);
 if(!pending.length)return;
 const current=await getDoc(env,strategyStorage(env),[]);
 // Limite pequeno por minuto: a fila Telegram continua prioritária.
 for(const task of pending.slice(0,1)){
  const id=/\/([a-f0-9]{32})\.json$/.exec(task.key)?.[1];
  if(!id||current.some(s=>s.id===id&&!s.archived))continue;
  try{
   const runtime=await getDoc(env,runtimeKey(id),null);
   if(runtime?.attentionEventId)await dismissAttention(env,id,runtime.attentionEventId);
   await env.R2.delete?.(runtimeKey(id));
   await env.R2.delete?.(scoreKey(id));
   await v11DropStrategyBlocks(env,id);
   await purgeStrategyFiles(env,id,8);
  }catch(e){console.warn('V25.4: limpeza em background pendente',String(e?.message||e).slice(0,110));}
 }
}
export async function scheduledAdmin(env){
 if(!env.R2)return;
 const st=await getDoc(env,K.settings,settingsDefault),strategies=await getDoc(env,strategyStorage(env),[]);
 // V24: sem leitura de centenas de placares a CADA MINUTO.
 // scoreRead() ja devolve placar zerado quando o dia muda; no proximo
 // evento o placar do dia e persistido. Sem apagar placares anteriores.
 if(st.resetMidnight){
  const today=dayBR(),k=ROOT+'maintenance/last-score-day-v24.json';
  const previous=await getDoc(env,k,null);
  if(previous?.day!==today)await putDoc(env,k,{day:today,checkedAt:now()});
 }
 await cleanupOldAttention(env);
 await runPurgeQueue(env);
 if(!st.botEnabled||!await hasBot(env))return;
 const all=await list(env,ROOT+'outbox/pending/',100);
 const gs=await getDoc(env,K.groups,[]);
 let v11Attempts=0;for(const x of all){
   const row=await getDoc(env,x.key,null);if(!row)continue;
   // Nunca ressuscitar sinal antigo, mesmo que o retry do cron rode depois.
   if(v22ExpiredEvent(row.evt)){
     await putDoc(env,ROOT+'outbox/cancelled/'+row.id+'.json',{id:row.id,cancelledAt:now(),reason:'v22-expired'});
     await env.R2.delete?.(x.key);
     const gate=await getDoc(env,v11BlockKey(row.groupId),null);
     if(gate?.eventId===row.evt?.id)await env.R2.delete?.(v11BlockKey(row.groupId));
     continue;
   }
   if(row.attempts>=5||row.updatedAt+60>now())continue;
  if(row.evt?.strategyId&&!strategies.some(s=>s.id===row.evt.strategyId&&!s.archived)){await env.R2.delete?.(x.key);continue}
  if(row.evt?.type==='attention'){
    const track=await getDoc(env,attentionKey(row.evt.strategyId,row.evt.id),null);
    if(!track?.active){await env.R2.delete?.(x.key);continue}
  }
  if(await getDoc(env,sentKey(row.id),null)){if(env.R2.delete)await env.R2.delete(x.key);continue;}
  const owner=await getDoc(env,K.owner,null);
  const group=owner?.id===row.groupId?{id:row.groupId,private:true}:gs.find(g=>g.id===row.groupId&&g.selected&&g.admin);if(!group)continue;
  if(v11Attempts++>=20)break;
  try{
   await transmit(env,group,row.evt);
   await putDoc(env,sentKey(row.id),{id:row.id,sentAt:now()});
   if(env.R2.delete)await env.R2.delete(x.key);
  }catch(e){row.attempts++;row.lastError=String(e.message||e).slice(0,140);row.updatedAt=now();await putDoc(env,x.key,row);await putDoc(env,v11BlockKey(group.id),{eventId:row.evt.id,chatId:String(group.id),stage:'cron-pending',updatedAt:now()});}
 }
}

export async function scheduledColorsCapture(env){
 const st=await getDoc(env,K.settings,settingsDefault);if(!st.botEnabled||!await hasBot(env))return;
 await drainCaptureQueue(env,{groups:()=>getDoc(env,K.groups,[]),sent:async (chat,evt)=>!!await getDoc(env,sentKey(evt.id+'_'+String(chat).replace('-','m')),null),reply:(chat,evt)=>confirmedEntryText(evt,chat,(id,c)=>getDoc(env,v11StageKey({id},c),null)),send:form=>tg(env,'sendPhoto',form)});
}
