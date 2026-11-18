import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const BASE='https://nexo.test';
function harness(mode='blitz-double'){
 const mem=new Map();
 const R2={
  get:async key=>mem.has(key)?{json:async()=>JSON.parse(mem.get(key))}:null,
  put:async(k,v)=>{mem.set(k,typeof v==='string'?v:JSON.stringify(v))},
  delete:async k=>mem.delete(k),
  list:async({prefix})=>({objects:[...mem.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})
 };
 const env={R2,NEXO_V1_INGEST_TOKEN:'i'.repeat(48),NEXO_ADM_PASSWORD:'p'.repeat(48)};
 if(mode)env.NEXO_ACTIVE_GAME=mode;
 const req=(path,method='GET',body=null,headers={})=>worker.fetch(new Request(BASE+path,{
  method,headers:{Origin:BASE,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})
 }),env);
 return {env,req,mem};
}
const record=(n=4)=>({id:'a'.repeat(32),number:n,color:n===0?'white':n<=7?'red':'black',minute_epoch:Math.floor(Date.now()/60000)*60,seq:1});

test('BLITZ V2: somente Blitz visivel; Brabet recebe 400 no modo Blitz',async()=>{
 const h=harness();
 const c=await(await h.req('/api/catalog')).json();
 assert.deepEqual(c.games.map(g=>g.id),['blitz-double']);
 const forbidden=await h.req('/api/ingest','POST',{game_id:'brabet-double',items:[record()]},{Authorization:'Bearer '+h.env.NEXO_V1_INGEST_TOKEN});
 assert.equal(forbidden.status,400);
 const allowed=await h.req('/api/ingest','POST',{game_id:'blitz-double',items:[record()],catchup:true},{Authorization:'Bearer '+h.env.NEXO_V1_INGEST_TOKEN});
 assert.equal(allowed.status,200,await allowed.clone().text());
 const hist=await(await h.req('/api/history')).json();
 assert.equal(hist.game_id,'blitz-double');
 assert.equal(hist.items[0].number,4);
 assert.equal(h.mem.has('nexo-v1/games/brabet-double/latest.json'),false);
});

test('BLITZ V2: regra criada no jogo Blitz, isolada da lista antiga',async()=>{
 const h=harness();
 h.mem.set('nexo-v3/admin/strategies.json',JSON.stringify([{id:'b'.repeat(32),name:'Brabet antiga',gameId:'brabet-double',enabled:true}]));
 let response=await h.req('/api/adm/login','POST',{password:h.env.NEXO_ADM_PASSWORD});
 assert.equal(response.status,200);
 const cookie=response.headers.get('Set-Cookie').split(';')[0];
 const headers={Cookie:cookie};
 response=await h.req('/api/adm/bootstrap','GET',null,headers);
 assert.equal(response.status,200);
 assert.equal((await response.json()).strategies.length,0);
 response=await h.req('/api/adm/strategies','POST',{name:'Blitz regra de teste',pattern:['red','black'],target:'black',maxGale:2,messages:{}},headers);
 assert.equal(response.status,200,await response.clone().text());
 const row=(await response.json()).strategy;
 assert.equal(row.gameId,'blitz-double');
 assert.equal(row.enabled,false);
 const blitz=JSON.parse(h.mem.get('nexo-v3/admin/strategies-blitz-v1.json'));
 assert.equal(blitz.length,1);
 assert.equal(blitz[0].gameId,'blitz-double');
 assert.equal(JSON.parse(h.mem.get('nexo-v3/admin/strategies.json')).length,1);
});

test('BLITZ V2: testes legados sem flag seguem Brabet',async()=>{
 const h=harness(null);
 const c=await(await h.req('/api/catalog')).json();
 assert.ok(c.games.some(g=>g.id==='brabet-double'));
 const ok=await h.req('/api/ingest','POST',{game_id:'brabet-double',items:[record()],catchup:true},{Authorization:'Bearer '+h.env.NEXO_V1_INGEST_TOKEN});
 assert.equal(ok.status,200,await ok.clone().text());
});
