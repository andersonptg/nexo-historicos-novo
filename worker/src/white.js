/* NEXO V13 · Branco por minuto · isolado de nexo-v3 e de nexo-v1.
   Nenhuma promessa de resultado: a regra é apenas uma hipótese do administrador.
   Este módulo só usa um segundo bot (NEXO_WHITE_BOT_TOKEN), nunca o bot antigo. */
import {processWhiteV15,resetWhiteV15,routeWhiteV15Admin,whiteV15Active,whiteV15BlocksOthers} from './white-v15.js';
// NEXO V15 DEVEDORAS
const ROOT='nexo-white-v1/';
const KEY={config:ROOT+'config.json',rules:ROOT+'rules.json',runtime:ROOT+'runtime.json',chats:ROOT+'chats.json',media:ROOT+'media.json'};
const now=()=>Math.floor(Date.now()/1000);
const enc=x=>JSON.stringify(x);
const response=(x,status=200)=>new Response(enc(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(error,status=400)=>response({ok:false,error},status);
const doc=async(env,key,fallback)=>{const x=await env.R2.get(key);if(!x)return structuredClone(fallback);try{return await x.json()}catch{throw Error('Registro inválido: '+key)}};
const save=(env,key,x)=>env.R2.put(key,enc(x),{httpMetadata:{contentType:'application/json'}});
const idOK=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
// NEXO V14 PRESETS FIXOS
const colorOK=x=>['red','black'].includes(x);
const zone=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false});
const hm=t=>zone.format(new Date(t*1000));
const timeMinute=t=>Number(zone.formatToParts(new Date(t*1000)).find(x=>x.type==='minute').value);
const iconColor=x=>x==='red'?'🔴':x==='black'?'⚫':'⚪';
const defaults=()=>({botEnabled:false,chats:[],templates:{signal:{type:'text',text:'🤍 BRANCO BRABET PRO\n▫️ {hora1} ▫️\n▫️ {hora2} ▫️ · Proteção (+4 min)\n🎯 {casa} (estimada)\n⚠️ Tendência ±1 minuto.'},attention:{type:'text',text:'⚠️ ATENTOS — PADRÃO BRANCO IDENTIFICADO\n{sequencia}\nEm breve: horários calculados.'},win:{type:'text',text:'✅✅✅✅ WIN — {resultado}'},loss:{type:'text',text:'🚫 LOSS — janelas encerradas sem branco confirmado'}}});
const emptyRun=()=>({lastSeq:0,recent:[],active:null,lastSourceMinute:0,lastReceivedAt:0});
const emptyScore=()=>({signals:0,wins:0,losses:0,cancelled:0,updatedAt:0});
const scoreKey=id=>ROOT+'scores/'+id+'.json';
const eventKey=id=>ROOT+'events/'+id+'.json';
const chatTag=chatId=>String(chatId).replace(/[^0-9-]/g,'').replace('-','m');
const deliveredKey=(eventId,chatId)=>ROOT+'deliveries/'+eventId+'_'+chatTag(chatId)+'.json';
const blockKey=chatId=>ROOT+'blocked/'+chatTag(chatId)+'.json';
const digits=x=>/^-?[0-9]{5,20}$/.test(String(x));
const botReady=env=>/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(String(env.NEXO_WHITE_BOT_TOKEN||''));
const valuesFrom=(active,result)=>({hora1:hm(active.target1),hora2:hm(active.target2),soma:String(active.sum),sequencia:active.sequence,resultado:result?hm(result.minute_epoch):'',pedra:result?iconColor(result.color)+result.number:'',estrategia:active.name});
const render=(template,active,result)=>String(template||'').replace(/\{(hora1|hora2|soma|sequencia|resultado|pedra|estrategia|casa)\}/g,(_,k)=>k==='casa'?(active.house==='first'?'primeira casa':active.house==='second'?'segunda casa':'casa não confirmada'):valuesFrom(active,result)[k]);

