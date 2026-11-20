import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudTest,cloudPublic,NexoCloudCollector} from '../worker/src/nexo-cloud-v5.js';
const gameDouble=cloudTest.GAMES.find(g=>g.id==='blitz-double');
const gameCrash=cloudTest.GAMES.find(g=>g.id==='blitz-crash');
const make=(marker,values)=>`<html><body><div>${marker}</div>${values.map(([v,t])=>`<span>${v}</span><span>${t}</span>`).join('')}</body></html>`;
test('catalogo possui 16 plataformas e 50 jogos sem IDs repetidos',()=>{
 assert.equal(cloudTest.GAMES.length,50);
 assert.equal(new Set(cloudTest.GAMES.map(g=>g.platform)).size,16);
 assert.equal(new Set(cloudTest.GAMES.map(g=>g.id)).size,50);
 assert.ok(gameDouble?.eligible&&gameCrash?.eligible);
 assert.ok(cloudTest.GAMES.filter(g=>!g.eligible).length>0);
});
test('parser Double aceita somente pares numericos com horario apos marcador',()=>{
 const input=make('Sem Destaque',Array.from({length:10},(_,i)=>[i===2?'BRANCO':String(i%15),`13:${String(59-i).padStart(2,'0')}`]));
 const r=cloudTest.sourceRows(input,gameDouble);
 assert.equal(r.length,10);assert.equal(r[2].number,0);assert.equal(r[2].color,'white');
 assert.ok(r.every(x=>Number.isInteger(x.minute_epoch)));
});
test('parser Crash trata multiplicadores e replica horario da fonte sem segundos',()=>{
 const input=make('Connecting - 200 Results',Array.from({length:10},(_,i)=>[`${(i*2+1).toFixed(2)}x`,`13:${String(59-i).padStart(2,'0')}`]));
 const r=cloudTest.sourceRows(input,gameCrash);
 assert.equal(r.length,10);assert.equal(r[0].multiplier,1);assert.equal(r[1].multiplier,3);
 assert.equal(r[0].minute_epoch%60,0);
});
test('parser nunca transforma trecho de navegacao ou layout aleatorio em resultados',()=>{
 const bad=make('Compre resultados',[['1.32x','13:54']]);
 assert.throws(()=>cloudTest.sourceRows(bad,gameCrash),/FORMATO_NAO_RECONHECIDO/);
});
test('janela de sobreposicao exige 4 resultados consecutivos',()=>{
 const rec=n=>({minute_epoch:1700000000+n*60,multiplier:1+n/100});
 const a=Array.from({length:12},(_,i)=>rec(i));
 assert.equal(cloudTest.firstOverlap(a,a.slice(4),gameCrash).index,0);
 assert.equal(cloudTest.firstOverlap(a,[rec(200),rec(201),...a.slice(4)],gameCrash).index,2);
 assert.equal(cloudTest.firstOverlap(a,[rec(200),rec(201)],gameCrash),null);
});
test('API publica nao revela segredos e conserva jogos catalogados',async()=>{
 const store=new Map();const env={R2:{get:async k=>store.has(k)?{json:async()=>store.get(k)}:null}};
 const req=new Request('https://nexo.test/api/cloud/catalog');const res=await cloudPublic(req,env,new URL(req.url));
 assert.equal(res.status,200);const x=await res.json();assert.equal(x.count,50);assert.equal(x.platforms,16);
 assert.equal(x.games.filter(g=>g.id==='blitz-crash').length,1);
 assert.equal(x.games.find(g=>g.id==='evolution-ice-fishing').status,'sem_adaptador');
});
test('histórico Crash existente permanece legível sem reingestão',async()=>{
 const r2=new Map([['nexo-crash-v2/history.json',{items:[{seq:911,minute_epoch:1795154600,multiplier:2.5}],updated_at:1795154604000,gaps:[]}]]);
 const env={R2:{get:async k=>r2.has(k)?{json:async()=>r2.get(k)}:null}};
 const req=new Request('https://nexo.test/api/cloud/history?game_id=blitz-crash&limit=5');
 const response=await cloudPublic(req,env,new URL(req.url));const data=await response.json();
 assert.equal(data.items.length,1);assert.equal(data.items[0].seq,911);assert.equal(data.items[0].multiplier,2.5);
});

test('novo DO inicia pausado, permite ativar e pausar sem sinais Telegram',async()=>{
 const records=new Map();let alarm=null;const storage={
  get:async k=>records.get(k),put:async(k,v)=>{records.set(k,v)},
  getAlarm:async()=>alarm,setAlarm:async v=>{alarm=v},deleteAlarm:async()=>{alarm=null}
 };
 const stored=new Map();const R2={get:async k=>stored.has(k)?{json:async()=>stored.get(k)}:null,put:async(k,v)=>{stored.set(k,JSON.parse(v))}};
 const engine=new NexoCloudCollector({storage},{R2});
 let r=await engine.fetch(new Request('https://nexo.internal/cloud/status'));let d=await r.json();
 assert.equal(d.config.running,false);
 r=await engine.fetch(new Request('https://nexo.internal/cloud/start',{method:'POST',body:JSON.stringify({tick_seconds:30,batch:2})}));d=await r.json();
 assert.equal(d.running,true);assert.ok(alarm>0);
 assert.equal(stored.get('nexo-cloud-v5/overview.json').running,true);
 r=await engine.fetch(new Request('https://nexo.internal/cloud/pause',{method:'POST',body:'{}'}));d=await r.json();
 assert.equal(d.running,false);assert.equal(alarm,null);
 assert.equal(stored.get('nexo-cloud-v5/overview.json').running,false);
});
