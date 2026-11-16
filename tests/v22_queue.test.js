import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NexoCoordinator} from '../worker/src/index.js';
import {processNewRounds,scheduledAdmin} from '../worker/src/adm.js';

function harness(){
  const mem=new Map(),store=new Map(), alarms=[];
  const R2={
    async get(k){return mem.has(k)?{json:async()=>structuredClone(JSON.parse(mem.get(k)))}:null},
    async put(k,v){mem.set(k,String(v))},
    async delete(k){mem.delete(k)},
    async list({prefix,limit=100}){return {objects:[...mem.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false}}
  };
  const storage={
    async get(k){return structuredClone(store.get(k))},
    async put(k,v){store.set(k,structuredClone(v))},
    async delete(k){store.delete(k)},
    async list({prefix,limit=100}){return new Map([...store.entries()].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))},
    async transaction(fn){return fn(this)},
    async setAlarm(at){alarms.push(at)}
  };
  const env={R2};const server=new NexoCoordinator({storage},env);
  const minute=Math.floor(Date.now()/60000)*60;
  const row=(seq,number,color)=>({id:seq.toString(16).padStart(32,'0'),seq,number,color,minute_epoch:minute});
  const ingest=async (...rows)=>server.fetch(new Request('https://nexo.internal/v11/ingest',{method:'POST',body:JSON.stringify({game_id:'brabet-double',items:rows})}));
  const put=(k,v)=>mem.set(k,JSON.stringify(v));
  return {env,server,store,mem,row,ingest,alarms,put,storage};
}

test('V22: job e historico gravados antes do ACK, com timestamp de fila confiavel',async()=>{
  const h=harness();const resp=await h.ingest(h.row(1,4,'red'));
  assert.equal(resp.status,200);
  const job=[...h.store.values()].find(x=>x?.gameId==='brabet-double');
  assert.ok(job&&Number.isSafeInteger(job.enqueuedAtMs));
  assert.ok(Date.now()-job.enqueuedAtMs<2000);
  assert.equal(JSON.parse(h.mem.get('nexo-v1/games/brabet-double/latest.json')).items[0].number,4);
  assert.equal(h.alarms.length,1);
});

test('V22: job vencido nao dispara sinais, avanca cursor e remove lote',async()=>{
  const h=harness(),r=h.row(8,9,'black');
  assert.equal((await h.ingest(r)).status,200);
  const jobKey=[...h.store.keys()].find(k=>k.startsWith('nexo-v18-job/'));
  const old=h.store.get(jobKey);old.enqueuedAtMs=Date.now()-40000;
  h.store.set(jobKey,old);
  await h.server.alarm();
  assert.equal([...h.store.keys()].filter(k=>k.startsWith('nexo-v18-job/')).length,0);
  const owner=JSON.parse(h.mem.get('nexo-v3/runtime/game-owner/brabet-double.json'));
  assert.equal(owner.lastSeq,8);
  assert.equal(owner.reason,'catchup');
  assert.equal(JSON.parse(h.mem.get('nexo-v1/games/brabet-double/latest.json')).items[0].number,9);
  const q=await h.server.fetch(new Request('https://nexo.internal/v11/queue-health'));
  assert.equal(q.status,200);const status=await q.json();
  assert.equal(status.pending_jobs,0);assert.equal(status.expired,1);assert.equal(status.processed,1);
});

test('V22: fila fresca preserva eventos e nao cria job duplicado na repeticao',async()=>{
  const h=harness(),r=h.row(1,3,'red');
  assert.equal((await h.ingest(r)).status,200);
  assert.equal((await h.ingest(r)).status,200);
  assert.equal([...h.store.keys()].filter(k=>k.startsWith('nexo-v18-job/')).length,1);
  await h.server.alarm();
  const status=await (await h.server.fetch(new Request('https://nexo.internal/v11/queue-health'))).json();
  assert.equal(status.pending_jobs,0);assert.equal(status.expired,0);assert.equal(status.processed,1);
});

test('V22: Gale atrasado pode atualizar placar sem enviar evento Telegram antigo',async()=>{
  const h=harness();const sid='a'.repeat(32);
  h.put('nexo-v3/admin/strategies.json',[{id:sid,name:'Teste',enabled:true,archived:false,gameId:'brabet-double',target:'red',pattern:['black'],maxGale:2,jokerWhite:false,messages:{},media:{}}]);
  h.put('nexo-v3/admin/settings.json',{botEnabled:false});
  h.put('nexo-v3/runtime/'+sid+'.json',{lastSeq:0,recent:[],active:null});
  await processNewRounds(h.env,{id:'brabet-double'},[h.row(1,9,'black')],Date.now()-1);
  const score=JSON.parse(h.mem.get('nexo-v3/scores/'+sid+'.json'));
  assert.equal(score.entries,1);
  assert.equal([...h.mem.keys()].filter(k=>k.startsWith('nexo-v3/events/')).length,0);
});

test('V22: integracao V21, botoes coletivos, diagnostico protegido e timeout por etapa',()=>{
  const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const worker=get('worker/src/index.js'),admin=get('worker/src/adm.js'),rules=get('worker/public/adm-v17.js'),html=get('worker/public/adm.html');
  assert.match(worker,/const docs=await Promise\.all\(/);
  assert.match(worker,/V22_SIGNAL_TTL_MS=14000/);
  assert.match(worker,/v22IsStale\(job\)/);
  assert.match(admin,/strategies\/toggle-batch/);
  assert.match(admin,/v22ExpiredEvent\(evt\)/);
  assert.match(admin,/queue-health/);
  assert.match(rules,/v21-activate-all/);
  assert.match(rules,/v21-disable-all/);
  assert.match(html,/nexo-v22-admin\.js\?v=22\.0\.0/);
  assert.match(get('worker/public/nexo-v22-admin.js'),/credentials:'same-origin'/);
});


test('V22: cron remove pendencia antiga sem reenviar Gale, RED ou sticker',async()=>{
  const h=harness(),sid='a'.repeat(32),eid=sid+'_'+'f'.repeat(32)+'_gale2',gid='-1001234567890';
  h.env.NEXO_TELEGRAM_BOT_TOKEN='123456:xxxxxxYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
  h.put('nexo-v3/admin/settings.json',{botEnabled:true,resetMidnight:false});
  h.put('nexo-v3/admin/strategies.json',[{id:sid,enabled:true,archived:false,gameId:'brabet-double'}]);
  const uid=eid+'_m1001234567890',key='nexo-v3/outbox/pending/'+uid+'.json';
  h.put(key,{id:uid,groupId:gid,evt:{id:eid,type:'gale2',strategyId:sid,at:Math.floor(Date.now()/1000)-180},status:'pending',attempts:0,updatedAt:Math.floor(Date.now()/1000)-120});
  h.put('nexo-v3/outbox/chat-block/m1001234567890.json',{eventId:eid,chatId:gid,stage:'cron-pending'});
  await scheduledAdmin(h.env);
  assert.equal(h.mem.has(key),false);
  assert.equal(h.mem.has('nexo-v3/outbox/chat-block/m1001234567890.json'),false);
  assert.ok(h.mem.has('nexo-v3/outbox/cancelled/'+uid+'.json'));
});
