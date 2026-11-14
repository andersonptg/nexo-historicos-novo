import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

function make() {
  const data=new Map();
  const R2={
    get:async key=>data.has(key)?{json:async()=>JSON.parse(data.get(key))}:null,
    put:async(key,value)=>{data.set(key,typeof value==='string'?value:JSON.stringify(value))},
    delete:async key=>data.delete(key),
    list:async({prefix})=>({objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})
  };
  const env={R2,NEXO_V1_INGEST_TOKEN:'i'.repeat(48),NEXO_ADM_PASSWORD:'a'.repeat(48)};
  const send=async(path,body,token=env.NEXO_V1_INGEST_TOKEN)=>worker.fetch(new Request('https://nexo.test'+path,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)
  }),env);
  return {data,env,send};
}
const now=()=>Math.floor(Date.now()/60_000)*60;
const record=(m,n,seq)=>({id:seq.toString(16).padStart(32,'0'),minute_epoch:now()-m*60,number:n,color:n===0?'white':n<8?'red':'black',seq});

test('V6: ingestao do lote mais novo primeiro conserva ultima rodada em latest e arquivo diario',async()=>{
  const {env,data,send}=make();
  const newest=[record(1,2,105),record(2,11,104)];
  const newestResponse=await send('/api/ingest',{game_id:'brabet-double',items:newest,catchup:true});
  assert.equal(newestResponse.status,200);
  const oldest=[record(11,7,92),record(10,8,93)];
  const olderResponse=await send('/api/ingest',{game_id:'brabet-double',items:oldest,catchup:true});
  assert.equal(olderResponse.status,200);
  const latest=JSON.parse(data.get('nexo-v1/games/brabet-double/latest.json'));
  assert.equal(latest.items[0].id,newest[0].id,'lote antigo nao pode substituir rodada mais recente');
  assert.equal(latest.items.length,4);
  const status=JSON.parse(data.get('nexo-v1/games/brabet-double/status.json'));
  assert.equal(status.last_result,newest[0].minute_epoch);
  assert.ok(![...data.keys()].some(x=>x.startsWith('nexo-v3/events/')));
});

test('V6: recuperacao exige chave valida',async()=>{
  const {send,data}=make();
  const response=await send('/api/ingest',{game_id:'brabet-double',items:[record(1,2,1)],catchup:true},'invalid');
  assert.equal(response.status,401);
  assert.equal(data.size,0);
});

test('V6: estrategia sem nome recebe nome sequencial e suporta 0 + quatro coringas azuis',async()=>{
  const {env,data}=make();
  const base='https://nexo.test';
  const login=await worker.fetch(new Request(base+'/api/adm/login',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:env.NEXO_ADM_PASSWORD})
  }),env);
  assert.equal(login.status,200);
  const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const post=(body)=>worker.fetch(new Request(base+'/api/adm/strategies',{
    method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},body:JSON.stringify(body)
  }),env);
  const entry={name:'',gameId:'brabet-double',pattern:['n:0','*','*','*','*'],target:'red',maxGale:2,messages:{},media:{}};
  const one=await post(entry);assert.equal(one.status,200,await one.text().catch(()=>''));
  // Criar novamente com a mesma entrada: o nome deve avançar automaticamente.
  const two=await post({...entry,target:'black',maxGale:0});assert.equal(two.status,200);
  const stored=JSON.parse(data.get('nexo-v3/admin/strategies.json'));
  assert.equal(stored.length,2);
  assert.deepEqual(stored.map(x=>x.name),['Estratégia 1','Estratégia 2']);
  assert.deepEqual(stored[0].pattern,entry.pattern);
  assert.equal(stored[0].enabled,false);
  assert.equal(stored[0].maxGale,2);
  assert.equal(stored[1].maxGale,0);
  assert.equal(stored[1].target,'black');
});
