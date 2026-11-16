import test from 'node:test';
import assert from 'node:assert/strict';
import {NexoCoordinator} from '../worker/src/index.js';
import {resetAfterCatchup,processNewRounds,scheduledAdmin} from '../worker/src/adm.js';
import {readFileSync} from 'node:fs';

const game={id:'brabet-double'},ROOT='nexo-v3/';
const names={strategies:ROOT+'admin/strategies.json',owner:ROOT+'runtime/game-owner/brabet-double.json',snapshot:ROOT+'runtime/v24/brabet-double.json'};
const rid=(i)=>i.toString(16).padStart(32,'0');
function harness(count=165){
 const raw=new Map(),kv=new Map(),operations={runtimeGets:0,runtimePuts:0,scoreGets:0,scorePuts:0,aggregatePuts:0};
 const R2={
  async get(k){if(/^nexo-v3\/runtime\/[a-f0-9]{32}\.json$/.test(k))operations.runtimeGets++;
    if(k.startsWith(ROOT+'scores/'))operations.scoreGets++;
    return raw.has(k)?{json:async()=>structuredClone(JSON.parse(raw.get(k)))}:null;},
  async put(k,v){if(/^nexo-v3\/runtime\/[a-f0-9]{32}\.json$/.test(k))operations.runtimePuts++;
   if(k.startsWith(ROOT+'scores/'))operations.scorePuts++;
   if(k===names.snapshot)operations.aggregatePuts++;
   raw.set(k,typeof v==='string'?v:JSON.stringify(v));return {};},
  async delete(k){raw.delete(k)},
  async list({prefix,limit=100}){return {objects:[...raw.keys()].filter(k=>k.startsWith(prefix)).sort().slice(0,limit).map(key=>({key})),truncated:false}}
 };
 const storage={
  async get(k){return structuredClone(kv.get(k))},
  async put(k,v){kv.set(k,structuredClone(v))},
  async delete(k){kv.delete(k)},
  async list({prefix,limit=100}){return new Map([...kv.entries()].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))},
  async transaction(fn){return fn(this)},
  async setAlarm(value){kv.set('test-next-alarm',value)}
 };
 const strategies=Array.from({length:count},(_,i)=>({id:rid(i+1),gameId:'brabet-double',name:'Regra '+i,enabled:true,archived:false,
    target:'black',maxGale:2,pattern:['red','red'],jokerWhite:false,messages:{},media:{},updatedAt:1000}));
 const put=(k,v)=>raw.set(k,JSON.stringify(v));
 const get=k=>JSON.parse(raw.get(k));
 const minute=Math.floor(Date.now()/60_000)*60;
 const round=(seq,number,color)=>({id:rid(seq+5000),seq,number,color,minute_epoch:minute});
 put(names.strategies,strategies);
 put(ROOT+'admin/settings.json',{botEnabled:false,resetMidnight:false});
 for(const s of strategies)put(ROOT+'runtime/'+s.id+'.json',{lastSeq:100,recent:[round(100,5,'red')],active:null});
 const env={R2};const server=new NexoCoordinator({storage},env);
 return {raw,kv,operations,R2,storage,put,get,env,server,strategies,round};
}

test('V24: 165 estrategias recuperam cursor com UMA gravacao R2, sem 165 resets',async()=>{
 const h=harness();h.put(names.owner,{ownerId:null,lastSeq:100});
 await resetAfterCatchup(h.env,game,[h.round(101,4,'red')]);
 const owner=h.get(names.owner);
 assert.equal(owner.rebaseSeq,101);assert.equal(owner.lastSeq,101);
 assert.equal(h.operations.runtimePuts,0);
 assert.equal(h.get(ROOT+'runtime/'+h.strategies[0].id+'.json').lastSeq,100,'runtime original preservado ate nova rodada');
 await processNewRounds(h.env,game,[h.round(102,3,'red')]);
 assert.equal(h.operations.scoreGets,0,'nao ler 165 placares quando nenhuma regra pontua');
 assert.equal(h.operations.scorePuts,0,'nao regravar 165 placares sem eventos');
 assert.equal(h.operations.runtimePuts,0,'snapshot agrega estados inativos');
 const snapshot=h.get(names.snapshot);
 assert.equal(Object.keys(snapshot.states).length,165);
 assert.equal(snapshot.states[h.strategies[0].id].state.active,null);
 assert.equal(h.get(names.owner).lastSeq,102);
 assert.equal([...h.raw.keys()].filter(k=>k.startsWith(ROOT+'events/')).length,0,'padrao antes do catchup nao vale');
});

