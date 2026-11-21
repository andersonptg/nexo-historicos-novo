import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TARGETS,TOOLS,RANGE_TOKENS,rangeIndex,greenTier,normalPattern,freshRows,reportRows,selectGreenDoc,historyStoneColor} from '../worker/public/nexo-crash-v70-core.js';
const html=readFileSync('worker/public/crash-studio.html','utf8');
const js=readFileSync('worker/public/nexo-crash-v70-studio.js','utf8');
const css=readFileSync('worker/public/nexo-crash-v70-studio.css','utf8');
test('V7.0: 36 areas reais combinam os seis alvos e seis modulos',()=>{
 assert.deepEqual(TARGETS,[2,5,10,25,50,100]);assert.equal(TOOLS.length*TARGETS.length,36);
 assert.deepEqual(TOOLS.map(x=>x.id),['builder','validator','strategies','candles','stickers','reports']);
 assert.match(html,/id="nx70-targets"/);assert.match(html,/id="nx70-tools"/);
 assert.match(css,/\.nx70-stone/);
});
test('V7.0: categorias de cores e GREEN por limite real de multiplicador',()=>{
 assert.deepEqual([1,1.99,2,3.99,4,9.99,10,55].map(rangeIndex),[0,0,1,1,2,2,3,3]);
 assert.equal(historyStoneColor(1.99),'#292d3a');assert.equal(historyStoneColor(2.0),'#008b52');
 assert.deepEqual([1.1,2.5,5.1,10,27,62,150].map(greenTier),[null,2,5,10,25,50,100]);
 const config={targets:{'25':{green:{kind:'sticker',assetId:'abc'}}}};
 assert.equal(selectGreenDoc(config,27).assetId,'abc');
});
test('V7.0: padrao so usa as faixas aceitas pelo backend e preserva ordem',()=>{
 assert.deepEqual(normalPattern(['<2x','2-<4x','<2x']),['<2x','2-<4x','<2x']);
 assert.throws(()=>normalPattern(['<2x','5x inventado']),/Escolha/);
 assert.throws(()=>normalPattern(Array.from({length:13},()=>RANGE_TOKENS[0])),/Escolha/);
});
test('V7.0: nao inventa vela, descarta sequencia duplicada e calcula frequencia descritiva',()=>{
 const minute=Math.floor(Date.now()/60000)*60;
 const rows=[{seq:3,multiplier:51,minute_epoch:minute},{seq:1,multiplier:1.5,minute_epoch:minute-120},{seq:2,multiplier:2.2,minute_epoch:minute-60},{seq:3,multiplier:100,minute_epoch:minute}];
 assert.deepEqual(freshRows(rows).map(x=>x.seq),[3,2,1]);
 const result=reportRows(rows,25);assert.equal(result.total,3);assert.equal(result.hits,1);assert.equal(result.max,51);
});
test('V7.0: CRUD usa o endpoint autenticado Crash; nao envia automaticamente ao Telegram',()=>{
 assert.match(js,/base\+'\/strategies\/'/);
 assert.match(js,/api\(route,write\(editingId\?'PUT':'POST'/);
 assert.match(js,/method:'DELETE'/);
 assert.match(js,/base\+'\/v3\/signals'/);
});
