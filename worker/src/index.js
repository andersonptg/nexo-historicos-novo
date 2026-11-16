import catalog from '../../catalog.json' with {type:'json'};
import {routeAdmin,processNewRounds,resetAfterCatchup,scheduledAdmin} from './adm.js';
import {processWhiteRounds,resetWhiteAfterCatchup,whiteHasActiveForecast,whiteShouldBlockLegacy,scheduledWhite} from './white.js';

// V2 preserva o prefixo EXCLUSIVO nexo-v1/. Nenhum objeto V30 e alterado.
const V17_WHITE_PAUSED=true; // Modulo Branco por Minuto suspenso sem apagar configuracoes.
const PREFIX='nexo-v1/games/';
const gameById=id=>catalog.games.find(x=>x.id===id&&x.enabled);
const out=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const now=()=>Math.floor(Date.now()/1000);
const dayOf=(stamp)=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp*1000));
 const v=k=>p.find(x=>x.type===k).value;
 return `${v('year')}-${v('month')}-${v('day')}`;
};
const base=id=>PREFIX+id+'/';
const jsonGet=async(bucket,key)=>{
 const obj=await bucket.get(key);if(!obj)return null;
 try{return await obj.json();}catch{return null;}
};
const jsonPut=async(bucket,key,value)=>bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
const validRecord=(r)=>r&&typeof r.id==='string'&&/^[a-f0-9]{32}$/.test(r.id)&&
 Number.isSafeInteger(r.minute_epoch)&&r.minute_epoch>1600000000&&r.minute_epoch<=now()+180&&
 Number.isInteger(r.number)&&r.number>=0&&r.number<=14&&
 (r.seq===undefined||(Number.isSafeInteger(r.seq)&&r.seq>0))&&
 r.color===(r.number===0?'white':r.number<=7?'red':'black');
