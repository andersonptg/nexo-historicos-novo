import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionInterval,selectDueGames} from '../worker/src/nexo-cloud-v69-scheduler.js';
import {readNewestCrash} from '../worker/src/crash-v69-source.js';
import {crashHelpers,crashPublic} from '../worker/src/crash-v2.js';
import {crashV3Public} from '../worker/src/crash-v3.js';

const stamp=Math.floor(Date.now()/60000)*60;
const rows=(values,start=stamp-1500)=>values.map((multiplier,i)=>({seq:i+1,minute_epoch:start+i*60,multiplier}));
const fixture=()=>rows([1.08,1,1.4,1.99,2.9,1.08,1,1.4,1.99,51.3,
 1.08,1,1.4,1.99,2.3,1.08,1,1.4,1.99,53.1,1.08,1,1.4,1.99,1.7]);
const envFrom=mem=>({R2:{get:async key=>mem.has(key)?{json:async()=>structuredClone(mem.get(key))}:null,put:async(key,v)=>mem.set(key,JSON.parse(v))}});

test('V6.9: Blitz Crash e Brabet recebem prioridade sem apagar outros jogos',()=>{
 const g=id=>({id,platform:id.startsWith('brabet')?'Brabet':'Blitz',eligible:true,source_url:'https://historicosblaze.com/results/blitz/crash'});
 assert.ok(collectionInterval(g('blitz-crash'))<collectionInterval(g('blitz-double')));
 assert.ok(collectionInterval(g('blitz-double'))<60000);
 assert.ok(collectionInterval(g('brabet-double'))<60000);
 assert.ok(collectionInterval({id:'smash-crash',platform:'Smash'})>=60000);
 const games=Array.from({length:29},(_,i)=>({id:'j'+i,platform:'Outro',eligible:true,source_url:'https://historicosblaze.com/results/blitz/crash'}));
 games[0]=g('blitz-crash');games[1]=g('brabet-crash');
 const due=selectDueGames(games,{},Date.now(),5);
 assert.equal(due.length,5);
 assert.equal(new Set(due.map(x=>x.g.id)).size,5);
 assert.ok(due.some(x=>x.g.id==='blitz-crash'));
});
test('V6.9: fonte com bloqueio usa backoff, sem coletar jogo sem leitor',()=>{
 const g={id:'blitz-crash',eligible:true,source_url:'https://historicosblaze.com/results/blitz/crash'};
 assert.ok(collectionInterval(g,{status:'bloqueado',consecutive_failures:2})>collectionInterval(g,{}));
 assert.deepEqual(selectDueGames([{...g,eligible:false}],{},Date.now()),[]);
});
test('V6.9: análise auto considera 3 a 12 velas prévias e respeita lacunas',()=>{
 const analyzed=crashHelpers.analyze(fixture(),{threshold:50,length:0,minimum:2,minHits:1});
 assert.ok(analyzed.patterns.some(p=>p.length===4&&p.hits>=2&&p.pattern.every(x=>x==='<2x')));
 assert.ok(analyzed.patterns.every(p=>p.length>=3&&p.length<=12&&p.count>=2&&p.hits>=1));
 const gapped=crashHelpers.analyze(fixture(),{threshold:50,length:4,minimum:2,minHits:1,gaps:[{after_seq:9},{after_seq:19}]});
 assert.ok(!gapped.patterns.some(p=>p.length===4&&p.hits>0));
 assert.ok(crashHelpers.analyze(fixture(),{threshold:25,length:4,minimum:1}).patterns.length>0);
});
test('V6.9: ambos os analisadores leem Cloud recente, preservando legado',async()=>{
 const old=rows([1.1,1.1,2.1],stamp-3600);
 const cloud=fixture();
 const mem=new Map([
  ['nexo-crash-v2/history.json',{items:old,updated_at:(stamp-3200)*1000,gaps:[]}],
  ['nexo-cloud-v5/games/blitz-crash/history.json',{items:cloud,updated_at:Date.now(),gaps:[]}]
 ]);
 const env=envFrom(mem),hist=await readNewestCrash(env);
 assert.match(hist.source_label,/Cloud/);
 assert.equal(hist.items.length,cloud.length);
 const req=new Request('https://nexo.test/api/crash/analysis-all?length=0&minimum=1');
 const reply=await crashV3Public(req,env,new URL(req.url),{analyze:crashHelpers.analyze});
 const data=await reply.json();assert.equal(reply.status,200);
 assert.deepEqual(data.analyses.map(x=>x.target),[2,5,10,25,50,100]);
 assert.ok(data.analyses.find(x=>x.target===50).patterns.some(p=>p.length===4&&p.hits>0));
 const req2=new Request('https://nexo.test/api/crash/analysis?target=25&length=0&minimum=1');
 const res2=await crashPublic(req2,env,new URL(req2.url));
 assert.equal(res2.status,200);assert.match((await res2.json()).source,/Cloud/);
 assert.ok(mem.has('nexo-crash-v2/history.json'));
});