test('V24: dezenas de regras compartilham snapshot, mas apenas UMA abre ciclo e vence',async()=>{
 const h=harness();h.put(names.owner,{ownerId:null,lastSeq:100});
 await resetAfterCatchup(h.env,game,[h.round(101,4,'red')]);
 await processNewRounds(h.env,game,[h.round(102,3,'red')]);
 const before={...h.operations};
 await processNewRounds(h.env,game,[h.round(103,5,'red')]);
 const id=h.strategies[0].id;
 assert.equal(h.get(ROOT+'scores/'+id+'.json').entries,1);
 assert.equal(h.operations.scorePuts-before.scorePuts,1);
 assert.ok(h.operations.runtimePuts-before.runtimePuts<=2,'nao regravar todos os estados individuais');
 assert.equal([...h.raw.keys()].filter(k=>k.startsWith(ROOT+'events/')).length,1);
 await processNewRounds(h.env,game,[h.round(104,11,'black')]);
 assert.equal(h.get(ROOT+'scores/'+id+'.json').green,1);
 const events=h.raw.size;
 await processNewRounds(h.env,game,[h.round(104,11,'black')]);
 assert.equal(h.raw.size,events,'rodada duplicada nao cria evento');
 assert.equal(h.operations.scorePuts,2,'somente entrada e WIN regravam placar');
});

test('V24: catchup apos entrada cancela ciclo antigo, sem fabricar WIN',async()=>{
 const h=harness();h.put(names.owner,{ownerId:null,lastSeq:100});
 await resetAfterCatchup(h.env,game,[h.round(101,4,'red')]);
 await processNewRounds(h.env,game,[h.round(102,3,'red')]);
 await processNewRounds(h.env,game,[h.round(103,5,'red')]);
 assert.equal(h.get(ROOT+'scores/'+h.strategies[0].id+'.json').entries,1);
 await resetAfterCatchup(h.env,game,[h.round(104,11,'black')]);
 await processNewRounds(h.env,game,[h.round(105,11,'black')]);
 assert.equal(h.get(ROOT+'scores/'+h.strategies[0].id+'.json').green,0);
 assert.equal(h.get(names.snapshot).states[h.strategies[0].id].state.active,null);
});

test('V24: agendador nao varre 165 placares toda vez que o relogio muda',async()=>{
 const h=harness();h.put(ROOT+'admin/settings.json',{botEnabled:false,resetMidnight:true});
 await scheduledAdmin(h.env);
 await scheduledAdmin(h.env);
 assert.equal(h.operations.scoreGets,0);
 assert.equal(h.operations.scorePuts,0);
});

test('V24: fila antiga 130 lotes avanca usando cursor unico e preserva os lotes no R2',async()=>{
 const h=harness();
 for(let i=1;i<=130;i++)h.kv.set('nexo-v18-job/'+String(i).padStart(12,'0'),{gameId:game.id,rows:[h.round(i,5,'red')],enqueuedAtMs:Date.now()-50000});
 await h.server.alarm();
 assert.equal(h.get(names.owner).rebaseSeq,100);
 assert.equal([...h.kv.keys()].filter(k=>k.startsWith('nexo-v18-job/')).length,30);
 assert.equal(h.operations.runtimeGets,0);
 assert.equal(h.operations.runtimePuts,0);
 await h.server.alarm();
 assert.equal(h.get(names.owner).rebaseSeq,130);
 assert.equal([...h.kv.keys()].filter(k=>k.startsWith('nexo-v18-job/')).length,0);
 assert.equal(h.kv.get('nexo-v22-metrics').coalesced,130);
});