// O usuário define a soma como MINUTO ALVO, não como duração após o branco.
// Se o horário alvo já passou quando a sequência se completou, avançar de hora.
export function calculateWhiteWindows(first,white,last,increment=4){
 if(!first||!white||!last||white.color!=='white'||!Number.isInteger(first.number)||!Number.isInteger(last.number)||!Number.isSafeInteger(white.minute_epoch)||!Number.isSafeInteger(last.minute_epoch)||!Number.isInteger(increment)||increment<1||increment>30)throw Error('Sequência ou intervalo inválido');
 const sum=first.number+timeMinute(white.minute_epoch)+last.number;
 const hourStart=white.minute_epoch-timeMinute(white.minute_epoch)*60;
 let target1=hourStart+sum*60;
 // Resultado mais recente é a pedra após o branco; sinal nunca aponta para o passado.
 while(target1<=last.minute_epoch)target1+=3600;
 const target2=target1+increment*60;
 return {sum,target1,target2,label1:hm(target1),label2:hm(target2)};
}


// V14: modelos fixos pré-montados apenas quando o módulo nunca teve regras salvas.
// Se rules.json existe (inclusive []), não recriar regras excluídas e não alterar edições.
const fixedPresets=()=>[
 {id:'f'.repeat(32),name:'FIXA 01 · 🔴4 → ⚪0 · mesmo minuto',before:{color:'red',number:4},after:{color:'none',number:null},mode:'relative',offset:10,house:'auto',increment:4,tolerance:1,alertDelaySeconds:30,enabled:true,updatedAt:now()},
 {id:'e'.repeat(32),name:'FIXA 02 · 🟦 Coringa → ⚪0 → ⚫11',before:{color:'any',number:null},after:{color:'black',number:11},mode:'relative',offset:10,house:'first',increment:4,tolerance:1,alertDelaySeconds:30,enabled:true,updatedAt:now()}
];
async function ensureWhitePresets(env){
 const existing=await env.R2.get(KEY.rules);
 if(existing)return doc(env,KEY.rules,[]);
 const presets=fixedPresets();await save(env,KEY.rules,presets);return presets;
}
const matchColor=(color,actual)=>color==='any'?['red','black'].includes(actual):color===actual;
const iconRule=c=>c==='any'?'🟦':c==='none'?'':' '+iconColor(c);
// Modo relativo: calcular +10min contados do branco, nunca confundir com somar números.
export function calculateRelativeWhiteWindows(white,last,offset=10,increment=4){
 if(!white||white.color!=='white'||!Number.isSafeInteger(white.minute_epoch)||!last||!Number.isSafeInteger(last.minute_epoch)||!Number.isInteger(offset)||offset<1||offset>120||!Number.isInteger(increment)||increment<3||increment>30)throw Error('Horários relativos inválidos');
 const target1=white.minute_epoch+offset*60;
 if(target1<=last.minute_epoch)return null; // Padrão chegou tarde: não inventar sinal vencido.
 const target2=target1+increment*60;
 return {sum:0,target1,target2,label1:hm(target1),label2:hm(target2)};
}

