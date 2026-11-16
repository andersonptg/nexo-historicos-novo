/* NEXO V15 · estratégias experimentais independentes: pedras devedoras e coringas.
   Não prevê resultados. A fonte tem precisão de minuto; a ordem seq é observada,
   mas "3 casas/minuto" é apenas parâmetro de visualização até haver fonte por giro. */
const ROOT='nexo-white-v15/';
const KEY={rules:ROOT+'rules.json',runtime:ROOT+'runtime.json',config:ROOT+'config.json'};
const CFG_WHITE='nexo-white-v1/config.json';
const RULES_WHITE='nexo-white-v1/runtime.json';
const CHATLIST='nexo-white-v1/chats.json';
const MEDIA='nexo-white-v1/media.json';
const OWNER='nexo-v3/runtime/game-owner/brabet-double.json';
const now=()=>Math.floor(Date.now()/1000);
const read=async(env,key,fallback)=>{const val=await env.R2.get(key);return val?await val.json():structuredClone(fallback)};
const write=(env,key,obj)=>env.R2.put(key,JSON.stringify(obj),{httpMetadata:{contentType:'application/json'}});
const ok=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const bad=(msg,status=400)=>ok({ok:false,error:msg},status);
const slug=x=>String(x).replace(/[^0-9-]/g,'').replace('-','m');
const guid=()=>crypto.randomUUID().replace(/-/g,'');
const hasId=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const tokenReady=env=>/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(String(env.NEXO_WHITE_BOT_TOKEN||''));
const tz=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false});
const hm=t=>Number.isSafeInteger(t)?tz.format(new Date(t*1000)):'—';
const ic=r=>r?.color==='red'?'🔴':r?.color==='black'?'⚫':'⚪';
const ruleNames={debt4:'Devedora após a pedra 4',debt11:'Devedora antes da pedra 11',minute4:'Coringa após 4 · mesmo minuto',minute11:'Coringa antes do 11 · minuto anterior'};
const templates=()=>({
 attention:{type:'text',text:'⚠️ ATENÇÃO · {estrategia}\n{padrao}\n{formula}'},
 signal:{type:'text',text:'🤍 BRANCO BRABET PRO\n{formula}\n{janela}\n{hora1} ▫️ {hora2} ▫️\n⚠️ Tendência experimental; sem garantia.'},
 win:{type:'text',text:'✅✅✅✅ WIN · {resultado} · {estrategia}\n{formula}'},
 loss:{type:'text',text:'🚫 LOSS · {estrategia} · janela encerrada\n{formula}'}
});
const defaultConfig=()=>({roundsPerMinute:3,signupEnabled:false,signupLabel:'CADASTRE-SE NA PLATAFORMA',signupUrl:'',messageTemplates:templates()});
const initialState=()=>({lastSeq:0,recent:[],debts:{},active:null,lastSourceMinute:0,lastReceivedAt:0});
const scoreDefault=()=>({signals:0,wins:0,losses:0,cancelled:0});
const presetRules=()=>[
 {id:'a'.repeat(32),type:'debt4',name:'FIXA 03 · 🔴4 → 🔴1 (devedora)',anchor:4,owed:1,waitRounds:1,windowRounds:4,offset:10,protection:4,tolerance:1,enabled:false,chats:[]},
 {id:'b'.repeat(32),type:'debt11',name:'FIXA 04 · 🔴5 → ⚫11 (devedora)',anchor:11,owed:5,waitRounds:1,windowRounds:4,offset:10,protection:4,tolerance:1,enabled:false,chats:[]},
 {id:'c'.repeat(32),type:'minute4',name:'FIXA 05 · 🔴4 → 🟦★ → 🟦★',anchor:4,owed:1,waitRounds:1,windowRounds:4,offset:10,protection:4,tolerance:1,enabled:false,chats:[]},
 {id:'d'.repeat(32),type:'minute11',name:'FIXA 06 · 🟦★ → 🟦★ → ⚫11',anchor:11,owed:5,waitRounds:1,windowRounds:4,offset:10,protection:4,tolerance:1,enabled:false,chats:[]}
];
const persistedPresets=()=>presetRules().map(r=>({...r,updatedAt:now()}));
async function ensureRules(env){if(await env.R2.get(KEY.rules))return read(env,KEY.rules,[]);const rules=persistedPresets();await write(env,KEY.rules,rules);return rules}
const scoreKey=id=>ROOT+'scores/'+id+'.json';
async function score(env,id,field){const s=await read(env,scoreKey(id),scoreDefault());s[field]=(s[field]||0)+1;await write(env,scoreKey(id),s)}
function validateRule(x,id,allowedChats){
 if(!x||!Object.hasOwn(ruleNames,x.type))throw Error('Tipo de estratégia desconhecido');
 const name=String(x.name||'').trim();if(name.length<3||name.length>75)throw Error('Nome deve ter de 3 a 75 caracteres');
 const limit=(v,min,max,label)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw Error(label+' inválido');return n};
 const anchor=limit(x.anchor,1,14,'Pedra âncora'),owed=limit(x.owed,1,14,'Pedra devedora');
 if(x.type==='debt4'&&anchor>7)throw Error('Pedra âncora do padrão após 4 deve ser vermelha');
 if(x.type==='debt11'&&anchor<8)throw Error('Pedra 11 deve ser preta');
 if(x.type==='minute4'&&anchor>7)throw Error('Âncora do padrão 4 deve ser vermelha');
 if(x.type==='minute11'&&anchor<8)throw Error('Âncora do padrão 11 deve ser preta');
 const waitRounds=limit(x.waitRounds??1,1,5,'Casas de espera'),windowRounds=limit(x.windowRounds??4,1,12,'Janela por rodadas');
 const offset=limit(x.offset??10,1,120,'Deslocamento'),protection=limit(x.protection??4,1,30,'Proteção'),tolerance=limit(x.tolerance??1,0,2,'Tolerância');
 const chats=x.chats??[];if(!Array.isArray(chats)||chats.length>5||chats.some(c=>!allowedChats.includes(String(c))))throw Error('Grupos devem estar autorizados no bot de branco');
 return {id,type:x.type,name,anchor,owed,waitRounds,windowRounds,offset,protection,tolerance,enabled:x.enabled===true,chats:[...new Set(chats.map(String))],updatedAt:now()};
}
function checkColor(r,n){return r&&r.number===n&&r.color===(n<=7?'red':'black')}
const colored=x=>x&&['red','black'].includes(x.color);
const consecutive=(a,b)=>!!a&&!!b&&b.seq===a.seq+1;
function minuteMatch(recent,rule){
 if(recent.length<3)return null;
 const [a,b,c]=recent.slice(-3);
 if(!consecutive(a,b)||!consecutive(b,c))return null;
 if(rule.type==='minute4'){
  if(!checkColor(a,rule.anchor)||!colored(b)||!colored(c))return null;
  if(a.minute_epoch!==b.minute_epoch||b.minute_epoch!==c.minute_epoch)return null;
  return {base:a.minute_epoch,sequence:`${ic(a)}${a.number} → 🟦${b.number} → 🟦${c.number}`,pattern:[a,b,c]};
 }
 if(rule.type==='minute11'){
  if(!colored(a)||!colored(b)||!checkColor(c,rule.anchor))return null;
  if(a.minute_epoch!==b.minute_epoch||c.minute_epoch!==a.minute_epoch+60)return null;
  return {base:c.minute_epoch-60,sequence:`🟦${a.number} → 🟦${b.number} → ${ic(c)}${c.number}`,pattern:[a,b,c]};
 }
 return null;
}
export function computeMinuteTargets(base,offset=10,protection=4){
 if(!Number.isSafeInteger(base)||!Number.isInteger(offset)||offset<1||offset>120||!Number.isInteger(protection)||protection<1||protection>30)throw Error('Intervalo inválido');
 return {target1:base+offset*60,target2:base+(offset+protection)*60,label1:hm(base+offset*60),label2:hm(base+(offset+protection)*60)};
}
async function allowed(env){const legacy=await read(env,OWNER,{ownerId:null}),old=await read(env,RULES_WHITE,{active:null});return !legacy?.ownerId&&!old?.active;}
const active=(st)=>st.active&&st.active.status==='active';
export async function whiteV15Active(env){const state=await read(env,KEY.runtime,initialState());return Boolean(active(state))}
export async function whiteV15BlocksOthers(env){const cfg=await read(env,CFG_WHITE,{botEnabled:false});return cfg.botEnabled===true&&await whiteV15Active(env)}
const ruleRef=r=>r.name||ruleNames[r.type]||'Estratégia';
function templateValues(a,result){return {
 estrategia:a.name, padrao:a.sequence||'', sequencia:a.sequence||'',pedra:a.owed==null?'':String(a.owed),
 hora1:hm(a.target1),hora2:hm(a.target2),resultado:result?hm(result.minute_epoch):'',
 formula:a.type.startsWith('debt')?`Pedra ${a.owed} puxa o próximo branco em até ${a.windowRounds} casas 🏡⚪`:`Base ${hm(a.base)} + ${a.offset} min = ${hm(a.target1)} · proteção +${a.protection} min = ${hm(a.target2)}`,
 janela:a.type.startsWith('debt')?`Entrar branco em até ${a.windowRounds} rodadas confirmadas`:`Tendência: ${hm(a.target1)} e ${hm(a.target2)} (±${a.tolerance} min)`,
 casas:String(a.windowRounds),minutos:String(a.offset),casa:'ordem estimada',
 };
}
const interpolate=(str,a,result)=>String(str||'').replace(/\{(estrategia|padrao|sequencia|pedra|hora1|hora2|resultado|formula|janela|casas|minutos|casa)\}/g,(_,k)=>templateValues(a,result)[k]);
const htmlEscape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
async function tg(env,method,body){
 const res=await fetch('https://api.telegram.org/bot'+env.NEXO_WHITE_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
 const data=await res.json();if(!res.ok||!data.ok)throw Error('Telegram '+method+': '+String(data.description||res.status).slice(0,90));return data.result;
}
async function deliver(env,eventType,a,result=null){
 const eventId=guid(), timestamp=now();await write(env,ROOT+'events/'+eventId+'.json',{eventId,type:eventType,strategyId:a.strategyId,strategy:a.name,at:timestamp,sequence:a.sequence||'',result:result?{color:result.color,number:result.number,minute_epoch:result.minute_epoch}:null});
 const global=await read(env,CFG_WHITE,{botEnabled:false,chats:[]});
 if(global.botEnabled!==true||!tokenReady(env))return;
 const cfg=await read(env,KEY.config,defaultConfig()),media=await read(env,MEDIA,[]);
 const targets=a.chats?.length?a.chats:global.chats||[];
 const chats=[...new Set(targets.map(String))].filter(c=>(global.chats||[]).map(String).includes(c));
 if(!chats.length)return;
 const tmpl=cfg.messageTemplates?.[eventType]||templates()[eventType];if(!tmpl)return;
 await Promise.allSettled(chats.map(async chatId=>{
  const block=ROOT+'blocked/'+slug(chatId)+'.json';if(await env.R2.get(block))return;
  const delivery=ROOT+'deliveries/'+eventId+'_'+slug(chatId)+'.json';
  if(await env.R2.get(delivery))return;
  await write(env,delivery,{status:'attempting',eventId,chatId,at:timestamp});
  try{
   let sent;
   if(tmpl.type==='sticker'||tmpl.type==='gif'){
    const chosen=media.find(m=>m.id===tmpl.mediaId&&m.type===tmpl.type);if(!chosen)throw Error('Sticker ou GIF não encontrado no bot de branco');
    sent=await tg(env,tmpl.type==='sticker'?'sendSticker':'sendAnimation',{chat_id:chatId,[tmpl.type==='sticker'?'sticker':'animation']:chosen.fileId});
   }else sent=await tg(env,'sendMessage',{chat_id:chatId,text:interpolate(tmpl.text,a,result),disable_web_page_preview:true});
   if(eventType==='signal'&&cfg.signupEnabled&&cfg.signupUrl){
    const html=`🔗 <a href="${htmlEscape(cfg.signupUrl)}">${htmlEscape(cfg.signupLabel)}</a>`;
    await tg(env,'sendMessage',{chat_id:chatId,text:html,parse_mode:'HTML',disable_web_page_preview:true});
   }
   await write(env,delivery,{status:'sent',eventId,chatId,messageId:sent?.message_id||null,at:now()});
  }catch(e){const error=String(e.message||e).slice(0,130);await write(env,delivery,{status:'uncertain',eventId,chatId,error,at:now()});await write(env,block,{eventId,chatId,error,at:now()})}
 }));
}
async function finish(env,st,type,result){const a=st.active;if(!a)return;st.active=null;await score(env,a.strategyId,type==='win'?'wins':type==='loss'?'losses':'cancelled');await write(env,KEY.runtime,st);if(type==='win'||type==='loss')await deliver(env,type,a,result)}
function expiredDebt(st,r){for(const [id,debt] of Object.entries(st.debts||{}))if(r.seq-debt.originSeq>150||r.minute_epoch-debt.at>7200)delete st.debts[id]}
function matchDebtPattern(a,b,r){
 if(!consecutive(a,b)||!colored(a)||!colored(b))return false;
 if(b.minute_epoch-a.minute_epoch>60)return false;
 return r.type==='debt4'?checkColor(a,r.anchor)&&checkColor(b,r.owed):checkColor(a,r.owed)&&checkColor(b,r.anchor);
}
export async function processWhiteV15(env,game,rows){
 if(game.id!=='brabet-double'||!Array.isArray(rows)||!rows.length)return;
 const rules=(await ensureRules(env)).filter(r=>r.enabled),st=await read(env,KEY.runtime,initialState());
 const order=[...rows].filter(r=>Number.isSafeInteger(r.seq)&&Number.isSafeInteger(r.minute_epoch)&&Number.isInteger(r.number)).sort((a,b)=>a.seq-b.seq);
 for(const r of order){
  if(r.seq<=st.lastSeq)continue;
  if(st.lastSeq>0&&r.seq>st.lastSeq+3){if(active(st))await score(env,st.active.strategyId,'cancelled');st.active=null;st.debts={};st.recent=[]}
  st.lastSeq=r.seq;st.lastSourceMinute=Math.max(st.lastSourceMinute||0,r.minute_epoch);st.lastReceivedAt=now();expiredDebt(st,r);
  if(active(st)){
   const a=st.active;
   if(a.stage==='wait'&&r.seq>a.triggerSeq){
    a.waitLeft--;
    if(a.waitLeft<=0){
     a.stage='window';a.startSeq=r.seq+1;a.endSeq=r.seq+a.windowRounds;a.signalSent=true;
     if(a.type.startsWith('minute')&&r.minute_epoch>=a.target1-60*(a.tolerance+1)){await finish(env,st,'cancelled')}
     else{await write(env,KEY.runtime,st);await score(env,a.strategyId,'signals');await deliver(env,'signal',a)}
    }
   }else if(a.stage==='window'&&a.type.startsWith('debt')&&r.seq>=a.startSeq){
    if(r.color==='white'){await finish(env,st,'win',r)}
    else if(r.seq>=a.endSeq){await finish(env,st,'loss')}
   }else if(a.stage==='window'&&a.type.startsWith('minute')){
    if(r.color==='white'&&(Math.abs(r.minute_epoch-a.target1)<=a.tolerance*60||Math.abs(r.minute_epoch-a.target2)<=a.tolerance*60))await finish(env,st,'win',r);
    else if(r.minute_epoch>a.target2+a.tolerance*60+60)await finish(env,st,'loss');
   }
  }
  st.recent=[...(st.recent||[]),r].slice(-4);
  // Não sobrepor eventos: uma estratégia de branco ou cor em execução vence a prioridade.
  const avail=!active(st)&&await allowed(env);
  if(avail&&rules.length){
   const debtTrigger=rules.find(rule=>rule.type.startsWith('debt')&&st.debts?.[rule.id]&&r.seq>st.debts[rule.id].originSeq+1&&checkColor(r,rule.owed));
   if(debtTrigger){
    const d=st.debts[debtTrigger.id];delete st.debts[debtTrigger.id];
    const a={status:'active',type:debtTrigger.type,stage:'wait',strategyId:debtTrigger.id,name:debtTrigger.name,chats:debtTrigger.chats,owed:debtTrigger.owed,sequence:d.sequence+' → '+ic(r)+r.number+' (retorno)',windowRounds:debtTrigger.windowRounds,waitLeft:debtTrigger.waitRounds,triggerSeq:r.seq,detectedAt:now()};
    st.active=a;await write(env,KEY.runtime,st);await deliver(env,'attention',a);
   }else{
    for(const rule of rules){
     if(!rule.type.startsWith('minute'))continue;
     const match=minuteMatch(st.recent,rule);if(!match)continue;
     const targets=computeMinuteTargets(match.base,rule.offset,rule.protection);
     if(targets.target1<=r.minute_epoch+60)continue;
     const a={status:'active',type:rule.type,stage:'wait',strategyId:rule.id,name:rule.name,chats:rule.chats,sequence:match.sequence,triggerSeq:r.seq,waitLeft:rule.waitRounds,windowRounds:rule.windowRounds,offset:rule.offset,protection:rule.protection,tolerance:rule.tolerance,base:match.base,...targets,detectedAt:now()};
     st.active=a;await write(env,KEY.runtime,st);await deliver(env,'attention',a);break;
    }
   }
  }
  // Registrar substituição só quando ainda não há dívida pendente da mesma regra.
  for(const rule of rules){
   if(!rule.type.startsWith('debt')||st.debts?.[rule.id])continue;
   const [a,b]=st.recent.slice(-2);
   if(matchDebtPattern(a,b,rule))st.debts[rule.id]={originSeq:b.seq,at:b.minute_epoch,sequence:`${ic(a)}${a.number} → ${ic(b)}${b.number}`};
  }
 }
 await write(env,KEY.runtime,st);
}
export async function resetWhiteV15(env,game,rows){
 if(game.id!=='brabet-double'||!rows.length)return;
 const st=await read(env,KEY.runtime,initialState()),max=Math.max(...rows.map(r=>Number(r.seq)||0));
 if(max<=st.lastSeq)return;
 if(active(st))await score(env,st.active.strategyId,'cancelled');
 st.lastSeq=max;st.recent=[];st.debts={};st.active=null;st.lastReceivedAt=now();st.lastSourceMinute=Math.max(...rows.map(r=>r.minute_epoch));await write(env,KEY.runtime,st);
}
const validateConfig=x=>{
 const url=String(x.signupUrl||'').trim(),label=String(x.signupLabel||'CADASTRE-SE NA PLATAFORMA').trim();
 if(label.length<3||label.length>75)throw Error('Nome do link: 3 a 75 caracteres');
 if(url){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))throw Error('Use um link HTTPS público válido');}
 if(x.signupEnabled&&!url)throw Error('Cadastre primeiro o link HTTPS');
 const rounds=Number(x.roundsPerMinute);if(!Number.isInteger(rounds)||rounds<1||rounds>6)throw Error('Casas por minuto: 1 a 6');
 return {signupEnabled:x.signupEnabled===true,signupUrl:url,signupLabel:label,roundsPerMinute:rounds};
};
function validTemplate(x,media){
 if(!x||!['text','sticker','gif'].includes(x.type))throw Error('Formato inválido');
 if(x.type==='text'){const value=String(x.text||'').trim();if(!value||value.length>1200)throw Error('Mensagem vazia ou acima de 1200 caracteres');return {type:'text',text:value}}
 if(!media.some(m=>m.id===x.mediaId&&m.type===x.type))throw Error('Escolha um sticker ou GIF do segundo bot');return {type:x.type,mediaId:x.mediaId};
}
async function body(req){try{return await req.json()}catch{throw Error('JSON inválido')}}
export async function routeWhiteV15Admin(req,env,url){
 if(!url.pathname.startsWith('/api/adm/white/v15/'))return null;
 const p=url.pathname.slice('/api/adm/white/v15/'.length);
 try{
  if(p==='overview'&&req.method==='GET'){
   const [rules,conf,runtime,global,chats,media,bl]=await Promise.all([ensureRules(env),read(env,KEY.config,defaultConfig()),read(env,KEY.runtime,initialState()),read(env,CFG_WHITE,{botEnabled:false,chats:[]}),read(env,CHATLIST,[]),read(env,MEDIA,[]),env.R2.list({prefix:ROOT+'blocked/',limit:30})]);
   const scores=await Promise.all(rules.map(async r=>({id:r.id,...await read(env,scoreKey(r.id),scoreDefault())})));
   const blocked=(await Promise.all((bl.objects||[]).map(x=>read(env,x.key,null)))).filter(Boolean);
   return ok({ok:true,rules,config:conf,runtime:{active:runtime.active,debts:runtime.debts,lastSeq:runtime.lastSeq},botEnabled:global.botEnabled===true,botConfigured:tokenReady(env),globalChats:(global.chats||[]).map(String),chats,media,scores,blocked});
  }
  if(p==='rules/restore'&&req.method==='POST'){
   const b=await body(req);if(b.confirm!==true)return bad('Confirme a restauração');
   const current=await ensureRules(env),missing=persistedPresets().filter(r=>!current.some(x=>x.id===r.id));if(current.length+missing.length>30)return bad('Máximo de 30 estratégias');
   if(missing.length)await write(env,KEY.rules,[...current,...missing]);return ok({ok:true,added:missing.length});
  }
  if(p==='rules'&&req.method==='POST'){
   const old=await ensureRules(env),g=await read(env,CFG_WHITE,{chats:[]});if(old.length>=30)return bad('Máximo de 30 estratégias');
   const r=validateRule(await body(req),guid(),(g.chats||[]).map(String));old.push(r);await write(env,KEY.rules,old);return ok({ok:true,rule:r});
  }
  const mat=/^rules\/([a-f0-9]{32})$/.exec(p);
  if(mat&&['PUT','DELETE'].includes(req.method)){
   const current=await ensureRules(env),pos=current.findIndex(r=>r.id===mat[1]);if(pos<0)return bad('Estratégia inexistente',404);
   const b=await body(req),st=await read(env,KEY.runtime,initialState());
   if(req.method==='DELETE'){
    if(b.confirm!==true)return bad('Confirme a exclusão');
    if(active(st)&&st.active.strategyId===mat[1]){st.active=null;await score(env,mat[1],'cancelled')}
    delete st.debts[mat[1]];current.splice(pos,1);await write(env,KEY.runtime,st);await write(env,KEY.rules,current);return ok({ok:true,deleted:mat[1]});
   }
   const g=await read(env,CFG_WHITE,{chats:[]}),updated=validateRule(b,mat[1],(g.chats||[]).map(String));
   if(active(st)&&st.active.strategyId===mat[1]){st.active=null;await score(env,mat[1],'cancelled')}
   delete st.debts[mat[1]];current[pos]=updated;
   if(updated.enabled){const latest=await read(env,'nexo-v1/games/brabet-double/latest.json',{items:[]});st.lastSeq=Math.max(st.lastSeq,...(latest.items||[]).map(r=>Number(r.seq)||0));st.recent=[]}
   await write(env,KEY.runtime,st);await write(env,KEY.rules,current);return ok({ok:true,rule:updated});
  }
  if(p==='config'&&req.method==='PUT'){
   const data=await body(req),cfg=await read(env,KEY.config,defaultConfig());
   if(data.kind==='general')Object.assign(cfg,validateConfig(data));
   else if(data.kind==='template'){if(!['attention','signal','win','loss'].includes(data.event))return bad('Evento inválido');const m=await read(env,MEDIA,[]);cfg.messageTemplates[data.event]=validTemplate(data.template,m)}
   else return bad('Configuração desconhecida');await write(env,KEY.config,cfg);return ok({ok:true,config:cfg});
  }
  if(p==='blocked/clear'&&req.method==='POST'){
   const b=await body(req);const ch=String(b.chatId||'');if(b.confirm!==true||!/^[-\d]{5,20}$/.test(ch))return bad('Confirme o grupo');
   const key=ROOT+'blocked/'+slug(ch)+'.json';if(!await env.R2.get(key))return bad('Sem bloqueio pendente',404);
   await write(env,ROOT+'reviews/'+guid()+'.json',{chatId:ch,at:now(),kind:'desbloqueio manual sem reenvio'});await env.R2.delete(key);return ok({ok:true});
  }
  return bad('Rota da V15 não encontrada',404);
 }catch(e){return bad(String(e.message||e).slice(0,190))}
}