test('V24: codigo preserva caminhos de seguranca e o motor antigo para projetos pequenos',()=>{
 const src=readFileSync(new URL('../worker/src/adm.js',import.meta.url),'utf8');
 assert.match(src,/function v24Sig|const v24Sig/);
 assert.match(src,/v24SnapshotKey\(game\.id\)/);
 assert.match(src,/await putDoc\(env,v24SnapshotKey\(game\.id\)/);
 assert.match(src,/if\(allStrategies\.length>64\|\|strategies\.length>48/);
 assert.match(src,/await Promise\.all\(\[putDoc\(env,runtimeKey\(s\.id\),state\)/,'caminho tradicional preservado');
 assert.match(src,/v22ExpiredEvent/,'sinais antigos continuam bloqueados');
});


test('V25: 265 regras de padrao repetido preservam so uma entrada e um WIN, com diagnostico',async()=>{
 const h=harness(265);
 h.put(names.owner,{ownerId:null,lastSeq:100});
 await resetAfterCatchup(h.env,game,[h.round(101,4,'red')]);
 await processNewRounds(h.env,game,[h.round(102,3,'red')]);
 const diag={analysisMs:null,deliveryMs:null};
 await processNewRounds(h.env,game,[h.round(103,5,'red')],0,diag);
 assert.equal(h.get(ROOT+'scores/'+h.strategies[0].id+'.json').entries,1);
 assert.ok(Number.isFinite(diag.analysisMs) && diag.analysisMs>=0);
 assert.ok(Number.isFinite(diag.deliveryMs) && diag.deliveryMs>=0);
 const before=h.raw.size;
 await processNewRounds(h.env,game,[h.round(103,5,'red')]);
 assert.equal(h.raw.size,before,'replay do resultado nao duplica estado/evento');
 await processNewRounds(h.env,game,[h.round(104,11,'black')]);
 assert.equal(h.get(ROOT+'scores/'+h.strategies[0].id+'.json').green,1);
 assert.equal([...h.raw.keys()].filter(k=>k.startsWith(ROOT+'events/')).length,2);
});

test('V25: diagnostico, reutilizacao de token e atualizacao da aba preservados',()=>{
 const adm=readFileSync(new URL('../worker/src/adm.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../worker/src/index.js',import.meta.url),'utf8');
 const site=readFileSync(new URL('../worker/public/app.js',import.meta.url),'utf8');
 assert.match(adm,/const patternCache=new Map\(\)/);
 assert.match(adm,/sharedDeliveryToken,sharedBotIdentity/);
 assert.match(index,/last_analysis_ms/);
 assert.match(index,/last_delivery_ms/);
 assert.match(site,/visibilitychange/);
 assert.match(site,/pageshow/);
});


test('V25.2: busca por numero e exclusao confirmada preservam API protegida',()=>{
 const fs=readFileSync;
 const js=fs(new URL('../worker/public/adm-v17.js',import.meta.url),'utf8');
 const css=fs(new URL('../worker/public/adm-v17.css',import.meta.url),'utf8');
 const backend=fs(new URL('../worker/src/adm.js',import.meta.url),'utf8');
 const html=fs(new URL('../worker/public/adm.html',import.meta.url),'utf8');
 assert.match(js,/function v25MatchesSearch\(/);
 assert.match(js,/const visible=items\.map\(/);
 assert.match(js,/v25-strategy-search/);
 assert.match(js,/\/purge'/);
 assert.match(js,/id:s\.id,confirm:true/);
 assert.match(js,/v25ConfirmDelete/);
 assert.match(css,/\.v25-rule-delete/);
 assert.match(css,/\.v25-delete-overlay/);
 assert.match(html,/adm-v17\.js\?v=25\.2\.0/);
 assert.match(backend,/match\[2\]==='purge'/);
});