async function telegram(env,method,body){
 if(!botReady(env))throw Error('Cadastre o Secret NEXO_WHITE_BOT_TOKEN na Cloudflare.');
 const res=await fetch('https://api.telegram.org/bot'+env.NEXO_WHITE_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:enc(body),signal:AbortSignal.timeout(8000)});
 const payload=await res.json();if(!res.ok||payload.ok!==true)throw Error('Telegram '+method+': '+String(payload.description||res.status).slice(0,110));return payload.result;
}
async function log(env,data){const id=crypto.randomUUID().replaceAll('-','');await save(env,eventKey(id),{id,at:now(),...data});return id}
async function sendEvent(env,type,active,result=null){
 const cfg=await doc(env,KEY.config,defaults());
 const eventId=await log(env,{type,strategyId:active.strategyId,name:active.name,target1:active.target1,target2:active.target2,result:result?{minute_epoch:result.minute_epoch,number:result.number,color:result.color}:null});
 if(!cfg.botEnabled||!botReady(env)||!Array.isArray(cfg.chats)||!cfg.chats.length)return;
 const template=cfg.templates?.[type]||defaults().templates[type];
 if(!template)return;
 const media=await doc(env,KEY.media,[]);
 await Promise.allSettled([...new Set(cfg.chats.map(String))].map(async(chatId)=>{
  const key=deliveredKey(eventId,chatId);
  if(await env.R2.get(blockKey(chatId)))return; // Outro chat continua recebendo normalmente.
  if(await env.R2.get(key))return; // Não repetir um envio cujo resultado é incerto.
  await save(env,key,{eventId,chatId,type,status:'attempting',at:now()});
  try{
   let msg;
   if(template.type==='sticker'||template.type==='gif'){
    const chosen=media.find(x=>x.id===template.mediaId&&x.type===template.type);
    if(!chosen)throw Error('Mídia não encontrada');
    msg=await telegram(env,template.type==='sticker'?'sendSticker':'sendAnimation',{chat_id:chatId,[template.type==='sticker'?'sticker':'animation']:chosen.fileId});
   }else{
    msg=await telegram(env,'sendMessage',{chat_id:chatId,text:render(template.text,active,result),disable_web_page_preview:true});
   }
   await save(env,key,{eventId,chatId,type,status:'sent',messageId:msg?.message_id||null,at:now()});
  }catch(e){
   const error=String(e.message||e).slice(0,110);
   await save(env,key,{eventId,chatId,type,status:'uncertain',error,at:now()});
   await save(env,blockKey(chatId),{eventId,chatId,type,error,at:now()});
  }
 }));
}
const matchRule=(rows,rule)=>{
 const testBefore=a=>a&&matchColor(rule.before.color,a.color)&&(rule.before.number==null||a.number===rule.before.number);
 if(rule.after.color==='none'){
  if(rows.length<2)return null;
  const [first,white]=rows.slice(-2);
  if(!testBefore(first)||white.color!=='white'||white.number!==0||!([0,60].includes(white.minute_epoch-first.minute_epoch))||white.seq!==first.seq+1)return null;
  return {first,white,last:white};
 }
 if(rows.length<3)return null;
 const [first,white,last]=rows.slice(-3);
 if(!testBefore(first)||white.color!=='white'||white.number!==0||!matchColor(rule.after.color,last.color)||(rule.after.number!=null&&last.number!==rule.after.number))return null;
 if(white.seq!==first.seq+1||last.seq!==white.seq+1||last.minute_epoch<white.minute_epoch)return null;
 // A sequência coringa + branco exige o branco no mesmo minuto da primeira pedra.
 if(rule.mode==='relative'&&first.minute_epoch!==white.minute_epoch)return null;
 return {first,white,last};
};
const within=(time,target,tol)=>Math.abs(time-target)<=tol*60;
const lastEnd=a=>a.target2+a.tolerance*60;
const activeAt=a=>a&&a.status==='active';
const updateScore=async(env,id,key)=>{const score=await doc(env,scoreKey(id),emptyScore());score[key]=(score[key]||0)+1;score.updatedAt=now();await save(env,scoreKey(id),score)};

export async function whiteHasActiveForecast(env){const st=await doc(env,KEY.runtime,emptyRun());return !!activeAt(st.active)}
export async function whiteShouldBlockLegacy(env){const [st,cfg]=await Promise.all([doc(env,KEY.runtime,emptyRun()),doc(env,KEY.config,defaults())]);return cfg.botEnabled===true&&(!!activeAt(st.active)||await whiteV15Active(env))}

export async function resetWhiteAfterCatchup(env,game,rows){
 if(game.id!=='brabet-double'||!rows.length)return;
 const st=await doc(env,KEY.runtime,emptyRun());const max=Math.max(...rows.map(x=>Number(x.seq)||0));
 await resetWhiteV15(env,game,rows);
 if(max<=st.lastSeq)return;
 if(activeAt(st.active))await updateScore(env,st.active.strategyId,'cancelled');
 st.lastSeq=max;st.active=null;st.recent=[];st.lastSourceMinute=Math.max(...rows.map(x=>x.minute_epoch));st.lastReceivedAt=now();
 await save(env,KEY.runtime,st);
}

