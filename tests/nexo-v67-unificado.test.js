import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('worker/public/historicos.html','utf8');
const css=readFileSync('worker/public/nexo-v67.css','utf8');
const js=readFileSync('worker/public/nexo-v67.js','utf8');
const index=readFileSync('worker/public/index.html','utf8');
const cloud=readFileSync('worker/src/nexo-cloud-v5.js','utf8');
test('V6.7: entrada inicial abre central unificada, com splash e acesso ADM',()=>{
 assert.match(html,/id="n67-splash"/);assert.match(html,/id="n67-start"/);assert.match(html,/id="n67-history"/);
 assert.match(index,/location\.replace\('\/historicos\.html'\)/);
 assert.match(html,/href="\/adm\.html"/);assert.match(html,/id="nx6-menu-open"/);
});
test('V6.7: menu lateral rolavel agrupa plataformas e jogos',()=>{
 for(const id of ['nx6-drawer','nx6-menu-close','nx6-nav','nx6-search','nx6-backdrop'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/\.n67-nav\{overflow:auto/);assert.match(js,/gamesOf\(platform\)/);assert.match(js,/details/);assert.match(js,/renderMenu/);
});
test('V6.7: seletor de jogo so recebe os da plataforma atual',()=>{
 assert.match(js,/for\(const game of gamesOf\(g\.platform\)\)/);
 assert.match(html,/id="nx6-game"/);assert.match(html,/id="n67-number"/);assert.match(html,/id="n67-date"/);
});
test('V6.7: Double mantém exatamente oito pedras por linha em celulares',()=>{
 assert.match(css,/\.n67-grid\{display:grid;grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:650px\)[\s\S]*?\.n67-grid\{grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
 assert.match(js,/n67-stone-double/);assert.match(js,/n67-white-bolt/);
});
test('V6.7: histórico Blitz Double e Crash consultam legado e Cloud e preferem mais recente',()=>{
 assert.match(js,/\/api\/history\?game_id=blitz-double&limit=200/);
 assert.match(js,/\/api\/crash\/history\?limit=200/);
 assert.match(js,/\/api\/cloud\/history\?game_id=/);
 assert.match(js,/function chooseBest/);assert.match(js,/latestOf\(legacy,kind\)/);
 assert.doesNotMatch(js,/Math\.random\(/);
});
test('V6.7: consulta de 1 s fica suspensa em segundo plano sem confundir com fonte',()=>{
 assert.match(js,/POLL_MS=1000/);assert.match(js,/document\.hidden/);assert.match(js,/stopPolling/);
 assert.match(html,/precis[aã]o de minuto/i);
});
test('V6.7: celebra apenas rodada nova e confirmada, nunca snapshot inicial',()=>{
 assert.match(js,/if\(prev&&mark&&prev!==mark&&age<160\)celebrate\(newer\)/);
 assert.match(js,/Number\(x\.multiplier\)>10/);assert.match(js,/x\.color==='gold'/);assert.match(js,/Number\(x\.number\)===0/);
 assert.match(css,/@keyframes n67-spark/);
});
test('V6.7: novas chamadas nao enviam Telegram e rotas ADM sao links',()=>{
 assert.doesNotMatch(js,/api\/adm|sendMessage|sendSticker|sendAnimation/);
 assert.doesNotMatch(js,/method:\s*['"]POST['"]/);
});
test('V6.9: coletor prioriza Crash e mantem jogos elegiveis',()=>{
 assert.match(cloud,/GAMES\.filter\(g=>g\.eligible\)/);assert.match(cloud,/selectDueGames\(GAMES,states/);
 assert.match(cloud,/batch:5/);
});
