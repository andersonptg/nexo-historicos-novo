import test from 'node:test';
import assert from 'node:assert/strict';
import {NexoCoordinator} from '../worker/src/index.js';

function harness(){
 const raw=new Map(),jobs=new Map();let alarmAt=null;
 const R2={
  async get(k){return raw.has(k)?{json:async()=>structuredClone(JSON.parse(raw.get(k)))}:null},
  async put(k,v){raw.set(k,String(v))},
  async delete(k){raw.delete(k)},
  async list({prefix,limit=100}){const keys=[...raw.keys()].filter(k=>k.startsWith(prefix)).sort().slice(0,limit);return {objects:keys.map(key=>({key})),truncated:false}}
 };
 const storage={
  async get(k){return structuredClone(jobs.get(k))},
  async put(k,v){jobs.set(k,structuredClone(v))},
  async delete(k){jobs.delete(k)},
  async list({prefix,limit=100}){return new Map([...jobs.entries()].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))},
  async transaction(fn){return fn(this)},
  async setAlarm(value){alarmAt=value}
 };
 const env={R2},state={storage};
 const server=new NexoCoordinator(state,env);
 const stamp=Math.floor(Date.now()/60000)*60;
 const row=(seq,number,color)=>({id:seq.toString(16).padStart(32,'0'),seq,number,color,minute_epoch:stamp});
 const ingest=async rows=>server.fetch(new Request('https://nexo.internal/v11/ingest',{method:'POST',body:JSON.stringify({game_id:'brabet-double',items:rows})}));
 return {raw,jobs,server,ingest,row,get alarmAt(){return alarmAt}};
}

test('V18.1: HTTP 200 depois do R2 + job duravel, antes de disparar sinais',async()=>{
 const h=harness();
 const r=await h.ingest([h.row(1,4,'red')]);
 assert.equal(r.status,200);
 assert.deepEqual(JSON.parse(h.raw.get('nexo-v1/games/brabet-double/latest.json')).items.map(x=>x.number),[4]);
 assert.equal((await h.server.state.storage.list({prefix:'nexo-v18-job/',limit:3})).size,1);
 assert.ok(h.alarmAt);
 await h.server.alarm();
 assert.equal((await h.server.state.storage.list({prefix:'nexo-v18-job/',limit:3})).size,0);
});

test('V18.1: repeticao do mesmo ID nao duplica job; chegada seguinte preserva ordem',async()=>{
 const h=harness();
 const one=h.row(1,4,'red'),two=h.row(2,9,'black');
 assert.equal((await h.ingest([one])).status,200);
 assert.equal((await h.ingest([one])).status,200);
 assert.equal((await h.server.state.storage.list({prefix:'nexo-v18-job/',limit:9})).size,1);
 assert.equal((await h.ingest([two])).status,200);
 let keys=[...(await h.server.state.storage.list({prefix:'nexo-v18-job/',limit:9})).keys()];
 assert.equal(keys.length,2);
 assert.deepEqual(keys,[...keys].sort());
 await h.server.alarm();await h.server.alarm();
 assert.equal((await h.server.state.storage.list({prefix:'nexo-v18-job/',limit:9})).size,0);
});

test('V18.1: fonte recente so entra se a pedra recebida for real e valida',async()=>{
 const h=harness();
 const bad=h.row(1,14,'red');
 const r=await h.ingest([bad]);assert.equal(r.status,400);
 assert.equal(h.raw.size,0);
});
