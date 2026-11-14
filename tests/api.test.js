import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
const mem=new Map();
const bucket={get:async key=>mem.has(key)?{json:async()=>JSON.parse(mem.get(key))}:null,put:async(key,body)=>{mem.set(key,body);return {}},list:async({prefix})=>({objects:[...mem.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};
const secret='a'.repeat(48);
const env={R2:bucket,NEXO_V1_INGEST_TOKEN:secret,ASSETS:{fetch:async()=>new Response('HTML')}};
const t=Math.floor(Date.now()/1000)-60;
const record={id:'b'.repeat(32),minute_epoch:t,number:0,color:'white'};
const req=(url,options)=>new Request('https://nexo-historicos-novo.workers.dev'+url,options);
test('health e catalogo visiveis sem token',async()=>{
 const r=await worker.fetch(req('/api/health'),env);assert.equal(r.status,200);assert.equal((await r.json()).motor,'termux');
 const c=await worker.fetch(req('/api/catalog'),env);assert.equal((await c.json()).games[0].id,'brabet-double');
});
test('nunca aceita ingestao anonima',async()=>{
 const r=await worker.fetch(req('/api/ingest',{method:'POST',body:JSON.stringify({game_id:'brabet-double',items:[record]})}),env);
 assert.equal(r.status,401);
});
test('ingestao idempotente no R2 e historia recuperavel',async()=>{
 for(let i=0;i<2;i++){
 const r=await worker.fetch(req('/api/ingest',{method:'POST',headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({game_id:'brabet-double',items:[record]})}),env);
 assert.equal(r.status,200);assert.equal((await r.json()).accepted,1);
 }
 const h=await worker.fetch(req('/api/history?game_id=brabet-double'),env);
 const data=await h.json();assert.equal(data.items.length,1);assert.equal(data.items[0].number,0);
 assert.equal([...mem.keys()].filter(x=>x.startsWith('nexo-v1/games/')).length,3);
});
test('rejeita numero/cor adulterados e jogos nao cadastrados',async()=>{
 const invalid=await worker.fetch(req('/api/ingest',{method:'POST',headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({game_id:'brabet-double',items:[{...record,color:'red'}]})}),env);
 assert.equal(invalid.status,400);
 const wrong=await worker.fetch(req('/api/ingest',{method:'POST',headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({game_id:'desconhecido',items:[record]})}),env);
 assert.equal(wrong.status,400);
});

test('V2 datas arquivadas automaticamente e endpoint de status autenticado',async()=>{
 const special={id:'c'.repeat(32),minute_epoch:t-86400,number:3,color:'red',seq:4};
 const r=await worker.fetch(req('/api/ingest',{method:'POST',headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({game_id:'brabet-double',items:[special]})}),env);
 assert.equal(r.status,200);
 const todayR=await worker.fetch(req('/api/history?game_id=brabet-double&day='+new Date((t-86400-3*3600)*1000).toISOString().slice(0,10)),env);
 assert.equal(todayR.status,200);
 const unauth=await worker.fetch(req('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game_id:'brabet-double'})}),env);
 assert.equal(unauth.status,401);
 const hb=await worker.fetch(req('/api/heartbeat',{method:'POST',headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({game_id:'brabet-double'})}),env);
 assert.equal(hb.status,200);assert.equal((await hb.json()).ok,true);
});

test('V2 lista arquivos por dia no R2',async()=>{
 const r=await worker.fetch(req('/api/days?game_id=brabet-double'),env);
 assert.equal(r.status,200);
 const d=await r.json();assert.ok(d.days.length>=1);
 assert.ok(d.days.every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)));
});
