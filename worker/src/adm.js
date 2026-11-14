// NEXO V3 ADM. Isolated from the V2 history archive and ingestion authentication.
const ROOT='nexo-v3/';
const K={settings:ROOT+'admin/settings.json',strategies:ROOT+'admin/strategies.json',groups:ROOT+'telegram/groups.json',media:ROOT+'media/catalog.json'};
const E=['attention','entry_black','entry_red','gale1','gale2','win_black','win_red','win_white','red'];
const TARGETS=['black','red'];
const UTF=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const idSafe=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,90}$/.test(x);
const err=(message,status=400)=>json({ok:false,error:message},status);
const getDoc=async(env,key,defaultValue)=>{const x=await env.R2.get(key);if(!x)return structuredClone(defaultValue);try{return await x.json()}catch{throw new Error('Arquivo de configuracao danificado: '+key)}};
const putDoc=async(env,key,value)=>env.R2.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
const settingsDefault={botEnabled:false,showNumbers:true,jokerWhite:false,resetMidnight:true,updatedAt:0};
const strategyDefault=()=>({id:crypto.randomUUID().replaceAll('-',''),name:'',gameId:'brabet-double',enabled:false,archived:false,target:'black',pattern:['red','red'],maxGale:0,showStoneBeforeMedia:false,showNumbers:true,jokerWhite:false,messages:Object.fromEntries(E.map(x=>[x,''])),media:Object.fromEntries(E.map(x=>[x,{type:'text',assetId:''}])),createdAt:now(),updatedAt:now()});
const scoreDefault=(day)=>({day,entries:0,green:0,white:0,red:0,gale1:0,gale2:0,updatedAt:now()});
const scoreKey=id=>ROOT+'scores/'+id+'.json';
const runtimeKey=id=>ROOT+'runtime/'+id+'.json';
const eventKey=id=>ROOT+'events/'+id+'.json';
const pendingKey=id=>ROOT+'outbox/pending/'+id+'.json';
const sentKey=id=>ROOT+'outbox/sent/'+id+'.json';
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
 if(state.until>now())return err('Muitas tentativas. Tente novamente mais tarde.',429);
 const valid=typeof body.password==='string'&&await eqHash(body.password,env.NEXO_ADM_PASSWORD);
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
 if(input.gameId!==undefined&&input.gameId!=='brabet-double')throw Error('Somente Brabet Double esta validado na V3.');
 x.target=TARGETS.includes(input.target)?input.target:'black';
 x.maxGale=Number(input.maxGale);if(![0,1,2].includes(x.maxGale))throw Error('Gale deve ser 0, 1 ou 2.');
 if(!Array.isArray(input.pattern)||input.pattern.length<1||input.pattern.length>8||input.pattern.some(z=>!(['red','black','white','*'].includes(z)||/^(?:n:)(?:[0-9]|1[0-4])$/.test(z))))throw Error('Padrao invalido (1 a 8 pedras).');
 x.pattern=[...input.pattern];
 x.showStoneBeforeMedia=input.showStoneBeforeMedia===true;x.showNumbers=input.showNumbers!==false;x.jokerWhite=input.jokerWhite===true;
 x.messages={};for(const e of E)x.messages[e]=textLimit(input.messages?.[e],1500);
 x.media={};for(const e of E){const m=input.media?.[e];x.media[e]={type:['text','sticker','gif'].includes(m?.type)?m.type:'text',assetId:idSafe(m?.assetId)?m.assetId:''};}
 x.enabled=input.enabled===true; x.archived=previous?.archived||false;
 x.updatedAt=now();return x;
}
const recentR2=async(env,gameId)=>getDoc(env,'nexo-v1/games/'+gameId+'/latest.json',{items:[]});
const list=async(env,prefix,limit=100)=>{let cursor;const rows=[];for(let k=0;k<5&&rows.length<limit;k++){const r=await env.R2.list({prefix,limit:Math.min(500,limit),...(cursor?{cursor}:{})});rows.push(...r.objects);if(!r.truncated||!r.cursor)break;cursor=r.cursor;}return rows.slice(0,limit)};
async function scores(env,strategies){const today=dayBR();return Promise.all(strategies.map(async s=>({id:s.id,name:s.name,...await scoreRead(env,s.id,today)})))}
async function scoreRead(env,id,today=dayBR()){const p=await getDoc(env,scoreKey(id),scoreDefault(today));return p.day===today?p:scoreDefault(today)}
async function resetScore(env,id){const s=scoreDefault(dayBR());await putDoc(env,scoreKey(id),s);return s}
async function tg(env,method,body){
 if(typeof env.NEXO_TELEGRAM_BOT_TOKEN!=='string'||!env.NEXO_TELEGRAM_BOT_TOKEN.includes(':'))throw Error('Token Telegram nao configurado');
 const res=await fetch('https://api.telegram.org/bot'+env.NEXO_TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',body:body instanceof FormData?body:JSON.stringify(body),headers:body instanceof FormData?{}:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000)});
 const data=await res.json();if(!res.ok||!data.ok)throw Error('Telegram '+method+': '+String(data.description||res.status).slice(0,120));return data.result;
}
async function botAdmin(env,chatId){try{const me=await tg(env,'getMe',{});const item=await tg(env,'getChatMember',{chat_id:chatId,user_id:me.id});return ['administrator','creator'].includes(item.status)&&item.can_post_messages!==false}catch{return false}}
const normChat=c=>c&&String(c.id).match(/^-?\d{1,20}$/)&&['group','supergroup','channel'].includes(c.type);
async function discoverChat(env,chat){
 if(!normChat(chat))return false;
 const permitted=await botAdmin(env,chat.id);
 const d=await getDoc(env,K.groups,[]);const id=String(chat.id),old=d.find(x=>x.id===id);
 const row={id,name:String(chat.title||old?.name||'Grupo sem nome').slice(0,120),type:chat.type,admin:permitted,selected:permitted&&(old?.selected||false),updatedAt:now()};
 await putDoc(env,K.groups,[...d.filter(x=>x.id!==id),row].slice(-100));return permitted;
}
async function telegramWebhook(request,env){
 const secret=env.NEXO_TELEGRAM_WEBHOOK_SECRET;
 if(typeof secret!=='string'||secret.length<16||!await eqHash(request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',secret))return err('Nao autorizado',401);
 let b;try{b=await request.json()}catch{return err('JSON invalido')}
 const c=b.my_chat_member?.chat||b.message?.chat;
 if(c&&(b.my_chat_member||/^\/nexo_grupo(?:@\w+)?(?:\s|$)/i.test(b.message?.text||''))){try{await discoverChat(env,c)}catch(e){console.warn('ADM webhook discovery',String(e).slice(0,70))}}
 return json({ok:true});
}
function matchPat(history,pattern,joker=false){
 if(history.length<pattern.length)return false;
 const tail=history.slice(-pattern.length);
 return pattern.every((v,i)=>v==='*'||(joker&&tail[i].number===0)||v===tail[i].color||(v.startsWith('n:')&&Number(v.slice(2))===tail[i].number));
}
const validName=(n)=>E.includes(n);
function formatMessage(template,r,s,step){
 const values={numero:String(r.number),cor:r.color==='red'?'VERMELHO':r.color==='black'?'PRETO':'BRANCO',gale:String(step),estrategia:s.name,hora:isoTime(r.minute_epoch),data:dayBR(r.minute_epoch)};
 return String(template||'').replace(/\{(numero|cor|gale|estrategia|hora|data)\}/g,(_,k)=>values[k]);
}
function stoneText(r,withNumber){return '🎲 Pedra sorteada: '+(r.color==='red'?'🔴':r.color==='black'?'⚫':'⚪')+(withNumber?' '+r.number:'');}
async function transmit(env,group,evt){
 if(!await botAdmin(env,group.id))throw Error('Bot nao e administrador deste grupo');
 const message=evt.message;
 if(message)await tg(env,'sendMessage',{chat_id:group.id,text:message,disable_web_page_preview:true});
 if(evt.media?.type==='text'||!evt.media?.type)return;
 const assets=await getDoc(env,K.media,[]);const asset=assets.find(a=>a.id===evt.media.assetId&&a.kind===evt.media.type);
 if(!asset)throw Error('Midia nao encontrada para '+evt.type);
 const obj=await env.R2.get(ROOT+'media/files/'+asset.id);
 if(!obj)throw Error('Arquivo de midia nao encontrado');
 const fd=new FormData();fd.append('chat_id',group.id);
 fd.append(evt.media.type==='gif'?'animation':'sticker',new Blob([await obj.arrayBuffer()],{type:asset.mime}),asset.name);
 await tg(env,evt.media.type==='gif'?'sendAnimation':'sendSticker',fd);
}
async function dispatch(env,config,evt){
 if(!config.botEnabled)return;
 const all=await getDoc(env,K.groups,[]);const targets=all.filter(x=>x.selected&&x.admin).slice(0,5);
 for(const group of targets){const uid=evt.id+'_'+group.id.replace('-','m');
   if(await getDoc(env,sentKey(uid),null))continue;
   const key=pendingKey(uid),existing=await getDoc(env,key,null);
   const row={id:uid,groupId:group.id,evt,status:'pending',attempts:existing?.attempts||0,createdAt:existing?.createdAt||now(),updatedAt:now(),lastError:''};
   await putDoc(env,key,row);
   try{
     await transmit(env,group,evt);
     await putDoc(env,sentKey(uid),{id:uid,sentAt:now()});
     if(env.R2.delete)await env.R2.delete(key);
   }catch(e){
     row.attempts++;row.lastError=String(e.message||e).slice(0,160);row.updatedAt=now();
     console.warn('Telegram pending',row.lastError);await putDoc(env,key,row);
   }
 }
}

async function fireEvent(env,settings,strategy,r,type,step){
 const id=strategy.id+'_'+r.id+'_'+type;const evt={id,strategyId:strategy.id,strategyName:strategy.name,type,gameId:strategy.gameId,roundId:r.id,number:r.number,color:r.color,minute_epoch:r.minute_epoch,at:now(),message:formatMessage(strategy.messages[type],r,strategy,step),media:strategy.media[type],showStoneBeforeMedia:strategy.showStoneBeforeMedia};
 if(strategy.showStoneBeforeMedia&&['win_black','win_red','win_white','red'].includes(type))evt.message=(evt.message?evt.message+'\n':'')+stoneText(r,strategy.showNumbers);
 await putDoc(env,eventKey(id),evt);
 await dispatch(env,settings,evt);
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
     state.active={step:0};score.entries++;events.push({type:s.target==='red'?'entry_red':'entry_black',number:r.number,minute_epoch:r.minute_epoch});
   }
   state.recent.push(r);if(state.recent.length>15)state.recent.shift();
 }
 return {score,events:events.slice(-30)};
}
export async function processNewRounds(env,game,records){
 if(!env.R2||!records.length)return;
 const strategies=(await getDoc(env,K.strategies,[])).filter(s=>s.enabled&&!s.archived&&s.gameId===game.id);
 if(!strategies.length)return;
 const settings=await getDoc(env,K.settings,settingsDefault);
 const ordered=[...records].filter(x=>Number.isInteger(x.seq)).sort((a,b)=>a.seq-b.seq);
 for(const s of strategies){
  try{
   let state=await getDoc(env,runtimeKey(s.id),null);
   if(!state){await putDoc(env,runtimeKey(s.id),{lastSeq:Math.max(...ordered.map(x=>x.seq)),recent:[],active:null});continue;}
   const unseen=ordered.filter(x=>x.seq>state.lastSeq);
   if(!unseen.length)continue;
   let score=await scoreRead(env,s.id);
   for(const r of unseen){const actions=[];
    if(state.active){const a=state.active;
      if(r.color==='white'){score.white++;actions.push('win_white');state.active=null}
      else if(r.color===s.target){score.green++;actions.push(s.target==='red'?'win_red':'win_black');state.active=null}
      else if(a.step<s.maxGale){a.step++;score['gale'+a.step]++;actions.push('gale'+a.step)}
      else{score.red++;actions.push('red');state.active=null}
    }else if(matchPat([...(state.recent||[]),r],s.pattern,s.jokerWhite)){
      state.active={step:0};score.entries++;actions.push(s.target==='red'?'entry_red':'entry_black');
    }
    state.recent=[...(state.recent||[]),r].slice(-15);state.lastSeq=r.seq;
    // Advance cursor before network activity. Event files persist even if Telegram fails.
    await putDoc(env,runtimeKey(s.id),state);score.updatedAt=now();await putDoc(env,scoreKey(s.id),score);
    for(const action of actions)await fireEvent(env,settings,s,r,action,state.active?.step||0);
   }
  }catch(e){console.error('V3 rules isolated from history:',String(e.message||e).slice(0,140))}
 }
}
async function registerWebhook(req,env){
 if(!env.NEXO_TELEGRAM_BOT_TOKEN||!env.NEXO_TELEGRAM_WEBHOOK_SECRET)return err('Configure os Secrets NEXO_TELEGRAM_BOT_TOKEN e NEXO_TELEGRAM_WEBHOOK_SECRET.',503);
 const existing=await tg(env,'getWebhookInfo',{}),desired=new URL(req.url).origin+'/api/telegram/webhook';
 if(existing.url&&existing.url!==desired)return err('Este bot ja usa outro webhook. Para nao interromper o bot antigo, a V3 nao altera esse destino.',409);
 const result=await tg(env,'setWebhook',{url:desired,secret_token:env.NEXO_TELEGRAM_WEBHOOK_SECRET,allowed_updates:['my_chat_member','message'],drop_pending_updates:false});
 return json({ok:!!result,webhook:desired});
}
function fileOk(bytes,kind){const a=new Uint8Array(bytes);if(kind==='gif')return a.length>=10&&String.fromCharCode(...a.slice(0,6)).match(/^GIF8[79]a$/);
 return (a.length>=24&&a.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')||(a.length>=12&&String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP');}
export async function routeAdmin(req,env,url){
 const path=url.pathname;
 if(path==='/api/telegram/webhook'&&req.method==='POST')return telegramWebhook(req,env);
 if(!path.startsWith('/api/adm/'))return null;
 if(!env.R2)return err('Binding R2 indisponivel',503);
 if(!sameOrigin(req)&&req.method!=='GET')return err('Origem nao permitida',403);
 if(path==='/api/adm/login'&&req.method==='POST')return login(req,env);
 if(path==='/api/adm/me')return json({ok:await authenticated(req,env),configured:hasPassword(env)});
 if(!await authenticated(req,env))return err('Entre com a senha de administrador.',401);
 if(path==='/api/adm/logout'&&req.method==='POST')return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
 const settings=()=>getDoc(env,K.settings,settingsDefault);
 const strategies=()=>getDoc(env,K.strategies,[]);
 const groups=()=>getDoc(env,K.groups,[]);
 try{
  if(path==='/api/adm/bootstrap'&&req.method==='GET'){
   const [st,ss,gs,media]=await Promise.all([settings(),strategies(),groups(),getDoc(env,K.media,[])]);
   const active=ss.filter(x=>!x.archived);
   const scoresData=await scores(env,active);
   const latest=await recentR2(env,'brabet-double');
   return json({ok:true,settings:st,strategies:active,groups:gs,media,scores:scoresData,latestCount:latest.items?.length||0,telegramConfigured:!!env.NEXO_TELEGRAM_BOT_TOKEN,webhookSecretConfigured:!!env.NEXO_TELEGRAM_WEBHOOK_SECRET});
  }
  if(path==='/api/adm/settings'&&req.method==='PUT'){
   const b=await req.json(),current=await settings();
   const next={...current,showNumbers:b.showNumbers!==false,jokerWhite:b.jokerWhite===true,resetMidnight:b.resetMidnight!==false,updatedAt:now()};
   await putDoc(env,K.settings,next);return json({ok:true,settings:next});
  }
  if(path==='/api/adm/strategies'&&req.method==='POST'){
   const b=await req.json();const all=await strategies();if(all.filter(x=>!x.archived).length>=30)return err('Limite de 30 estrategias.',400);
   const s=validateStrategy({...b,enabled:false},null);all.push(s);await putDoc(env,K.strategies,all);
   const latest=await recentR2(env,s.gameId);const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));
   await putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null});await resetScore(env,s.id);
   return json({ok:true,strategy:s});
  }
  const match=path.match(/^\/api\/adm\/strategies\/([a-f0-9]{32})(?:\/(simulate))?$/);
  if(match){const id=match[1],all=await strategies(),idx=all.findIndex(x=>x.id===id&&!x.archived);if(idx<0)return err('Estrategia nao encontrada',404);
   if(match[2]==='simulate'&&req.method==='POST'){const hist=await recentR2(env,all[idx].gameId);return json({ok:true,...await simulate(all[idx],hist.items||[])});}
   if(req.method==='PUT'){
    const b=await req.json();const was=all[idx].enabled;const s=validateStrategy(b,all[idx]);
    // Do not activate on save unless explicitly opted-in by the administrator.
    if(s.enabled&&!was){const latest=await recentR2(env,s.gameId);const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));await putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null});}
    all[idx]=s;await putDoc(env,K.strategies,all);return json({ok:true,strategy:s});
   }
   if(req.method==='DELETE'){all[idx]={...all[idx],enabled:false,archived:true,updatedAt:now()};await putDoc(env,K.strategies,all);return json({ok:true});}
  }
  if(path==='/api/adm/groups'&&req.method==='GET')return json({ok:true,groups:await groups()});
  if(path==='/api/adm/groups/selection'&&req.method==='PUT'){
   const b=await req.json();if(!Array.isArray(b.ids)||b.ids.length>5||b.ids.some(x=>!/^[-\d]{1,20}$/.test(String(x))))return err('Selecione ate 5 grupos validos.');
   const existing=await groups(),ids=new Set(b.ids.map(String));
   if(b.ids.some(x=>!existing.some(g=>g.id===String(x)&&g.admin)))return err('Bot precisa estar ADM em todos os grupos selecionados.');
   const next=existing.map(x=>({...x,selected:x.admin&&ids.has(x.id)}));await putDoc(env,K.groups,next);return json({ok:true,groups:next});
  }
  if(path==='/api/adm/groups/refresh'&&req.method==='POST'){
   if(!env.NEXO_TELEGRAM_BOT_TOKEN)return err('Configure o token do bot no Worker.',503);
   const all=await groups();const next=[];for(const g of all.slice(0,30))next.push({...g,admin:await botAdmin(env,g.id),updatedAt:now()});
   await putDoc(env,K.groups,next);const info=await tg(env,'getWebhookInfo',{});
   return json({ok:true,groups:next,webhookActive:!!info.url,ourWebhook:info.url===new URL(req.url).origin+'/api/telegram/webhook',notice:'O Telegram so envia grupos atraves de eventos recentes ou comando /nexo_grupo.'});
  }
  if(path==='/api/adm/webhook/register'&&req.method==='POST')return registerWebhook(req,env);
  if(path==='/api/adm/telegram/activate'&&req.method==='POST'){
   const b=await req.json();if(b.confirm!==true)return err('Confirme explicitamente a ativacao.');
   const all=await groups(),selected=all.filter(g=>g.selected&&g.admin);if(!selected.length)return err('Selecione ao menos um grupo com bot ADM.');
   if(!env.NEXO_TELEGRAM_BOT_TOKEN)return err('Configure o bot no Worker.',503);
   const active=(await strategies()).filter(s=>s.enabled&&!s.archived);
   if(!active.length)return err('Ative ao menos uma estrategia antes de ligar os sinais.',400);
   for(const s of active){
    const required=[s.target==='red'?'entry_red':'entry_black',...(s.maxGale>=1?['gale1']:[]),...(s.maxGale>=2?['gale2']:[])];
    for(const key of required){if(!s.messages?.[key]?.trim())return err('Preencha e salve a mensagem '+key+' na estrategia '+s.name+'.',400)}
    for(const [key,m] of Object.entries(s.media||{}))if(m?.type!=='text'&&m?.type&&!(await getDoc(env,K.media,[])).some(a=>a.id===m.assetId&&a.kind===m.type))return err('Midia '+key+' nao foi selecionada corretamente na estrategia '+s.name+'.',400);
   }
   // Starting live delivery opens a fresh baseline: never send a WIN/RED
   // for an entry that was only observed while Telegram was disabled.
   for(const s of active){
    const latest=await recentR2(env,s.gameId);
    const max=Math.max(0,...(latest.items||[]).map(x=>Number(x.seq)||0));
    await putDoc(env,runtimeKey(s.id),{lastSeq:max,recent:[],active:null});
   }
   const current=await settings();current.botEnabled=true;current.updatedAt=now();await putDoc(env,K.settings,current);
   const ss=active[0];
   if(ss){const event={id:'attention_'+now()+'_'+ss.id,strategyId:ss.id,strategyName:ss.name,type:'attention',media:ss.media.attention,message:formatMessage(ss.messages.attention,{number:0,color:'white',minute_epoch:now()},ss,0),at:now()};await dispatch(env,current,event);}
   return json({ok:true,settings:current,attentionTriggered:!!ss});
  }
  if(path==='/api/adm/telegram/deactivate'&&req.method==='POST'){
   const st=await settings();st.botEnabled=false;st.updatedAt=now();await putDoc(env,K.settings,st);return json({ok:true,settings:st});
  }
  if(path==='/api/adm/telegram/test'&&req.method==='POST'){
   const b=await req.json(),g=(await groups()).find(x=>x.id===String(b.groupId)&&x.selected&&x.admin);
   if(!g)return err('Grupo nao selecionado ou sem permissao de administrador.');
   await transmit(env,g,{type:'test',message:'✅ NEXO V3: mensagem de teste solicitada pelo administrador.',media:{type:'text'}});
   return json({ok:true});
  }
  if(path==='/api/adm/telegram/scoreboard'&&req.method==='POST'){
   const b=await req.json(),g=(await groups()).find(x=>x.id===String(b.groupId)&&x.selected&&x.admin);
   if(!g)return err('Grupo nao selecionado ou sem permissao de administrador.');
   const all=(await strategies()).filter(x=>!x.archived),data=await scores(env,all);const s=data.find(x=>x.id===b.strategyId);if(!s)return err('Estrategia nao encontrada');
   const msg='🏆 PLACAR — '+s.name+'\n🟢 GREEN: '+s.green+'\n⚪ BRANCO: '+s.white+'\n🔴 RED: '+s.red+'\n↪️ GALE 1: '+s.gale1+' | GALE 2: '+s.gale2+'\nEntradas: '+s.entries+'\nDia: '+s.day;
   await transmit(env,g,{type:'scoreboard',message:msg,media:{type:'text'}});return json({ok:true});
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
   const obj=await env.R2.get(ROOT+'media/files/'+meta.id);if(!obj)return err('Arquivo nao encontrado',404);
   return new Response(obj.body,{headers:{'Content-Type':meta.mime,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
  }
  if(path==='/api/adm/events'&&req.method==='GET'){
   const all=await list(env,ROOT+'events/',250);const recent=all.sort((a,b)=>String(b.key).localeCompare(String(a.key))).slice(0,60);
   const events=await Promise.all(recent.map(x=>getDoc(env,x.key,null)));
   return json({ok:true,events:events.filter(Boolean).sort((a,b)=>b.at-a.at).slice(0,50)});
  }
  return err('Rota ADM nao encontrada',404);
 }catch(e){console.error('ADM API:',String(e.message||e).slice(0,200));return err(e.message?.startsWith('Telegram ')?'Falha ao comunicar com Telegram. Verifique token e permissoes.':String(e.message||'Falha interna').slice(0,180),400)}
}
export async function scheduledAdmin(env){
 if(!env.R2)return;
 const st=await getDoc(env,K.settings,settingsDefault),strategies=await getDoc(env,K.strategies,[]);
 if(st.resetMidnight){for(const s of strategies.filter(x=>!x.archived)){const score=await getDoc(env,scoreKey(s.id),scoreDefault(dayBR()));if(score.day!==dayBR())await resetScore(env,s.id);}}
 if(!st.botEnabled||!env.NEXO_TELEGRAM_BOT_TOKEN)return;
 const all=await list(env,ROOT+'outbox/pending/',100);
 const gs=await getDoc(env,K.groups,[]);
 for(const x of all.slice(0,20)){
  const row=await getDoc(env,x.key,null);if(!row||row.attempts>=5||row.updatedAt+60>now())continue;
  if(await getDoc(env,sentKey(row.id),null)){if(env.R2.delete)await env.R2.delete(x.key);continue;}
  const group=gs.find(g=>g.id===row.groupId&&g.selected&&g.admin);if(!group)continue;
  try{
   await transmit(env,group,row.evt);
   await putDoc(env,sentKey(row.id),{id:row.id,sentAt:now()});
   if(env.R2.delete)await env.R2.delete(x.key);
  }catch(e){row.attempts++;row.lastError=String(e.message||e).slice(0,140);row.updatedAt=now();await putDoc(env,x.key,row);}
 }
}