export async function processWhiteRounds(env,game,rows){
 if(game.id!=='brabet-double'||!rows.length)return;
 const cfg=await doc(env,KEY.config,defaults()),rules=(await ensureWhitePresets(env)).filter(x=>x.enabled);
 const st=await doc(env,KEY.runtime,emptyRun());
 const ordered=[...rows].filter(x=>Number.isSafeInteger(x.seq)).sort((a,b)=>a.seq-b.seq);
 for(const r of ordered){
  if(r.seq<=st.lastSeq)continue;
  st.lastSeq=r.seq;st.lastSourceMinute=Math.max(st.lastSourceMinute||0,r.minute_epoch);st.lastReceivedAt=now();
  if(activeAt(st.active)){
   const a=st.active;
   if(r.color==='white'&&(within(r.minute_epoch,a.target1,a.tolerance)||within(r.minute_epoch,a.target2,a.tolerance))){
    await sendEvent(env,'win',a,r);await updateScore(env,a.strategyId,'wins');st.active=null;
   }else if(r.minute_epoch>lastEnd(a)+60){
    // Somente fonte efetivamente além da última janela pode confirmar um LOSS.
    await sendEvent(env,'loss',a);await updateScore(env,a.strategyId,'losses');st.active=null;
   }
  }
  st.recent=[...(st.recent||[]),r].slice(-3);
  if(!activeAt(st.active)&&rules.length&&!await whiteV15BlocksOthers(env)){
   // Não disputar o jogo com uma estratégia tradicional ainda em execução.
   const legacy=await doc(env,'nexo-v3/runtime/game-owner/'+game.id+'.json',{ownerId:null});
   const chosen=!legacy.ownerId?rules.map(rule=>({rule,match:matchRule(st.recent,rule)})).find(x=>x.match):null;
   if(chosen){
    const {rule,match}=chosen,{first,white,last}=match;
    const dates=rule.mode==='relative'?calculateRelativeWhiteWindows(white,last,rule.offset||10,rule.increment):calculateWhiteWindows(first,white,last,rule.increment);
    if(dates){
     const sequence=`${rule.before.color==='any'?'🟦':iconColor(first.color)}${first.number} → ⚪0`+(rule.after.color==='none'?'':` → ${iconColor(last.color)}${last.number}`);
     const alertFirst=rule.mode==='relative'&&rule.alertDelaySeconds>0;
     const active={status:'active',strategyId:rule.id,name:rule.name,firstId:first.id,lastId:last.id,sourceWhiteMinute:white.minute_epoch,sequence,tolerance:rule.tolerance,increment:rule.increment,mode:rule.mode||'sum',house:rule.house==='auto'?(white.minute_epoch>first.minute_epoch?'first':'second'):(rule.house||'any'),...dates,attentionSent:alertFirst,signalSent:!alertFirst,alertDelaySeconds:rule.alertDelaySeconds||0,createdAt:now()};
     st.active=active;await updateScore(env,rule.id,'signals');
     if(alertFirst)await sendEvent(env,'attention',active);else await sendEvent(env,'signal',active);
    }
   }
  }
 }
 await save(env,KEY.runtime,st);
 await processWhiteV15(env,game,rows);
}

export async function scheduledWhite(env){
 const st=await doc(env,KEY.runtime,emptyRun()),a=st.active;if(!activeAt(a))return;
 // V14: atenção imediata na identificação; sinal após atraso configurado.
 // A rotina cron roda por minuto: 30s configurados podem demorar até ~60s extras.
 if(a.signalSent===false&&now()>=a.createdAt+(a.alertDelaySeconds||0)){
  a.signalSent=true;await save(env,KEY.runtime,st);
  if(now()-st.lastReceivedAt<150&&now()<a.target1-60)await sendEvent(env,'signal',a);
 }
 // A fonte precisa estar funcionando para que a mensagem de atenção seja confiável.
 if(!a.attentionSent&&now()>=a.target1-60&&now()<=a.target1+60&&now()-st.lastReceivedAt<150){
  a.attentionSent=true;await save(env,KEY.runtime,st);await sendEvent(env,'attention',a);
 }
 // Nunca concluir como LOSS só pela passagem do relógio, sem resultados da fonte.
 if(st.lastSourceMinute>lastEnd(a)+60){
  st.active=null;await save(env,KEY.runtime,st);await updateScore(env,a.strategyId,'losses');await sendEvent(env,'loss',a);
 }
}

