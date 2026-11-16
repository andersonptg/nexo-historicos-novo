import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function harness(){
 const mem=new Map();
 const R2={
  async get(key){return mem.has(key)?{async json(){return structuredClone(JSON.parse(mem.get(key)))}}:null},
  async put(key,value){mem.set(key,typeof value==='string'?value:JSON.stringify(value));return {}},
  async delete(key){mem.delete(key);return {}},
  async list({prefix,limit=100,cursor}){const a=[...mem.keys()].filter(k=>k.startsWith(prefix)).sort(),start=Number(cursor)||0;return {objects:a.slice(start,start+limit).map(key=>({key})),truncated:start+limit<a.length,cursor:String(start+limit)}}
 };
 const env={R2,NEXO_ADM_PASSWORD:'z'.repeat(36),NEXO_V1_INGEST_TOKEN:'x'.repeat(44)};
 const put=(key,val)=>mem.set(key,JSON.stringify(val));
 const origin='https://nexo.test';
 const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env);
 const login=async()=>{
  const r=await call('/api/adm/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:env.NEXO_ADM_PASSWORD})});
  assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];
 };
 const post=(path,body,cookie)=>call('/api/adm/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 return {mem,env,put,call,login,post};
}

test('V21: só ativa regras pausadas, sem reiniciar as ativas; reenvio é idempotente',async()=>{
 const h=harness(),cookie=await h.login(),now=Math.floor(Date.now()/60_000)*60;
 const ids=['a','b','c'].map(x=>x.repeat(32));
 const strategies=ids.map((id,i)=>({id,name:'Teste '+i,gameId:'brabet-double',target:'black',pattern:['red'],enabled:i===0,archived:false,maxGale:2}));
 h.put('nexo-v3/admin/strategies.json',strategies);
 h.put('nexo-v1/games/brabet-double/latest.json',{items:[{id:'x',seq:88,minute_epoch:now,number:8,color:'black'}]});
 h.put('nexo-v3/runtime/'+ids[0]+'.json',{lastSeq:42,recent:[{seq:41}],active:{step:1}});
 const noauth=await h.post('strategies/toggle-batch',{ids,enabled:true,confirm:true},'');assert.equal(noauth.status,401);
 const r=await h.post('strategies/toggle-batch',{ids,enabled:true,confirm:true},cookie);assert.equal(r.status,200);
 assert.equal((await r.json()).changed,2);
 let all=JSON.parse(h.mem.get('nexo-v3/admin/strategies.json'));
 assert.ok(all.every(s=>s.enabled===true));
 assert.equal(JSON.parse(h.mem.get('nexo-v3/runtime/'+ids[0]+'.json')).lastSeq,42,'já ativa não reinicia');
 assert.equal(JSON.parse(h.mem.get('nexo-v3/runtime/'+ids[1]+'.json')).lastSeq,88,'nova regra não dispara dados antigos');
 const second=await h.post('strategies/toggle-batch',{ids,enabled:true,confirm:true},cookie);
 assert.equal((await second.json()).changed,0);
 const pause=await h.post('strategies/toggle-batch',{ids:[ids[1],ids[2]],enabled:false,confirm:true},cookie);
 assert.equal((await pause.json()).changed,2);
 all=JSON.parse(h.mem.get('nexo-v3/admin/strategies.json'));
 assert.deepEqual(all.map(s=>s.enabled),[true,false,false]);
});

test('V21: segurança do botão em lote rejeita IDs inválidos e confirmação ausente',async()=>{
 const h=harness(),cookie=await h.login();
 for(const body of [
  {ids:['a'.repeat(32)],enabled:true},
  {ids:['a'.repeat(32),'a'.repeat(32)],enabled:true,confirm:true},
  {ids:['foo'],enabled:true,confirm:true},
  {ids:[],enabled:false,confirm:true},
 ]){const r=await h.post('strategies/toggle-batch',body,cookie);assert.equal(r.status,400)}
});

test('V21: histórico e Telegram preservados; animação e alvo branco corrigidos',()=>{
 const main=src('worker/src/index.js'),admin=src('worker/src/adm.js'),builder=src('worker/public/adm-v6.js'),rules=src('worker/public/adm-v17.js'),css=src('worker/public/nexo-v21.css');
 assert.match(main,/const docs=await Promise\.all\(/);
 assert.match(main,/await Promise\.all\(writes\)/);
 assert.match(main,/queueSignalJob/);
 assert.match(admin,/strategies\/toggle-batch/);
 assert.match(admin,/await Promise\.all\(\[putDoc\(env,runtimeKey\(s\.id\),state\)/);
 assert.match(builder,/target==='white'\?'ENTRAR SOMENTE NO BRANCO'/);
 assert.match(builder,/s\.target==='white'\?\['white'\]/);
 assert.match(rules,/v21-activate-all/);
 assert.match(rules,/v21-disable-all/);
 assert.match(css,/#balls::before/);
 assert.match(css,/prefers-reduced-motion/);
});
