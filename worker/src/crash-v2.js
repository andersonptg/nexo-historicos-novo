// NEXO Crash V2 - isolated storage namespace and HTTP routes.
// Never calls Double queue, white strategies, nor Telegram automatically.
import {crashV3Public} from './crash-v3.js';
const PREFIX='nexo-crash-v2/';
const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const j=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:h});
const get=async(env,key,fallback=null)=>{const x=await env.R2.get(PREFIX+key);return x?x.json():fallback};
const put=(env,key,x)=>env.R2.put(PREFIX+key,JSON.stringify(x),{httpMetadata:{contentType:'application/json'}});
const targets=[2,5,10,20,50,100];
const ranges=['<2x','2-<4x','4-<10x','>=10x'];
const defaultPalette=['#ef8296','#ffd16d','#61e3ad','#bb8cff'];
const cat=x=>x<2?0:x<4?1:x<10?2:3;
const valid=x=>x&&Number.isSafeInteger(x.seq)&&x.seq>0&&Number.isSafeInteger(x.minute_epoch)&&x.minute_epoch>1700000000&&x.minute_epoch<Math.floor(Date.now()/1000)+300&&typeof x.multiplier==='number'&&Number.isFinite(x.multiplier)&&x.multiplier>=1&&x.multiplier<=10000000;
function analyze(items,{threshold=5,length=3,minimum=3,gaps=[]}={}){
  threshold=Number(threshold);length=Number(length);minimum=Number(minimum);
  if(!targets.includes(threshold)||!Number.isInteger(length)||length<1||length>8||!Number.isInteger(minimum)||minimum<1||minimum>100)throw Error('Filtros invalidos');
  const seq=[...items].sort((a,b)=>a.seq-b.seq);const boundaries=new Set(gaps.map(g=>Number(g.after_seq)));const freq=new Map();let eligible=0,success=0;
  for(let i=length;i<seq.length;i++){
    const group=seq.slice(i-length,i+1);
    if(group.some((v,n)=>n>0&&(v.seq!==group[n-1].seq+1||boundaries.has(group[n-1].seq))))continue;
    const key=group.slice(0,-1).map(v=>cat(v.multiplier)).join(',');
    let v=freq.get(key);if(!v){v={pattern:key.split(',').map(k=>ranges[Number(k)]),count:0,hits:0};freq.set(key,v)}
    v.count++;eligible++;if(group.at(-1).multiplier>=threshold){v.hits++;success++}
  }
  const baseline=eligible?success/eligible:0;
  return {threshold,length,minimum,baseline,eligible,patterns:[...freq.values()].filter(v=>v.count>=minimum).map(v=>({...v,rate:v.hits/v.count,baseline})).sort((a,b)=>b.count-a.count||b.rate-a.rate).slice(0,80)};
}
function cleanStrategy(x,id){
 const name=String(x?.name||'').trim().slice(0,80),pattern=x?.pattern;
 if(name.length<2||!Array.isArray(pattern)||pattern.length<1||pattern.length>8||pattern.some(z=>!ranges.includes(z)))throw Error('Nome ou sequencia invalida');
 const target=Number(x.target);if(!targets.includes(target))throw Error('Multiplicador alvo invalido');
 return {id,name,pattern:[...pattern],target,entryText:String(x.entryText||'').slice(0,900),greenText:String(x.greenText||'').slice(0,900),enabled:x.enabled===true,createdAt:Number(x.createdAt)||Date.now(),updatedAt:Date.now()};
}
function cleanMsg(src){const out={};for(const k of ['attention','entry','green','red','closed']){const z=src?.[k]||{};const kind=['text','sticker','gif'].includes(z.kind)?z.kind:'text';const file_id=String(z.file_id||'').trim();if(file_id.length>240||!/^[-_A-Za-z0-9]*$/.test(file_id))throw Error('file_id invalido');out[k]={text:String(z.text||'').slice(0,900),kind,file_id};}return out}
const defaults={attention:{kind:'text',text:'🔎 CRASH PRO | POSSÍVEL SINAL\nAguardando confirmação da sequência.'},entry:{kind:'text',text:'🤖 CRASH PRO | ENTRADA\nAlvo: {alvo}x\nEntrada somente após rodada confirmada.'},green:{kind:'text',text:'✅ CRASH PRO | GREEN\nVela: {vela}x'},red:{kind:'text',text:'🔴 CRASH PRO | RED\nPadrão não confirmou o alvo.'},closed:{kind:'text',text:'⛔ CRASH PRO | ENCERRADO'}};
export async function crashPublic(req,env,u){
 const v3=await crashV3Public(req,env,u,{analyze});if(v3)return v3;
 if(!u.pathname.startsWith('/api/crash/'))return null;
 if(!env.R2)return j({ok:false,error:'R2 indisponivel'},503);
 if(u.pathname==='/api/crash/history'&&req.method==='GET'){
   const data=await get(env,'history.json',{items:[],updated_at:null,gaps:[]});const limit=Math.min(200,Math.max(1,Number(u.searchParams.get('limit'))||80));
   return j({ok:true,game_id:'blitz-crash',precision:'minute',items:(data.items||[]).slice(0,limit),updated_at:data.updated_at,gaps:data.gaps||[],palette:await get(env,'palette.json',defaultPalette)});
 }
 if(u.pathname==='/api/crash/analysis'&&req.method==='GET'){
   try{const data=await get(env,'history.json',{items:[]});return j({ok:true,...analyze(data.items||[],{threshold:u.searchParams.get('target')||5,length:u.searchParams.get('length')||3,minimum:u.searchParams.get('minimum')||3,gaps:data.gaps||[]})})}catch(e){return j({ok:false,error:String(e.message)},400)}
 }
 if(u.pathname==='/api/crash/ingest'&&req.method==='POST'){
   const key=env.NEXO_V1_INGEST_TOKEN;const auth=req.headers.get('Authorization');
   if(typeof key!=='string'||key.length<32||auth!==`Bearer ${key}`)return j({ok:false,error:'Nao autorizado'},401);
   const raw=await req.text();if(raw.length>120000)return j({ok:false,error:'Lote excessivo'},413);
   let x;try{x=JSON.parse(raw)}catch{return j({ok:false,error:'JSON invalido'},400)}
   if(x?.game_id!=='blitz-crash'||!Array.isArray(x.items)||x.items.length<1||x.items.length>200||x.items.some(v=>!valid(v)))return j({ok:false,error:'Resultados invalidos'},400);
   const seq=new Set(x.items.map(v=>v.seq));if(seq.size!==x.items.length)return j({ok:false,error:'Sequencia duplicada no lote'},400);
   const old=await get(env,'history.json',{items:[],gaps:[]});const latestSeq=Math.max(0,...old.items.map(v=>v.seq));const newRows=x.items.filter(v=>v.seq>latestSeq).map(v=>({seq:v.seq,minute_epoch:v.minute_epoch,multiplier:Math.round(v.multiplier*10000)/10000}));
   const submittedGaps=Array.isArray(x.gaps)?x.gaps.filter(v=>Number.isSafeInteger(v.after_seq)&&v.after_seq>0).slice(-40):[];
   const gaps=[...(old.gaps||[]),...submittedGaps.filter(v=>!(old.gaps||[]).some(y=>y.after_seq===v.after_seq))];if(latestSeq&&newRows.length){const oldestNew=Math.min(...newRows.map(v=>v.seq));if(oldestNew>latestSeq+1)gaps.push({after_seq:latestSeq,before_seq:oldestNew,recorded_at:Date.now()})}
   const result=[...newRows,...old.items].sort((a,b)=>b.seq-a.seq).slice(0,1500);
   // R2 accepts latest snapshot; this endpoint is intended for ONE publisher only.
   if(newRows.length||gaps.length!==(old.gaps||[]).length)await put(env,'history.json',{items:result,gaps:gaps.slice(-40),updated_at:Date.now()});
   return j({ok:true,added:newRows.length,total:result.length,last_seq:Math.max(latestSeq,...seq)});
 }
 return j({ok:false,error:'Rota Crash desconhecida'},404)
}
export async function crashAdmin(req,env,u,{sendTelegram,ownerId,groups}={}){
 if(!u.pathname.startsWith('/api/adm/crash/'))return null;
 const action=u.pathname.slice('/api/adm/crash/'.length);
 if(req.method!=='GET'&&req.headers.get('Origin')&&req.headers.get('Origin')!==u.origin)return j({ok:false,error:'Origem invalida'},403);
 const strategies=()=>get(env,'strategies.json',[]),messages=()=>get(env,'messages.json',defaults);
 if(action==='bootstrap'&&req.method==='GET')return j({ok:true,strategies:await strategies(),messages:await messages(),palette:await get(env,'palette.json',defaultPalette),groups:groups||[],ownerPaired:!!ownerId,telegram:'teste privado disponivel; envio automatico ainda desativado'});
 if(action==='strategies'&&req.method==='POST'){
   const cur=await strategies();if(cur.length>=200)return j({ok:false,error:'Limite de regras'},400);
   let x;try{x=cleanStrategy(await req.json(),crypto.randomUUID())}catch(e){return j({ok:false,error:e.message},400)}
   const next=[...cur,x];await put(env,'strategies.json',next);return j({ok:true,strategy:x});
 }
 if(action.startsWith('strategies/')&&['PUT','DELETE'].includes(req.method)){
   const id=action.slice('strategies/'.length),cur=await strategies(),old=cur.find(x=>x.id===id);if(!old)return j({ok:false,error:'Nao encontrada'},404);
   if(req.method==='DELETE'){await put(env,'strategies.json',cur.filter(x=>x.id!==id));return j({ok:true})}
   let x;try{x=cleanStrategy({...old,...await req.json()},id)}catch(e){return j({ok:false,error:e.message},400)}
   await put(env,'strategies.json',cur.map(v=>v.id===id?x:v));return j({ok:true,strategy:x});
 }
 if(action==='palette'&&req.method==='PUT'){
  let colors;try{colors=(await req.json()).palette}catch{return j({ok:false,error:'JSON invalido'},400)}
  if(!Array.isArray(colors)||colors.length!==4||colors.some(v=>typeof v!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v)))return j({ok:false,error:'Cores HEX invalidas'},400);
  await put(env,'palette.json',colors);return j({ok:true,palette:colors});
 }
 if(action==='messages'&&req.method==='PUT'){
   let x;try{x=cleanMsg(await req.json())}catch(e){return j({ok:false,error:e.message},400)}await put(env,'messages.json',x);return j({ok:true,messages:x});
 }
 if(action==='test-private'&&req.method==='POST'){
   if(!ownerId||typeof sendTelegram!=='function')return j({ok:false,error:'Vincule primeiro o ID privado ao bot atual no painel Telegram'},400);
   const x=await req.json();const k=String(x.event||'attention');if(!['attention','entry','green','red','closed'].includes(k))return j({ok:false,error:'Evento invalido'},400);
   const msg=(await messages())[k];let result;
   try{result=msg.kind==='sticker'&&msg.file_id?await sendTelegram('sendSticker',{chat_id:ownerId,sticker:msg.file_id}):msg.kind==='gif'&&msg.file_id?await sendTelegram('sendAnimation',{chat_id:ownerId,animation:msg.file_id,caption:msg.text||undefined}):await sendTelegram('sendMessage',{chat_id:ownerId,text:msg.text||'🤖 CRASH PRO | TESTE PRIVADO'})}
   catch(e){return j({ok:false,error:'Falha ao enviar teste privado: '+String(e.message||e).slice(0,100)},502)}
   return j({ok:true,telegram_message_id:result?.message_id||null});
 }
 return j({ok:false,error:'Rota ADM Crash desconhecida'},404);
}
export const crashHelpers={analyze,cat,cleanStrategy,cleanMsg,valid};
