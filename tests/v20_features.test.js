import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import {processNewRounds} from '../worker/src/adm.js';

function harness(){
  const mem=new Map();
  const R2={
    async get(key){return mem.has(key)?{async json(){return structuredClone(JSON.parse(mem.get(key)))}}:null},
    async put(key,val){mem.set(key,typeof val==='string'?val:JSON.stringify(val));return {}},
    async delete(key){mem.delete(key);return {}},
    async list({prefix,limit=500,cursor}){const ks=[...mem.keys()].filter(k=>k.startsWith(prefix)).sort();const start=Number(cursor)||0;const part=ks.slice(start,start+limit);return {objects:part.map(key=>({key})),truncated:start+limit<ks.length,cursor:String(start+limit)}}
  };
  const env={R2,NEXO_ADM_PASSWORD:'p'.repeat(36),NEXO_V1_INGEST_TOKEN:'q'.repeat(48)};
  const put=(key,value)=>mem.set(key,JSON.stringify(value));
  const url='https://nexo.test';
  const call=(path,options={})=>worker.fetch(new Request(url+path,options),env);
  const login=async()=>{
    const response=await call('/api/adm/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({password:env.NEXO_ADM_PASSWORD})});
    assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
  };
  const post=async(path,body,cookie)=>call('/api/adm/'+path,{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  return {mem,env,put,call,login,post};
}

test('V20: batch importa branco e cores somente como pausadas, Gale 2 e idempotente',async()=>{
 const h=harness(),cookie=await h.login();
 const items=[{target:'white',tokens:['red','black']},{target:'black',tokens:['white','red']}];
 const r=await h.post('strategies/import-batch',{items,maxGale:2},cookie);assert.equal(r.status,200);
 const x=await r.json();assert.equal(x.added,2);assert.equal(x.skipped,0);
 const records=JSON.parse(h.mem.get('nexo-v3/admin/strategies.json'));
 assert.equal(records.length,2);assert.ok(records.every(s=>s.enabled===false&&s.maxGale===2));
 assert.ok(records.some(s=>s.target==='white'));
 const again=await h.post('strategies/import-batch',{items,maxGale:2},cookie);
 assert.equal(again.status,200);assert.deepEqual({added:(await again.json()).added}, {added:0});
 assert.equal(JSON.parse(h.mem.get('nexo-v3/admin/strategies.json')).length,2);
});

test('V20: Gale global altera todas as regras sem ativar as pausadas',async()=>{
 const h=harness(),cookie=await h.login();
 await h.post('strategies/import-batch',{items:[{target:'red',tokens:['black','white']},{target:'white',tokens:['red','red']}],maxGale:2},cookie);
 const bad=await h.post('strategies/gale-all',{maxGale:1},cookie);assert.equal(bad.status,400);
 const done=await h.post('strategies/gale-all',{maxGale:1,confirm:true},cookie);assert.equal(done.status,200);
 const strategies=JSON.parse(h.mem.get('nexo-v3/admin/strategies.json'));
 assert.ok(strategies.every(s=>s.maxGale===1&&s.enabled===false));
});

test('V20: alvo somente branco encerra apenas com pedra zero e respeita Gale 2',async()=>{
 const h=harness();const sid='a'.repeat(32),stamp=Math.floor(Date.now()/60000)*60;
 const strategy={id:sid,name:'Apenas branco',enabled:true,archived:false,gameId:'brabet-double',target:'white',maxGale:2,pattern:['red'],jokerWhite:false,messages:{},media:{}};
 h.put('nexo-v3/admin/strategies.json',[strategy]);h.put('nexo-v3/admin/settings.json',{botEnabled:false});
 h.put('nexo-v3/runtime/'+sid+'.json',{lastSeq:0,recent:[],active:null});
 const round=(seq,number,color)=>({seq,id:seq.toString(16).padStart(32,'0'),number,color,minute_epoch:stamp});
 await processNewRounds(h.env,{id:'brabet-double'},[round(1,3,'red')]);
 await processNewRounds(h.env,{id:'brabet-double'},[round(2,9,'black')]);
 await processNewRounds(h.env,{id:'brabet-double'},[round(3,0,'white')]);
 const scores=JSON.parse(h.mem.get('nexo-v3/scores/'+sid+'.json'));
 assert.equal(scores.entries,1);assert.equal(scores.white,1);assert.equal(scores.green,0);assert.equal(scores.red,0);assert.equal(scores.gale1,1);
 const events=[...h.mem].filter(([k])=>k.startsWith('nexo-v3/events/')).map(([,v])=>JSON.parse(v));
 assert.ok(events.some(x=>x.type==='entry_white'));
 assert.ok(events.some(x=>x.type==='win_white'));
 assert.ok(!events.some(x=>x.type==='win_black'||x.type==='win_red'));
});

test('V20: nao antecipa rodada nem reescreve o historico, status nao bloqueia pintura',async()=>{
 const fs=await import('node:fs');const root=new URL('../worker/public/',import.meta.url);
 const html=fs.readFileSync(new URL('adm.html',root),'utf8');
 const app=fs.readFileSync(new URL('app.js',root),'utf8');
 const admin=fs.readFileSync(new URL('adm-v17.js',root),'utf8');
 const live=fs.readFileSync(new URL('live-v12.js',root),'utf8');
 assert.match(html,/value="white"[^>]*>⚪ ENTRAR SOMENTE NO BRANCO/);
 assert.match(admin,/Exportar TODOS os padrões novos/);
 assert.match(admin,/alreadySaved/);
 assert.match(admin,/Gale PADRÃO|GALE PADRÃO/);
 assert.match(app,/const h=await get\(url\),s=window\.__nexo_v20_status/);
 assert.doesNotMatch(app,/await Promise\.all\(\[get\(url\),get\('\/api\/status'\)\]\)/);
 assert.match(live,/document\.body\.append\(canvas\)/);
});
