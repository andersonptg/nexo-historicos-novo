import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloudTest,NexoCloudCollector} from '../worker/src/nexo-cloud-v5.js';
const double=cloudTest.GAMES.find(x=>x.id==='blitz-double');
const crash=cloudTest.GAMES.find(x=>x.id==='blitz-crash');
const fixture=(name,rows)=>`<html><body><div>${name}</div>${rows.map(([v,t])=>`<span>${v}</span><span>${t}</span>`).join('')}</body></html>`;
test('Double le o marcador novo da fonte publica, sem perder o legado',()=>{
 const rows=Array.from({length:10},(_,i)=>[i===2?'BRANCO':String((i+1)%15),'04:'+String(59-i).padStart(2,'0')]);
 for(const marker of ['Sem Destaque','Conectando - 200 Resultados','Connecting - 200 Results']){
  const parsed=cloudTest.sourceRows(fixture(marker,rows),double);
  assert.equal(parsed.length,10);
  assert.equal(parsed[2].number,0);
  assert.ok(parsed.every(x=>Number.isInteger(x.minute_epoch)));
 }
});
test('Crash continua interpretando multiplicadores historicos',()=>{
 const rows=Array.from({length:12},(_,i)=>[(i/2+1).toFixed(2)+'x','04:'+String(59-i).padStart(2,'0')]);
 assert.equal(cloudTest.sourceRows(fixture('Conectando - 200 Resultados',rows),crash).length,12);
});
test('ADM obtem erros reais da coleta sem expor token ou alterar o motor',async()=>{
 const memory=new Map([['statuses',{'blitz-double':{status:'bloqueado',last_error:'FONTE_HTTP_403'}}]]);
 const DO=new NexoCloudCollector({storage:{get:async k=>memory.get(k)}},{R2:{}});
 const res=await DO.fetch(new Request('https://nexo.internal/cloud/status'));
 const value=await res.json();
 assert.equal(value.statuses['blitz-double'].last_error,'FONTE_HTTP_403');
 assert.equal(value.config.running,false);
 assert.equal(value.ready_count,cloudTest.GAMES.filter(g=>g.eligible).length);
});
test('Visual V6.3 altera somente o Crash e mantem o Double',()=>{
 const js=readFileSync('worker/public/nexo-historicos-v6.js','utf8');
 const css=readFileSync('worker/public/nexo-crash-visual-v6-3.css','utf8');
 const page=readFileSync('worker/public/historicos.html','utf8');
 assert.match(js,/nx6-crash-visual.*active.kind==='multiplier'.*crash/i);
 assert.match(css,/grid-template-columns:\s*repeat\(8/);
 assert.match(css,/\.nx6-tile\.nx6-c0/);
 assert.match(css,/\.nx6-tile\.nx6-c4/);
 assert.match(page,/nexo-crash-visual-v6-3.css/);
 assert.match(page,/nexo-historicos-v6\.js\?v=6\.5\.0/);
 assert.doesNotMatch(page,/nexo-crash-visual-v6-1.js/);
});
test('Auditoria aparece somente no ADM autenticado, sem envio Telegram',()=>{
 const adm=readFileSync('worker/public/adm.html','utf8');
 const client=readFileSync('worker/public/nexo-cloud-v6-3-auditoria.js','utf8');
 assert.match(adm,/nexo-cloud-v6-3-auditoria.js/);
 assert.match(client,/api\/adm\/cloud\/status/);
 assert.match(client,/api\/adm\/cloud\/run-once/);
 assert.match(client,/confirm\(/);
 assert.doesNotMatch(client,/sendMessage|sendSticker|telegram\.org\/bot/);
});
