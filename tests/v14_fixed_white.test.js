import test from 'node:test';
import assert from 'node:assert/strict';
import {routeWhiteAdmin,processWhiteRounds,calculateRelativeWhiteWindows,scheduledWhite,whiteShouldBlockLegacy} from '../worker/src/white.js';
const epoch=s=>Math.floor(new Date(s+'-03:00').getTime()/1000);
const row=(seq,color,number,clock)=>({id:seq.toString(16).padStart(32,'0'),seq,color,number,minute_epoch:epoch(clock)});
function fake(){
 const db=new Map();const env={R2:{
  get:async k=>db.has(k)?{json:async()=>JSON.parse(db.get(k))}:null,
  put:async(k,val)=>{db.set(k,typeof val==='string'?val:JSON.stringify(val))},
  delete:async k=>{db.delete(k)},
  list:async({prefix,limit=100})=>({objects:[...db.keys()].filter(x=>x.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false})
 }};
 const get=k=>JSON.parse(db.get(k));const put=(k,x)=>db.set(k,JSON.stringify(x));
 const request=(path,method='GET',body)=>routeWhiteAdmin(new Request('https://nexo.test/api/adm/white/'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env,new URL('https://nexo.test/api/adm/white/'+path));
 const ingest=async(...rows)=>{for(const x of rows)await processWhiteRounds(env,{id:'brabet-double'},[x])};
 const events=()=>[...db.entries()].filter(([k])=>k.startsWith('nexo-white-v1/events/')).map(([,v])=>JSON.parse(v));
 return {db,env,get,put,request,ingest,events};
}

test('V14: primeira abertura cadastra as DUAS estratégias fixas, sem ligar Telegram',async()=>{
 const h=fake(),res=await h.request('overview'),d=await res.json();
 assert.equal(res.status,200);assert.equal(d.rules.length,2);
 assert.deepEqual(d.rules.map(x=>x.enabled),[true,true]);
 assert.deepEqual(d.rules.map(x=>x.before.color),['red','any']);
 assert.deepEqual(d.rules.map(x=>x.after.color),['none','black']);
 assert.deepEqual(d.rules.map(x=>x.mode),['relative','relative']);
 assert.deepEqual(d.rules.map(x=>x.offset),[10,10]);
 assert.equal(d.config.botEnabled,false);
});

test('V14: 4 vermelho e branco no mesmo minuto => 17:40 e 17:44 (2ª casa estimada)',async()=>{
 const h=fake();await h.ingest(row(1,'red',4,'2026-11-15T17:30:00'),row(2,'white',0,'2026-11-15T17:30:00'));
 const a=h.get('nexo-white-v1/runtime.json').active;
 assert.deepEqual([a.label1,a.label2,a.house],["17:40","17:44","second"]);
 assert.deepEqual(h.events().map(x=>x.type),['attention']);
});

test('V14: 4 às 17:29 e branco às 17:30 => primeira casa estimada',async()=>{
 const h=fake();await h.ingest(row(1,'red',4,'2026-11-15T17:29:00'),row(2,'white',0,'2026-11-15T17:30:00'));
 const a=h.get('nexo-white-v1/runtime.json').active;
 assert.deepEqual([a.label1,a.label2,a.house],["17:40","17:44","first"]);
});

test('V14: coringa azul admite preto ou vermelho, branco, 11 preto => 18:07 / 18:11',async()=>{
 for(const color of ['red','black']){
  const h=fake();await h.ingest(row(1,color,color==='red'?6:8,'2026-11-15T17:57:00'),row(2,'white',0,'2026-11-15T17:57:00'),row(3,'black',11,'2026-11-15T17:58:00'));
  const a=h.get('nexo-white-v1/runtime.json').active;
  assert.ok(a);assert.deepEqual([a.label1,a.label2,a.house],['18:07','18:11','first']);
  assert.match(a.sequence,/🟦/);
 }
});

test('V14: padrão de duas pedras exige sequência consecutiva e minuto adjacente',async()=>{
 const h=fake();await h.ingest(row(1,'red',4,'2026-11-15T17:29:00'),row(2,'black',8,'2026-11-15T17:29:00'),row(3,'white',0,'2026-11-15T17:30:00'));
 assert.equal(h.get('nexo-white-v1/runtime.json').active,null);
});

test('V14: cálculos relativos +10 e +4 respeitam virada de dia',()=>{
 const white=row(1,'white',0,'2026-11-15T23:57:00');const last=row(2,'black',11,'2026-11-15T23:58:00');
 const c=calculateRelativeWhiteWindows(white,last,10,4);
 assert.deepEqual([c.label1,c.label2],['00:07','00:11']);
});

test('V14: modelo antigo V13 permanece disponível; novas regras relativas salvam ativas',async()=>{
 const h=fake();await h.request('overview');const r=await h.request('rules','POST',{name:'Regra Nova',before:{color:'any',number:null},after:{color:'none',number:null},mode:'relative',offset:10,house:'auto',increment:4,tolerance:1,alertDelaySeconds:30,enabled:true});
 assert.equal(r.status,200);assert.equal((await r.json()).rule.enabled,true);
 const n=h.get('nexo-white-v1/rules.json');assert.equal(n.length,3);
});

test('V14: regras antigas e exclusões nunca são sobrescritas por presets',async()=>{
 const h=fake();h.put('nexo-white-v1/rules.json',[]);const d=await(await h.request('overview')).json();assert.equal(d.rules.length,0);
 const id='f'.repeat(32);const rule={id,name:'Excluível',before:{color:'red',number:4},after:{color:'none',number:null},mode:'relative',offset:10,increment:4,tolerance:1,house:'auto',alertDelaySeconds:30,enabled:true};
 h.put('nexo-white-v1/rules.json',[rule]);let res=await h.request('rules/'+id,'DELETE',{confirm:true});assert.equal(res.status,200);
 assert.equal((await(await h.request('overview')).json()).rules.length,0);
});

test('V14: bot de branco desligado não bloqueia processamento do bot de cores',async()=>{
 const h=fake();await h.ingest(row(1,'red',4,'2026-11-15T17:30:00'),row(2,'white',0,'2026-11-15T17:30:00'));
 assert.equal(await whiteShouldBlockLegacy(h.env),false);
 h.put('nexo-white-v1/config.json',{botEnabled:true,chats:[],templates:{}});
 assert.equal(await whiteShouldBlockLegacy(h.env),true);
});

test('V14: atenção primeiro e sinal depois, sem duplicar no cron',async()=>{
 const h=fake();await h.ingest(row(1,'red',4,'2026-11-15T17:30:00'),row(2,'white',0,'2026-11-15T17:30:00'));
 const runtime=h.get('nexo-white-v1/runtime.json');runtime.active.createdAt=Math.floor(Date.now()/1000)-40;
 runtime.active.target1=Math.floor(Date.now()/1000)+500;runtime.lastReceivedAt=Math.floor(Date.now()/1000);
 h.put('nexo-white-v1/runtime.json',runtime);
 await scheduledWhite(h.env);await scheduledWhite(h.env);
 assert.deepEqual(h.events().map(x=>x.type).sort(),['attention','signal']);
});

test('V14: botão de restaurar presets adiciona só modelos ausentes, preservando regras antigas',async()=>{
 const h=fake(),id='a'.repeat(32);const original={id,name:'Regra pessoal',before:{color:'black',number:8},after:{color:'red',number:7},increment:4,tolerance:1,enabled:true};
 h.put('nexo-white-v1/rules.json',[original]);
 const r=await h.request('presets','POST',{confirm:true});assert.equal(r.status,200);assert.equal((await r.json()).added,2);
 assert.equal(h.get('nexo-white-v1/rules.json').length,3);
 assert.deepEqual(h.get('nexo-white-v1/rules.json')[0],original);
 const again=await h.request('presets','POST',{confirm:true});assert.equal((await again.json()).added,0);
});