const normalize=items=>{
 const ids=new Set();return items.filter(x=>validRecord(x)&&!ids.has(x.id)&&(ids.add(x.id),true))
   .map(x=>({id:x.id,minute_epoch:x.minute_epoch,number:x.number,color:x.color,...(x.seq?{seq:x.seq}:{})}));
};
function merge(old=[], incoming=[],limit=0){
 const map=new Map();
 for(const x of [...old,...incoming])if(validRecord(x))map.set(x.id,{id:x.id,minute_epoch:x.minute_epoch,number:x.number,color:x.color,...(x.seq?{seq:x.seq}:{})});
 const result=[...map.values()].sort((a,b)=>b.minute_epoch-a.minute_epoch||(b.seq||0)-(a.seq||0)||b.id.localeCompare(a.id));
 return limit>0?result.slice(0,limit):result;
}
function tokenOK(request,env){
 const key=env.NEXO_V1_INGEST_TOKEN;
 const value=request.headers.get('Authorization')||'';
 // A chave precisa ser exclusiva do projeto novo e nao aparece no cliente web.
 return typeof key==='string'&&key.length>=32&&value===`Bearer ${key}`;
}
// V11 - chamadas internas serializadas pelo Durable Object SQLite (plano Free compatível).
// A autenticação pública continua no Worker; o DO recebe somente requisições internas.
async function v11Ingest(request,env,trusted=false,queueSignalJob=null,queuedMaxSeq=0){
 if(!trusted&&!tokenOK(request,env))return out({error:'Credencial ausente ou invalida'},401);
 if(!env.R2)return out({error:'Binding R2 indisponivel'},503);
 let textBody;
 try{textBody=await request.text()}catch{return out({error:'Corpo indisponivel'},400)}
 if(textBody.length>130000)return out({error:'Lote acima do limite'},413);
 let payload;try{payload=JSON.parse(textBody)}catch{return out({error:'JSON invalido'},400)}
 const game=gameById(payload?.game_id),items=payload?.items;
 if(!game||game.kind!=='double')return out({error:'Jogo desconhecido ou nao suportado'},400);
 if(!Array.isArray(items)||items.length<1||items.length>200||items.some(x=>!validRecord(x)))return out({error:'Resultados invalidos (1 a 200)'},400);
 const rows=normalize(items),groups=new Map();
 for(const r of rows){const day=dayOf(r.minute_epoch);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(r)}
 if(groups.size>5)return out({error:'Lote atravessa mais de cinco dias'},400);
  // NEXO V21: as leituras do dia e do ultimo lote sao independentes.
  // Leitura e gravação paralelas reduzem as esperas de R2 sem reconhecer
  // nada antes que TODAS as operacoes terminem. O Durable Object continua
  // serializando os lotes e a fila de Telegram permanece inalterada.
  const b=base(game.id),dayGroups=[...groups.entries()],latestKey=b+'latest.json';
  const docs=await Promise.all([
   jsonGet(env.R2,latestKey),
   ...dayGroups.map(([day])=>jsonGet(env.R2,b+`days/${day}.json`))
  ]);
  const latest=merge(docs[0]?.items||[],rows,200),stamp=now();
  const writes=dayGroups.map(([day,adds],i)=>{
   const combined=merge(docs[i+1]?.items||[],adds);
   return jsonPut(env.R2,b+`days/${day}.json`,{game_id:game.id,day,items:combined,updated_at:stamp});
  });
  writes.push(jsonPut(env.R2,latestKey,{game_id:game.id,items:latest,updated_at:stamp}));
  writes.push(jsonPut(env.R2,b+'status.json',{game_id:game.id,last_ingest:stamp,last_heartbeat:stamp,last_result:latest[0]?.minute_epoch||null,received:rows.length,motor:'termux',source:game.source}));
  await Promise.all(writes);
 // Por seguranca, um lote antigo nao dispara sinais mesmo sem flag catchup.
 // V12: nunca transformar reconexao/atraso em uma enxurrada de sinais.
 // O horario da fonte tem precisao de MINUTO: aqui so validamos frescor,
 // nao fingimos saber quando o giro fisico terminou.
 const sourceAge=now()-Math.max(...rows.map(r=>r.minute_epoch));
 const ownerCursor=await jsonGet(env.R2,'nexo-v3/runtime/game-owner/'+game.id+'.json');
 const ingestBaseSeq=Math.max(Number(ownerCursor?.lastSeq||0),Number(queuedMaxSeq||0));
  const observed=rows.filter(r=>Number.isInteger(r.seq)&&r.seq>ingestBaseSeq);
 const seqGap=ingestBaseSeq>0&&observed.length&&Math.max(...observed.map(r=>r.seq))-ingestBaseSeq>3;
 const surge=observed.length>3;
 const catchup=payload.catchup===true||sourceAge>150||surge||seqGap;
  if(queueSignalJob){
    try{
      // As pedras ja foram gravadas no R2. O job do Telegram sera duravel
      // no Durable Object antes de confirmar HTTP 200 ao Termux.
      await queueSignalJob(observed.length?{gameId:game.id,rows:observed,catchup}:null);
    }catch(e){
      console.error('NEXO V18.1: fila nao persistida:',String(e?.message||e).slice(0,140));
      return out({error:'Historico salvo, mas fila nao confirmada; repetir mesmo lote'},503);
    }
  }else{
 if(catchup){
  try{await resetAfterCatchup(env,game,rows)}catch(e){console.error('V12 catchup runtime:',String(e.message||e).slice(0,100));return out({error:'Historico salvo; falha ao redefinir estado de sinais'},503)}
   if(!V17_WHITE_PAUSED){try{await resetWhiteAfterCatchup(env,game,rows)}catch(e){console.warn('V13 branco: catchup falhou',String(e.message||e).slice(0,100))}}
 }else{
  try{
    if(!V17_WHITE_PAUSED&&await whiteShouldBlockLegacy(env))await resetAfterCatchup(env,game,rows);
    else await processNewRounds(env,game,rows);
   }catch(e){console.error('V12 rules:',String(e.message||e).slice(0,120));return out({error:'Historico salvo; falha ao processar regras'},503)}
   if(!V17_WHITE_PAUSED){try{await processWhiteRounds(env,game,rows)}catch(e){console.warn('V13 branco: processamento falhou',String(e.message||e).slice(0,130))}}
 }
   }
return out({ok:true,accepted:rows.length,game_id:game.id,catchup,age_seconds:sourceAge,skipped_signal_burst:surge||!!seqGap});

}
// NEXO V22: historico nunca expira, mas avisos nao podem virar sinais antigos.
// A idade mede a fila DO (nao os segundos oficiais da Brabet).
const V22_SIGNAL_TTL_MS=14000;
const v22IsStale=job=>!Number.isSafeInteger(job?.enqueuedAtMs)||job.enqueuedAtMs<=0||Date.now()-job.enqueuedAtMs>=V22_SIGNAL_TTL_MS;
// NEXO_V18_1_DURABLE_QUEUE: processar sinais DEPOIS do ACK R2, na ordem dos lotes.
// O job foi persistido no storage do Durable Object ANTES da resposta HTTP 200.
async function v18_1ProcessQueuedSignal(env,job){
 const game=gameById(job.gameId);
 if(!game||!Array.isArray(job.rows)||!job.rows.length)throw Error('Job de sinais invalido');
 const rows=job.rows,expired=v22IsStale(job);
 if(expired)console.warn('V22: job atrasado descartado para sinais; cursor sera recuperado',job.gameId,Math.max(...rows.map(r=>Number(r.seq)||0)));
 if(job.catchup||expired){
  await resetAfterCatchup(env,game,rows);
  if(!V17_WHITE_PAUSED)await resetWhiteAfterCatchup(env,game,rows);
 }else{
  if(!V17_WHITE_PAUSED&&await whiteShouldBlockLegacy(env))await resetAfterCatchup(env,game,rows);
  else await processNewRounds(env,game,rows,job.enqueuedAtMs+V22_SIGNAL_TTL_MS);
  if(!V17_WHITE_PAUSED)await processWhiteRounds(env,game,rows);
 }
}

