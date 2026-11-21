import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCrashAllFast} from '../worker/src/nexo-crash-v692-fast.js';
import {crashHelpers,crashPublic} from '../worker/src/crash-v2.js';
import {crashV3Public} from '../worker/src/crash-v3.js';

const stamp=Math.floor(Date.now()/60000)*60;
const values=[1.08,1,1.4,1.99,2.9,1.08,1,1.4,1.99,51.3,
  1.08,1,1.4,1.99,2.3,1.08,1,1.4,1.99,53.1,1.08,1,1.4,1.99,1.7];
const rows=values.map((multiplier,i)=>({seq:i+1,minute_epoch:stamp-(values.length-i)*60,multiplier}));
const targets=[2,5,10,25,50,100];
const storage=new Map([
 ['nexo-cloud-v5/games/blitz-crash/history.json',{items:rows,updated_at:Date.now(),gaps:[]}],
 ['nexo-crash-v2/history.json',{items:[{seq:1,minute_epoch:stamp-3600,multiplier:1.1}],updated_at:Date.now()-600000,gaps:[]}]
]);
const env={R2:{get:async key=>storage.has(key)?{json:async()=>structuredClone(storage.get(key))}:null}};

test('V6.9.2: os seis alvos sao calculados em uma passagem a partir das velas confirmadas',()=>{
 const result=analyzeCrashAllFast(rows,{targets,length:0,minimum:2});
 assert.deepEqual(result.map(r=>r.target),targets);
 assert.ok(result.find(r=>r.target===50).patterns.some(p=>p.length===4&&p.hits===2&&p.pattern.every(c=>c==='<2x')));
 assert.ok(result.every(r=>r.patterns.every(p=>p.hits>=1&&p.count>=2&&p.length>=3&&p.length<=12)));
});
test('V6.9.2: coincide com o analisador legado nas ocorrencias e acertos para uma amostra fixa',()=>{
 for(const target of [2,5,10,25,50,100]){
  const old=crashHelpers.analyze(rows,{threshold:target,length:4,minimum:1});
  const fast=analyzeCrashAllFast(rows,{targets:[target],length:4,minimum:1})[0];
  assert.equal(fast.eligible,old.eligible);
  assert.equal(fast.baseline,old.baseline);
  const patternsOld=new Map(old.patterns.map(p=>[p.pattern.join('/'),p]));
  for(const p of fast.patterns){
   const o=patternsOld.get(p.pattern.join('/'));
   assert.ok(o,'Padrao nao encontrado no analisador antigo: '+p.pattern);
   assert.equal(p.count,o.count);
   assert.equal(p.hits,o.hits);
  }
 }
});
test('V6.9.2: uma lacuna no arquivo interrompe todas as sequencias correspondentes',()=>{
 const without=analyzeCrashAllFast(rows,{targets:[50],length:4,minimum:1})[0];
 const withGap=analyzeCrashAllFast(rows,{targets:[50],length:4,minimum:1,gaps:[{after_seq:9},{after_seq:19}]})[0];
 assert.ok(without.patterns.some(p=>p.length===4&&p.hits===2));
 assert.equal(withGap.patterns.length,0);
});
test('V6.9.2: rota publica 6 analises e fonte, sem enviar mensagem',async()=>{
 const req=new Request('https://nexo.test/api/crash/analysis-all?length=0&minimum=2');
 const res=await crashV3Public(req,env,new URL(req.url),{analyze:crashHelpers.analyze});
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.ok,true);
 assert.equal(data.source,'Cloud · R2');
 assert.deepEqual(data.analyses.map(x=>x.target),targets);
 const req2=new Request('https://nexo.test/api/crash/analysis?target=50&length=0&minimum=2');
 const res2=await crashPublic(req2,env,new URL(req2.url));
 assert.equal(res2.status,200);
 const d=await res2.json();
 assert.equal(d.threshold,50);
 assert.equal(d.source,'Cloud · R2');
});