function validatedRule(x,id){
 if(!x||typeof x!=='object')throw Error('Estratégia inválida');
 const name=String(x.name||'').trim();if(name.length<3||name.length>75)throw Error('Nome: de 3 a 75 caracteres');
 const readSide=(part,label,allowNone)=>{
  const color=String(part?.color||'');
  if(!['red','black','any',...(allowNone?['none']:[])].includes(color))throw Error('Cor '+label+' inválida');
  const number=part?.number==null||part?.number===''?null:Number(part.number);
  if(['any','none'].includes(color)){
   if(number!==null)throw Error('Coringa e sem pedra não aceitam número fixo');
  }else if(number!==null&&(!Number.isInteger(number)||number<1||number>14||(color==='red'?number>7:number<8)))throw Error('Número '+label+' não pertence à cor');
  return {color,number};
 };
 const before=readSide(x.before,'antes',false),after=readSide(x.after,'depois',true);
 const increment=Number(x.increment),tolerance=Number(x.tolerance);
 if(!Number.isInteger(increment)||increment<3||increment>30)throw Error('Proteção: 3 a 30 minutos');
 if(!Number.isInteger(tolerance)||tolerance<0||tolerance>2)throw Error('Tolerância: 0 a 2 minutos');
 const mode=x.mode==='relative'?'relative':'sum';
 if(mode==='sum'&&after.color==='none')throw Error('Soma exige uma pedra depois do branco');
 const offset=x.offset==null?10:Number(x.offset);
 if(!Number.isInteger(offset)||offset<1||offset>120)throw Error('Deslocamento: 1 a 120 minutos');
 const house=['first','second','any','auto'].includes(x.house)?x.house:'any';
 const alertDelaySeconds=x.alertDelaySeconds==null?0:Number(x.alertDelaySeconds);
 if(!Number.isInteger(alertDelaySeconds)||alertDelaySeconds<0||alertDelaySeconds>120)throw Error('Atraso do alerta: 0 a 120 segundos');
 return {id,name,before,after,mode,offset,house,increment,tolerance,alertDelaySeconds,enabled:x.enabled===true,updatedAt:now()};
}
function validateTemplate(v,media){
 if(!v||!['text','sticker','gif'].includes(v.type))throw Error('Selecione texto, sticker ou GIF');
 if(v.type==='text'){
  const text=String(v.text||'').trim();if(!text||text.length>1000)throw Error('Texto inválido (máximo 1000 caracteres)');return {type:'text',text};
 }
 if(!media.some(m=>m.id===v.mediaId&&m.type===v.type))throw Error('Escolha uma mídia importada para o novo bot');
 return {type:v.type,mediaId:v.mediaId};
}
async function readBody(request){try{return await request.json()}catch{throw Error('JSON inválido')}}
const allowedChat=x=>digits(x.id)&&['group','supergroup','private','channel'].includes(x.type);