export class NexoCoordinator {
 constructor(state,env){this.state=state;this.env=env;this.serial=Promise.resolve()}
  // Enfileiramento transacional: nao reconhecer uma pedra sem guardar o job.
  async v18_1Enqueue(job){
    const st=this.state.storage;
    if(job&&Array.isArray(job.rows)&&job.rows.length){
      await st.transaction(async tx=>{
        const seq=Math.max(...job.rows.map(r=>Number(r.seq)||0));
        const old=Number(await tx.get('nexo-v18-queued-max')||0);
        if(seq<=old)return;
        const next=Number(await tx.get('nexo-v18-next-job')||0)+1;
        await tx.put('nexo-v18-next-job',next);
        await tx.put('nexo-v18-queued-max',seq);
        await tx.put('nexo-v18-job/'+String(next).padStart(12,'0'),{...job,enqueuedAtMs:Date.now()});
      });
    }
    // Repetir o POST nao cria outro job; e se o agendamento anterior falhou,
    // faz nova tentativa de iniciar o processamento persistido.
    const pending=await st.list({prefix:'nexo-v18-job/',limit:1});
    if(pending.size)await st.setAlarm(Date.now()+250);
  }
  // A entrega pode levar varios segundos, mas nao bloqueia a gravacao da pedra.
  async alarm(){
    const st=this.state.storage;
    const jobs=await st.list({prefix:'nexo-v18-job/',limit:1});
    if(!jobs.size)return;
    const [key,job]=jobs.entries().next().value;
    const started=Date.now(),discarded=v22IsStale(job);
    try{
      await v18_1ProcessQueuedSignal(this.env,job);
      await st.delete(key);
    // Diagnostico agregado; nunca armazena token, IDs de chats ou textos.
    try{const prev=await st.get('nexo-v22-metrics')||{};
      await st.put('nexo-v22-metrics',{processed:Number(prev.processed||0)+1,expired:Number(prev.expired||0)+(discarded?1:0),lastDurationMs:Date.now()-started,lastQueueAgeMs:Number(job.enqueuedAtMs)>0?Math.max(0,started-job.enqueuedAtMs):null,lastAtMs:Date.now()});
    }catch(e){console.warn('V22 metricas:',String(e?.message||e).slice(0,80));}
      // Proximo lote apenas depois do atual; evita inversao de eventos.
      const pending=await st.list({prefix:'nexo-v18-job/',limit:1});
      if(pending.size)await st.setAlarm(Date.now()+250);
    }catch(e){
      console.error('NEXO V18.1 fila: tentativa pendente',String(e?.message||e).slice(0,150));
      await st.setAlarm(Date.now()+7000);
    }
  }
 fetch(request){
  const run=this.serial.then(async()=>{
   const path=new URL(request.url).pathname;
   if(path==='/v11/ingest'){
      const queued=Number(await this.state.storage.get('nexo-v18-queued-max')||0);
      return v11Ingest(request,this.env,true,job=>this.v18_1Enqueue(job),queued);
    }
   if(path==='/v11/queue-health'){
      const pending=await this.state.storage.list({prefix:'nexo-v18-job/',limit:100});
      const first=pending.values().next().value;
      const metrics=await this.state.storage.get('nexo-v22-metrics')||{};
      return out({ok:true,version:22,pending_jobs:pending.size,pending_capped:pending.size>=100,oldest_age_ms:first?.enqueuedAtMs?Math.max(0,Date.now()-first.enqueuedAtMs):null,processed:Number(metrics.processed||0),expired:Number(metrics.expired||0),last_duration_ms:metrics.lastDurationMs??null,last_queue_age_ms:metrics.lastQueueAgeMs??null,last_processed_at:metrics.lastAtMs??null});
    }
   if(path==='/v11/cron'){await Promise.allSettled(V17_WHITE_PAUSED?[scheduledAdmin(this.env)]:[scheduledAdmin(this.env),scheduledWhite(this.env)]);return out({ok:true});}
   return out({error:'Rota interna invalida'},404);
  });
  this.serial=run.catch(e=>{console.error('V11 Coordinator:',String(e.message||e).slice(0,120))});
  return run;
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);const path=url.pathname;
  try{
   const adminReply=await routeAdmin(request,env,url);if(adminReply)return adminReply;
   if(path==='/api/public/preferences'&&request.method==='GET'){
    const p=await env.R2?.get('nexo-v3/admin/settings.json');let prefs={};if(p){try{prefs=await p.json()}catch{}}
    return out({showNumbers:prefs.showNumbers!==false});
   }
   if(path==='/api/health')return out({ok:true,version:'2.0.0',storage:!!env.R2,motor:'termux'});
   if(path==='/api/catalog')return out({games:catalog.games.map(({id,platform,game,kind,source,enabled,precision})=>({id,platform,game,kind,source,enabled,precision}))});
    if(path==='/api/ingest'&&request.method==='POST'){
     if(!tokenOK(request,env))return out({error:'Credencial ausente ou invalida'},401);
     if(env.NEXO_COORDINATOR){
      const id=env.NEXO_COORDINATOR.idFromName('nexo-brabet-double-v11');
      const stub=env.NEXO_COORDINATOR.get(id);
      return stub.fetch('https://nexo.internal/v11/ingest',{method:'POST',body:await request.text()});
     }
     // Fallback para testes unitarios e previas; no deploy V11 o binding e obrigatorio.
     return v11Ingest(request,env,true);
    }
   if(path==='/api/heartbeat'&&request.method==='POST'){
     if(!tokenOK(request,env))return out({error:'Nao autorizado'},401);
     if(!env.R2)return out({error:'R2 indisponivel'},503);
     let body;try{body=await request.json()}catch{return out({error:'JSON invalido'},400)}
     const game=gameById(body?.game_id);
     if(!game)return out({error:'Jogo invalido'},400);
     const key=base(game.id)+'status.json';
     const old=await jsonGet(env.R2,key)||{};
     await jsonPut(env.R2,key,{...old,game_id:game.id,last_heartbeat:now(),motor:'termux',source:game.source});
     return out({ok:true});
   }
   if(path==='/api/days'&&request.method==='GET'){
     if(!env.R2)return out({error:'R2 nao configurado'},503);
     const id=url.searchParams.get('game_id')||'brabet-double';
     if(!gameById(id))return out({error:'Jogo nao cadastrado'},404);
     const prefix=base(id)+'days/';
     const cursor=url.searchParams.get('cursor')||undefined;
     if(cursor&&cursor.length>2000)return out({error:'Cursor invalido'},400);
     const page=await env.R2.list({prefix,limit:500,...(cursor?{cursor}:{})});
     const days=page.objects.map(x=>x.key.slice(prefix.length)).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).map(x=>x.slice(0,10)).sort().reverse();
     return out({game_id:id,days,cursor:page.truncated?page.cursor:null,timezone:'America/Sao_Paulo'});
   }
   if(path==='/api/status'){
     if(!env.R2)return out({error:'R2 nao configurado'},503);
     const games=await Promise.all(catalog.games.filter(x=>x.enabled).map(async g=>({
        id:g.id,platform:g.platform,game:g.game,
        status:await jsonGet(env.R2,base(g.id)+'status.json')
     })));
     return out({games,checked_at:now()});
   }
   if(path==='/api/history'){
     if(!env.R2)return out({error:'R2 nao configurado'},503);
     const id=url.searchParams.get('game_id')||'brabet-double';
     if(!gameById(id))return out({error:'Jogo nao cadastrado'},404);
     const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||200));
     const offset=Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0));
     const date=url.searchParams.get('day');
     if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return out({error:'Data invalida'},400);
     const key=date?base(id)+`days/${date}.json`:base(id)+'latest.json';
     const data=await jsonGet(env.R2,key);
     return out({game_id:id,day:date||null,items:(data?.items||[]).slice(offset,offset+limit),total:(data?.items||[]).length,offset,has_more:offset+limit<(data?.items||[]).length,updated_at:data?.updated_at||null,source_precision:'minute'});
   }
   if(path.startsWith('/api/'))return out({error:'Rota nao encontrada'},404);
   if(env.ASSETS)return env.ASSETS.fetch(request);
   return new Response('Assets nao configurados',{status:503});
  }catch(err){console.error('NEXO V1 erro:',String(err?.message||err).slice(0,150));return out({error:'Erro interno; consulte logs do Worker'},500)}
 },
 async scheduled(event,env,ctx){
   if(env.NEXO_COORDINATOR){const id=env.NEXO_COORDINATOR.idFromName('nexo-brabet-double-v11');ctx.waitUntil(env.NEXO_COORDINATOR.get(id).fetch('https://nexo.internal/v11/cron',{method:'POST'}));}
   else ctx.waitUntil(Promise.allSettled(V17_WHITE_PAUSED?[scheduledAdmin(env)]:[scheduledAdmin(env),scheduledWhite(env)]));
  }
};
