// NEXO Cloud V5 - independent research collector, no Telegram dispatch.
// Source snapshots are observational data, not guaranteed live/complete.
import cloudCatalog from '../../catalog-cloud.json' with {type:'json'};
const GAMES=cloudCatalog.games;
const GAME_BY_ID=new Map(GAMES.map(g=>[g.id,g]));
const ROOT='nexo-cloud-v5/';
const HEADER={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:HEADER});
const MAX_HISTORY=1200;
const DEFAULT={running:false,tickSeconds:15,batch:3,consent:false,updated_at:0};
const textSafe=(v,n=130)=>String(v||'').slice(0,n);
const getR2=async(env,key,fallback=null)=>{const ob=await env.R2.get(ROOT+key);return ob?ob.json():fallback};
const putR2=(env,key,value)=>env.R2.put(ROOT+key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
const norm=(x,g)=>g.kind==='double'?`${x.minute_epoch}|${x.number}`:`${x.minute_epoch}|${Number(x.multiplier).toFixed(4)}`;
const safeLimit=(value,def=90,max=200)=>Math.min(max,Math.max(1,Number(value)||def));
const currentBR=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>Number(parts.find(x=>x.type===k).value);
 return [get('year'),get('month'),get('day')];
};
function decodeEntities(s){
 return s.replace(/&(?:nbsp|amp|quot|lt|gt|#\d+|#x[0-9a-f]+);/gi,v=>{
  const m={'&nbsp;':' ','&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>'};
  if(v.toLowerCase() in m)return m[v.toLowerCase()];
  if(v.startsWith('&#')){const cp=v[2]?.toLowerCase()==='x'?parseInt(v.slice(3,-1),16):parseInt(v.slice(2,-1),10);return Number.isFinite(cp)&&cp<=0x10ffff?String.fromCodePoint(cp):v}
  return v;
 }).replace(/\u00a0/g,' ').trim();
}
function tokensFrom(html){
 html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 html=html.replace(/<img\b[^>]*\balt\s*=\s*["'](?:branco|white)["'][^>]*>/gi,'>BRANCO<');
 return [...html.matchAll(/>([^<>]+)</g)].map(x=>decodeEntities(x[1])).filter(Boolean);
}
// NEXO V6.4: extrair pares multiplicador/horario; nao depender de cabecalho HTML.
// Exige ao menos 8 pares consecutivos, em ordem cronologica, antes de aceitar uma janela.
function multiplierWindowV64(html,now=Date.now()){
 const tokens=tokensFrom(html);
 const valueRE=/^(\d+(?:[.,]\d{1,4})?)\s*x$/i;
 const timeRE=/^(?:[01]?\d|2[0-3]):[0-5]\d$/;
 const parseV=x=>{
  const m=valueRE.exec(x);
  if(!m)return null;
  const n=Number(m[1].replace(',','.'));
  return n>=1&&n<=1e7&&Number.isFinite(n)?n:null;
 };
 let best=[];
 for(let start=0;start<tokens.length-16;start++){
  if(parseV(tokens[start])===null||!timeRE.test(tokens[start+1]||''))continue;
  const run=[];
  let lastMinute=Infinity;
  for(let i=start;i+1<tokens.length&&run.length<200;i+=2){
   const value=parseV(tokens[i]),clock=tokens[i+1];
   if(value===null||!timeRE.test(clock||''))break;
   const [hh,mm]=clock.split(':').map(Number);
   const minute=hh*60+mm;
   // Novas primeiro; na virada de dia: 00:01 -> 23:59.
   if(run.length&&minute>lastMinute+1&&!(lastMinute<120&&minute>1320))break;
   run.push({multiplier:value,clock});lastMinute=minute;
  }
  if(run.length>best.length)best=run;
  if(best.length===200)break;
 }
 if(best.length<8)throw Error('FORMATO_NAO_RECONHECIDO: nao ha 8 pares consecutivos de multiplicador e horario');
 const [y,m,d]=currentBR();let daysBack=0,last=Infinity;
 return best.map(row=>{
  const [hh,mm]=row.clock.split(':').map(Number);
  let epoch=Math.floor(Date.UTC(y,m-1,d,hh+3,mm)/1000)-daysBack*86400;
  if(epoch>last||epoch>Math.floor(now/1000)+120){daysBack++;epoch-=86400;}
  last=epoch;
  return {minute_epoch:epoch,multiplier:row.multiplier};
 });
}

function sourceRows(html,game,now=Date.now()){
 if(game.kind==='multiplier')return multiplierWindowV64(html,now);
 const tokens=tokensFrom(html);
 let pos=-1;
 if(game.kind==='double'){
  // Layout atual das paginas publicas: 'Conectando - 200 Resultados'.
  // Manter o marcador legado como primeira opcao para compatibilidade.
  pos=tokens.findIndex(x=>/^(?:sem destaque|no focus)$/i.test(x));
  if(pos<0)pos=tokens.findIndex(x=>/\b(?:conectando|connecting|carregando|loading)\b.*\b(?:resultados|results)\b/i.test(x));
 }
 else if(game.kind==='multiplier')pos=tokens.findIndex(x=>/\b(?:conectando|connecting|carregando|loading)\b.*\b(?:resultados|results)\b/i.test(x));
 if(pos<0)throw Error('FORMATO_NAO_RECONHECIDO: marcador dos resultados ausente');
 const validTime=/^(?:[01]?\d|2[0-3]):[0-5]\d$/;
 const result=[];
 for(let i=pos+1;i<Math.min(tokens.length-1,pos+490);i++){
  const value=tokens[i],clock=tokens[i+1];let number=null,multiplier=null;
  if(game.kind==='double'){
   number=/^(?:branco|white)$/i.test(value)?0:/^(?:\d|1[0-4])$/.test(value)?Number(value):null;
  }else{
   const m=/^(\d+(?:[.,]\d{1,4})?)\s*x$/i.exec(value);
   multiplier=m?Number(m[1].replace(',','.')):null;
   if(multiplier!==null&&!(multiplier>=1&&multiplier<=1e7))multiplier=null;
  }
  if((number===null&&multiplier===null)||!validTime.test(clock)){
   if(result.length>=8)break;
   if(i>pos+8)throw Error('FORMATO_NAO_RECONHECIDO: itens fora da janela');
   continue;
  }
  result.push({clock,...(number!==null?{number,color:number===0?'white':number<8?'red':'black'}:{multiplier})});
  i++;
  if(result.length>=200)break;
 }
 if(result.length<8)throw Error('JANELA_INSUFICIENTE: '+result.length+' rodadas');
 // Brasília presently uses UTC-3 without DST; use this only for recent public snapshots.
 // Never fabricate seconds or claim source precision beyond minutes.
 const [y,m,d]=currentBR();let offset=0,last=Infinity;
 return result.map(row=>{
  const [hh,mm]=row.clock.split(':').map(Number);
  let epoch=Math.floor(Date.UTC(y,m-1,d,hh+3,mm)/1000)-offset*86400;
  if(epoch>last||epoch>Math.floor(now/1000)+120){offset++;epoch-=86400;}
  last=epoch;
  const {clock,...rest}=row;
  return {minute_epoch:epoch,...rest};
 });
}
function firstOverlap(oldRows,newRows,game){
 // Accept at least 4 consecutive exact matches; handles duplicate values in one minute.
 let candidate=null;
 for(let n=0;n<newRows.length;n++){
  for(let o=0;o<oldRows.length;o++){
   if(norm(newRows[n],game)!==norm(oldRows[o],game))continue;
   let count=0;
   while(n+count<newRows.length&&o+count<oldRows.length&&norm(newRows[n+count],game)===norm(oldRows[o+count],game))count++;
   if(count>=4&&(!candidate||n<candidate.index||(n===candidate.index&&count>candidate.match)))candidate={index:n,oldIndex:o,match:count};
  }
 }
 return candidate;
}
async function persistSnapshot(env,game,parsed){
 const key='games/'+game.id+'/history.json';
 let prev=await getR2(env,key,{items:[],gaps:[],updated_at:0});
 if(!Array.isArray(prev.items))prev={items:[],gaps:[],updated_at:0};
 // Respect existing manually synchronized Blitz Crash data; no resets.
 if(!prev.items.length&&game.id==='blitz-crash'){
  const legacy=await env.R2.get('nexo-crash-v2/history.json');
  if(legacy){const existing=await legacy.json();if(Array.isArray(existing.items)&&existing.items.length){prev={items:existing.items.map(x=>({...x})),gaps:existing.gaps||[],updated_at:existing.updated_at||0};}}
 }
 const old=prev.items;
 let added=[],gap=null;
 if(!old.length){added=parsed;}
 else{
  const match=firstOverlap(old,parsed,game);
  if(match){added=parsed.slice(0,match.index);}
  else{
   const oldestNew=parsed.at(-1).minute_epoch;
   const latestOld=Math.max(...old.slice(0,300).map(x=>Number(x.minute_epoch)||0));
   const latestNew=parsed[0].minute_epoch;
   const now=Math.floor(Date.now()/1000);
   if(oldestNew>latestOld&&latestNew>=now-600&&latestNew<=now+120){
    gap={after_seq:Math.max(0,...old.map(x=>Number(x.seq)||0)),previous_latest_minute:latestOld,resumed_oldest_minute:oldestNew,observed_epoch:now};
    added=parsed;
   }else throw Error('SEM_SOBREPOSICAO: dados antigos preservados; verificar lacuna');
  }
 }
 if(!added.length)return {added:0,total:old.length,latest:old[0]?.minute_epoch||null};
 const highest=Math.max(0,...old.map(x=>Number(x.seq)||0));
 // parsed are new-to-old, store ascending seq. Never claim official sequence IDs.
 const newer=added.map((x,i)=>({...x,seq:highest+added.length-i,first_seen:Math.floor(Date.now()/1000)}));
 const joined=[...newer,...old].slice(0,MAX_HISTORY);
 const gaps=[...(prev.gaps||[]),...(gap?[gap]:[])].slice(-50);
 await putR2(env,key,{game_id:game.id,items:joined,updated_at:Date.now(),gaps,precision:'minute',source:'historicosblaze.com',observed_not_official_seq:true});
 return {added:added.length,total:joined.length,latest:joined[0].minute_epoch,gap:!!gap};
}
async function collectGame(env,game){
 if(!game.eligible||!game.source_url)throw Error('SEM_ADAPTADOR: jogo catalogado, coleta ainda não homologada');
 const u=new URL(game.source_url);
 if(u.protocol!=='https:'||u.hostname!=='historicosblaze.com'||!u.pathname.startsWith('/results/'))throw Error('Fonte nao autorizada');
 const res=await fetch(u.href,{headers:{'Accept':'text/html','Cache-Control':'no-cache','User-Agent':'NEXO-Historicos-Research/5.0'},redirect:'follow',signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('FONTE_HTTP_'+res.status);
 if(!(res.headers.get('content-type')||'').includes('text/html'))throw Error('RESPOSTA_NAO_HTML');
 const body=await res.text();if(body.length>1800000)throw Error('FONTE_GRANDE_DEMAIS');
 const parsed=sourceRows(body,game);
 if(Date.now()/1000-parsed[0].minute_epoch>900)throw Error('FONTE_DESATUALIZADA');
 return persistSnapshot(env,game,parsed);
}
const statusEmpty=g=>({id:g.id,status:g.eligible?'aguardando_validacao':'sem_adaptador',last_attempt:null,last_success:null,last_epoch:null,added:0,last_error:null});
function publicGames(statuses={}){return GAMES.map(g=>({id:g.id,platform:g.platform,game:g.game,kind:g.kind,eligible:g.eligible,precision:g.precision,source:g.source,status:statuses[g.id]?.status||statusEmpty(g).status,last_success:statuses[g.id]?.last_success||null}));}
export async function cloudPublic(req,env,url){
 if(!url.pathname.startsWith('/api/cloud/'))return null;
 if(req.method!=='GET')return json({ok:false,error:'Metodo nao permitido'},405);
 if(!env.R2)return json({ok:false,error:'R2 indisponivel'},503);
 const overview=await getR2(env,'overview.json',{running:false,statuses:{},updated_at:0});
 if(url.pathname==='/api/cloud/catalog')return json({ok:true,running:!!overview.running,platforms:16,count:GAMES.length,games:publicGames(overview.statuses)});
 if(url.pathname==='/api/cloud/status')return json({ok:true,engine:'durable-object',running:!!overview.running,updated_at:overview.updated_at,progress:overview.progress||null,failed:Object.values(overview.statuses||{}).filter(x=>x.status==='erro'||x.status==='bloqueado').length});
 if(url.pathname==='/api/cloud/history'){
  const id=url.searchParams.get('game_id')||'';
  const game=GAME_BY_ID.get(id);if(!game)return json({ok:false,error:'Jogo nao cadastrado'},404);
  const limit=safeLimit(url.searchParams.get('limit'));
  let saved=await getR2(env,'games/'+game.id+'/history.json',null);
  if(!saved&&id==='blitz-crash'){const l=await env.R2.get('nexo-crash-v2/history.json');if(l)saved=await l.json();}
  if(!saved&&id==='blitz-double'){const l=await env.R2.get('nexo-v1/games/blitz-double/latest.json');if(l)saved=await l.json();}
  return json({ok:true,game_id:id,kind:game.kind,items:(saved?.items||[]).slice(0,limit),updated_at:saved?.updated_at||null,precision:'minute',gaps:saved?.gaps||[],status:overview.statuses?.[id]||statusEmpty(game),source:game.source});
 }
 return json({ok:false,error:'Rota desconhecida'},404);
}
const stub=env=>env.NEXO_CLOUD_COLLECTOR?.get(env.NEXO_CLOUD_COLLECTOR.idFromName('nexo-cloud-v5-singleton'));
export async function cloudAdmin(req,env,url){
 if(!url.pathname.startsWith('/api/adm/cloud/'))return null;
 if(!stub(env))return json({ok:false,error:'Binding NEXO_CLOUD_COLLECTOR ausente'},503);
 const action=url.pathname.slice('/api/adm/cloud/'.length);
 if(!['status','start','pause','run-once'].includes(action))return json({ok:false,error:'Acao desconhecida'},404);
 if(action==='status'&&req.method!=='GET')return json({ok:false,error:'Metodo invalido'},405);
 if(action!=='status'&&req.method!=='POST')return json({ok:false,error:'Metodo invalido'},405);
 if(action!=='status'&&req.headers.get('Origin')&&req.headers.get('Origin')!==url.origin)return json({ok:false,error:'Origem nao autorizada'},403);
 let body={};if(req.method==='POST')try{body=await req.json()}catch{return json({ok:false,error:'JSON invalido'},400)}
 if(action==='run-once'&&!GAME_BY_ID.has(body?.game_id))return json({ok:false,error:'Jogo invalido'},400);
 const response=await stub(env).fetch('https://nexo.internal/cloud/'+action,{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='POST'?JSON.stringify(body):undefined});
 return response;
}
export async function cloudHeartbeat(env){
 const s=stub(env);if(s)await s.fetch('https://nexo.internal/cloud/kick',{method:'POST'});
}
export class NexoCloudCollector {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async config(){return await this.ctx.storage.get('config')||{...DEFAULT};}
 async publish(config,states={}){
  await putR2(this.env,'overview.json',{running:!!config.running,updated_at:Date.now(),progress:{monitored:GAMES.filter(g=>g.eligible).length,catalog:GAMES.length},statuses:states});
 }
 async fetch(request){
  const u=new URL(request.url),path=u.pathname;
  let config=await this.config();
  if(path==='/cloud/status'){
   // Rota interna somente atraves do ADM autenticado.
   const statuses=await this.ctx.storage.get('statuses')||{};
   return json({ok:true,config,ready_count:GAMES.filter(g=>g.eligible).length,statuses});
  }
  if(path==='/cloud/kick'){
   if(config.running&&!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+1000);
   return json({ok:true,running:config.running});
  }
  if(path==='/cloud/start'){
   let data={};try{data=await request.json()}catch{}
   const tick=Math.max(15,Math.min(180,Number(data.tick_seconds)||15));
   config={...config,running:true,tickSeconds:tick,batch:Math.min(4,Math.max(1,Number(data.batch)||3)),updated_at:Date.now()};
   await this.ctx.storage.put('config',config);
   if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+1000);
   await this.publish(config,await this.ctx.storage.get('statuses')||{});
   return json({ok:true,running:true,warning:'Monitoramento experimental: fontes externas podem bloquear requisições; sinais Telegram não ativados'});
  }
  if(path==='/cloud/pause'){
   config={...config,running:false,updated_at:Date.now()};
   await this.ctx.storage.put('config',config);
   await this.ctx.storage.deleteAlarm();
   await this.publish(config,await this.ctx.storage.get('statuses')||{});
   return json({ok:true,running:false});
  }
  if(path==='/cloud/run-once'){
   const data=await request.json();const g=GAME_BY_ID.get(data.game_id);
   if(!g)return json({ok:false,error:'Jogo desconhecido'},400);
   const statuses=await this.ctx.storage.get('statuses')||{};
   const r=await this.runOne(g,statuses);await this.ctx.storage.put('statuses',statuses);await this.publish(config,statuses);
   return json({ok:true,succeeded:r.ok,game_id:g.id,status:statuses[g.id]});
  }
  return json({ok:false,error:'Rota interna invalida'},404);
 }
 async runOne(g,statuses){
  const now=Date.now();const prior=statuses[g.id]||statusEmpty(g);
  if(!g.eligible){statuses[g.id]={...prior,status:'sem_adaptador',last_attempt:now};return {ok:false};}
  try{
   const result=await collectGame(this.env,g);
   statuses[g.id]={...prior,status:'atualizado',last_attempt:now,last_success:Date.now(),last_epoch:result.latest,added:result.added,last_error:null,gap:!!result.gap};
   return {ok:true};
  }catch(error){
   const msg=textSafe(error?.message,100),blocked=/FONTE_HTTP_(?:403|429)|SEM_SOBREPOSICAO/.test(msg);
   statuses[g.id]={...prior,status:blocked?'bloqueado':'erro',last_attempt:now,added:0,last_error:msg};
   return {ok:false};
  }
 }
 async alarm(){
  const conf=await this.config();if(!conf.running)return;
  try{
   const states=await this.ctx.storage.get('statuses')||{};
   const now=Date.now();const due=GAMES.filter(g=>g.eligible).map(g=>{
    const s=states[g.id];const interval=(g.id==='blitz-crash'||g.id==='blitz-double')?30_000:300_000;
    const next=(s?.last_attempt||0)+interval;
    return {g,next};
   }).filter(x=>x.next<=now).sort((a,b)=>a.next-b.next);
   // Bounded concurrency and bandwidth: never hammer all sources simultaneously.
   for(const {g} of due.slice(0,conf.batch||3))await this.runOne(g,states);
   await this.ctx.storage.put('statuses',states);
   await this.publish(conf,states);
  }catch(e){console.error('NEXO Cloud collector alarm',textSafe(e?.message,120))}
  finally{
   if((await this.config()).running)await this.ctx.storage.setAlarm(Date.now()+Math.max(15,Number(conf.tickSeconds)||15)*1000);
  }
 }
}
export const cloudTest={sourceRows,firstOverlap,tokensFrom,publicGames,GAMES};