// Esta rota é chamada SOMENTE após a sessão ADM e same-origin serem verificados em adm.js.
export async function routeWhiteAdmin(req,env,url){
 const path=url.pathname;if(!path.startsWith('/api/adm/white/'))return null;
 if(path.startsWith('/api/adm/white/v15/'))return routeWhiteV15Admin(req,env,url);
 try{
  const parts=path.slice('/api/adm/white/'.length).split('/');
  const config=()=>doc(env,KEY.config,defaults());const rules=()=>doc(env,KEY.rules,[]);const runtime=()=>doc(env,KEY.runtime,emptyRun());
  if(path==='/api/adm/white/overview'&&req.method==='GET'){
   await ensureWhitePresets(env);
   const [cfg,rs,st,chats,media,blockedEntries]=await Promise.all([config(),rules(),runtime(),doc(env,KEY.chats,[]),doc(env,KEY.media,[]),env.R2.list({prefix:ROOT+'blocked/',limit:30})]);
   const blocked=(await Promise.all((blockedEntries.objects||[]).map(x=>doc(env,x.key,null)))).filter(Boolean);
   const scores=await Promise.all(rs.map(async r=>({id:r.id,name:r.name,...await doc(env,scoreKey(r.id),emptyScore())})));
   return response({ok:true,config:cfg,rules:rs,runtime:st,chats,media,scores,blocked,botConfigured:botReady(env),sourcePrecision:'minute'});
  }
  if(path==='/api/adm/white/presets'&&req.method==='POST'){
   const body=await readBody(req);if(body.confirm!==true)return fail('Confirme a instalação dos modelos fixos');
   const old=await doc(env,KEY.rules,[]),missing=fixedPresets().filter(p=>!old.some(x=>x.id===p.id));
   if(old.length+missing.length>30)return fail('Limite de 30 estratégias');
   if(missing.length)await save(env,KEY.rules,[...old,...missing]);
   return response({ok:true,added:missing.length});
  }
  if(path==='/api/adm/white/rules'&&req.method==='POST'){
   const body=await readBody(req),list=await rules();if(list.length>=30)return fail('Máximo de 30 estratégias do branco');
   const rule=validatedRule({...body,enabled:body.mode==='relative'&&body.enabled!==false},crypto.randomUUID().replaceAll('-',''));list.push(rule);await save(env,KEY.rules,list);return response({ok:true,rule});
  }
  const ruleMatch=/^\/api\/adm\/white\/rules\/([a-f0-9]{32})$/.exec(path);
  if(ruleMatch&&['PUT','DELETE'].includes(req.method)){
   const list=await rules(),idx=list.findIndex(x=>x.id===ruleMatch[1]);if(idx<0)return fail('Estratégia não encontrada',404);
   const st=await runtime();
   if(req.method==='DELETE'){
    const body=await readBody(req);if(body.confirm!==true)return fail('Confirme a exclusão');
    if(st.active?.strategyId===ruleMatch[1]){await updateScore(env,ruleMatch[1],'cancelled');st.active=null;await save(env,KEY.runtime,st)}
    const gone=list.splice(idx,1)[0];await save(env,KEY.rules,list);await env.R2.delete?.(scoreKey(gone.id));return response({ok:true,deletedId:gone.id});
   }
   const body=await readBody(req),rule=validatedRule(body,ruleMatch[1]);if(st.active?.strategyId===rule.id&&(!rule.enabled||JSON.stringify({...rule,updatedAt:0})!==JSON.stringify({...list[idx],updatedAt:0}))){await updateScore(env,rule.id,'cancelled');st.active=null;await save(env,KEY.runtime,st)}
   list[idx]=rule;await save(env,KEY.rules,list);
   if(rule.enabled){
    const latest=await doc(env,'nexo-v1/games/brabet-double/latest.json',{items:[]});
    st.lastSeq=Math.max(st.lastSeq,...(latest.items||[]).map(x=>Number(x.seq)||0));st.recent=[];await save(env,KEY.runtime,st);
   }
   return response({ok:true,rule});
  }
  if(path==='/api/adm/white/config'&&req.method==='PUT'){
   const body=await readBody(req),cfg=await config(),media=await doc(env,KEY.media,[]);
   if(body.kind==='template'){
    if(!['signal','attention','win','loss'].includes(body.event))return fail('Tipo inválido');
    cfg.templates[body.event]=validateTemplate(body.template,media);
   }else if(body.kind==='bot'){
    if(body.botEnabled===true&&!botReady(env))return fail('Configure o Secret NEXO_WHITE_BOT_TOKEN antes de ativar',409);
    const chats=await doc(env,KEY.chats,[]);const ids=body.chats;
    if(!Array.isArray(ids)||ids.length>5||ids.some(x=>!digits(x)||!chats.some(c=>String(c.id)===String(x)&&c.permitted)))return fail('Selecione no máximo 5 chats confirmados');
    cfg.chats=[...new Set(ids.map(String))];
    if(body.botEnabled===true&&!cfg.botEnabled){const st=await runtime();st.active=null;await save(env,KEY.runtime,st)}
    cfg.botEnabled=body.botEnabled===true;
   }else return fail('Modo de configuração inválido');
   await save(env,KEY.config,cfg);return response({ok:true,config:cfg});
  }
  if(path==='/api/adm/white/chats/discover'&&req.method==='POST'){
   if(!botReady(env))return fail('Cadastre o Secret do novo bot',409);
   const updates=await telegram(env,'getUpdates',{timeout:0,offset:-100,limit:100,allowed_updates:['message','channel_post','my_chat_member']});
   const bot=await telegram(env,'getMe',{}),chats=await doc(env,KEY.chats,[]);
   const found=new Map(chats.map(c=>[String(c.id),c]));
   // Desduplicar chats antes de consultar permissões: não fazer uma chamada por mensagem.
   const candidates=new Map();
   for(const u of updates){const ch=u.message?.chat||u.channel_post?.chat||u.my_chat_member?.chat;if(allowedChat(ch))candidates.set(String(ch.id),ch)}
   for(const ch of [...candidates.values()].slice(-40)){
    let permitted=false;
    try{const member=await telegram(env,'getChatMember',{chat_id:ch.id,user_id:bot.id});permitted=ch.type==='private'||(['administrator','creator'].includes(member.status)&&member.can_post_messages!==false)}catch{permitted=ch.type==='private'}
    found.set(String(ch.id),{id:String(ch.id),name:String(ch.title||ch.first_name||'Chat privado').slice(0,70),type:ch.type,permitted});
   }
   const next=[...found.values()].slice(-40);await save(env,KEY.chats,next);return response({ok:true,chats:next});
  }
  if(path==='/api/adm/white/media/import'&&req.method==='POST'){
   if(!botReady(env))return fail('Cadastre o Secret do novo bot',409);
   const updates=await telegram(env,'getUpdates',{timeout:0,offset:-100,limit:100,allowed_updates:['message']});
   const known=await doc(env,KEY.chats,[]),catalog=await doc(env,KEY.media,[]);
   let count=0;
   for(const u of updates){const m=u.message;if(!known.some(c=>c.permitted&&String(c.id)===String(m?.chat?.id)))continue;
    const asset=m.sticker||m.animation;if(!asset?.file_id)continue;
    const type=m.sticker?'sticker':'gif';if(catalog.some(x=>x.fileId===asset.file_id))continue;
    catalog.push({id:crypto.randomUUID().replaceAll('-',''),fileId:asset.file_id,type,name:String(m.sticker?.emoji||m.animation?.file_name||type).slice(0,35)});count++;
   }
   await save(env,KEY.media,catalog.slice(-100));return response({ok:true,imported:count,media:catalog.slice(-100)});
  }
  if(path==='/api/adm/white/deliveries/clear'&&req.method==='POST'){
   const body=await readBody(req);if(body.confirm!==true||!digits(body.chatId))return fail('Confirme a revisão do chat');
   const key=blockKey(body.chatId),blocked=await doc(env,key,null);if(!blocked)return fail('Chat sem entrega incerta',404);
   await log(env,{type:'reviewed',chatId:String(body.chatId),note:'Administrador revisou e desbloqueou sem reenviar mensagens'});
   await env.R2.delete(key);return response({ok:true});
  }
  if(path==='/api/adm/white/bot/test'&&req.method==='POST'){
   const body=await readBody(req),cfg=await config();
   if(!cfg.chats.includes(String(body.chatId)))return fail('Chat não selecionado');
   await telegram(env,'sendMessage',{chat_id:String(body.chatId),text:'✅ NEXO BRANCO: teste manual de conexão. Sem sinal de aposta.'});return response({ok:true});
  }
  if(path==='/api/adm/white/events'&&req.method==='GET'){
   const items=await env.R2.list({prefix:ROOT+'events/',limit:80});const events=await Promise.all((items.objects||[]).slice(-50).map(async e=>doc(env,e.key,null)));
   return response({ok:true,events:events.filter(Boolean).sort((a,b)=>b.at-a.at).slice(0,30)});
  }
  return fail('Rota Branco não encontrada',404);
 }catch(e){return fail(String(e.message||e).slice(0,180),400)}
}
