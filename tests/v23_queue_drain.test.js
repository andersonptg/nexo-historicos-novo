import test from 'node:test';
import assert from 'node:assert/strict';
import {NexoCoordinator} from '../worker/src/index.js';
import {resetAfterCatchup} from '../worker/src/adm.js';

function harness(){
  const raw=new Map(),kv=new Map(),alarms=[];
  const R2={
    async get(key){return raw.has(key)?{json:async()=>structuredClone(JSON.parse(raw.get(key)))}:null},
    async put(key,value){raw.set(key,typeof value==='string'?value:JSON.stringify(value))},
    async delete(key){raw.delete(key)},
    async list({prefix,limit=100}){return {objects:[...raw.keys()].filter(k=>k.startsWith(prefix)).sort().slice(0,limit).map(key=>({key})),truncated:false}}
  };
  const storage={
    async get(k){return structuredClone(kv.get(k))},
    async put(k,v){kv.set(k,structuredClone(v))},
    async delete(k){kv.delete(k)},
    async list({prefix,limit=100}){return new Map([...kv.entries()].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))},
    async transaction(fn){return fn(this)},
    async setAlarm(value){alarms.push(value)}
  };
  const env={R2},server=new NexoCoordinator({storage},env);
  const minute=Math.floor(Date.now()/60000)*60;
  const row=(seq,color='red',number=4)=>({id:seq.toString(16).padStart(32,'0'),seq,number,color,minute_epoch:minute});
  const ingest=async r=>server.fetch(new Request('https://nexo.internal/v11/ingest',{method:'POST',body:JSON.stringify({game_id:'brabet-double',items:[r]})}));
  const put=(key,v)=>raw.set(key,JSON.stringify(v));
  const pending=()=>[...kv.entries()].filter(([k])=>k.startsWith('nexo-v18-job/')).sort(([a],[b])=>a.localeCompare(b));
  const metrics=()=>kv.get('nexo-v22-metrics')||{};
  return {raw,kv,R2,storage,server,env,row,ingest,put,pending,metrics,alarms};
}

test('V23: limpa 120 lotes antigos em dois alarmes e recupera cursor uma vez por lote agrupado',async()=>{
  const h=harness(),sid='a'.repeat(32);
  h.put('nexo-v3/admin/strategies.json',[{id:sid,gameId:'brabet-double',enabled:true,archived:false}]);
  h.put('nexo-v3/runtime/'+sid+'.json',{lastSeq:0,recent:[h.row(1)],active:{step:1}});
  for(let seq=1;seq<=120;seq++){
    assert.equal((await h.ingest(h.row(seq))).status,200);
  }
  assert.equal(h.pending().length,120);
  for(const [key,job] of h.pending()){
    if(Number(key.split('/').pop())%2===0)delete job.enqueuedAtMs; // trabalho legado V18.1
    else job.enqueuedAtMs=Date.now()-120000; // trabalho V22 vencido
    h.kv.set(key,job);
  }
  await h.server.alarm();
  assert.equal(h.pending().length,20,'primeiro alarme descarrega no maximo 100');
  assert.equal(h.metrics().expired,100);
  assert.equal(h.metrics().lastBatchSize,100);
  let owner=JSON.parse(h.raw.get('nexo-v3/runtime/game-owner/brabet-double.json'));
  assert.equal(owner.lastSeq,100);
  await h.server.alarm();
  assert.equal(h.pending().length,0);
  assert.equal(h.metrics().expired,120);
  assert.equal(h.metrics().processed,120);
  assert.equal(h.metrics().coalesced,120);
  assert.equal(h.metrics().lastBatchSize,20);
  owner=JSON.parse(h.raw.get('nexo-v3/runtime/game-owner/brabet-double.json'));
  assert.equal(owner.lastSeq,120);
  assert.equal(JSON.parse(h.raw.get('nexo-v3/runtime/'+sid+'.json')).active,null);
  assert.equal(JSON.parse(h.raw.get('nexo-v1/games/brabet-double/latest.json')).items.length,120,'historico remoto preservado');
});

test('V23: descarta somente prefixo velho; lote novo fica na fila e depois e processado',async()=>{
  const h=harness();
  for(let seq=1;seq<=4;seq++)assert.equal((await h.ingest(h.row(seq))).status,200);
  for(const [k,job] of h.pending().slice(0,3)){
    job.enqueuedAtMs=Date.now()-40000;h.kv.set(k,job);
  }
  await h.server.alarm();
  assert.equal(h.pending().length,1);
  assert.equal(h.pending()[0][1].rows[0].seq,4);
  assert.equal(h.metrics().expired,3);
  await h.server.alarm();
  assert.equal(h.pending().length,0);
  assert.equal(h.metrics().processed,4);
  assert.equal(h.metrics().expired,3,'nao descartar rodada fresca');
});

test('V23: recuperacao de muitas estrategias usa paralelismo limitado, sem reabrir entradas',async()=>{
  const h=harness(),seq=9;
  const ids=Array.from({length:24},(_,i)=>i.toString(16).padStart(32,'0'));
  h.put('nexo-v3/admin/strategies.json',ids.map(id=>({id,gameId:'brabet-double',archived:false,enabled:true})));
  for(const id of ids)h.put('nexo-v3/runtime/'+id+'.json',{lastSeq:0,recent:[h.row(1)],active:{step:1}});
  const original=h.R2.get.bind(h.R2);let running=0,highest=0;
  h.R2.get=async key=>{
    if(key.startsWith('nexo-v3/runtime/')){
      running++;highest=Math.max(highest,running);
      await new Promise(resolve=>setTimeout(resolve,2));
      try{return await original(key)}finally{running--}
    }
    return original(key);
  };
  await resetAfterCatchup(h.env,{id:'brabet-double'},[h.row(seq)]);
  assert.ok(highest>1,'R2 nao pode ler dezenas de estrategias sequencialmente');
  assert.ok(highest<=8,'limite para evitar explosao de operacoes concorrentes');
  for(const id of ids){
    const state=JSON.parse(h.raw.get('nexo-v3/runtime/'+id+'.json'));
    assert.equal(state.lastSeq,seq);assert.equal(state.active,null);
  }
  assert.equal(JSON.parse(h.raw.get('nexo-v3/runtime/game-owner/brabet-double.json')).lastSeq,seq);
});
