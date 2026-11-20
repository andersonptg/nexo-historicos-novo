import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('worker/public/historicos.html','utf8');
const js=readFileSync('worker/public/nexo-historicos-v6.js','utf8');
const css=readFileSync('worker/public/nexo-historicos-v6.css','utf8');
const home=readFileSync('worker/public/index.html','utf8');
const app=readFileSync('worker/public/app.js','utf8');
test('V6: cada jogo tem uma rota e uma página independente',()=>{
 assert.match(html,/id="nx6-grid"/);
 assert.match(js,/new URLSearchParams\(location\.search\)/);
 assert.match(js,/\/historicos\.html\?jogo=/);
 assert.doesNotMatch(html,/\<script[^>]+\/app\.js/);
 assert.doesNotMatch(html,/nexo-cloud-v5-ui\.js|nexo-crash-v4-site\.js/);
});
test('V6: três pontos abre menu com plataforma e jogo',()=>{
 for(const id of ['nx6-menu-open','nx6-drawer','nx6-nav','nx6-search','nx6-menu-close'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/document\.createElement\('details'\)/);
 assert.match(js,/g\.platform/);
 assert.match(js,/aria-current/);
});
test('V6: página inicial não monta as telas duplicadas sobre o Double',()=>{
 assert.doesNotMatch(home,/<script[^>]+\/nexo-crash-v4-site\.js/);
 assert.doesNotMatch(home,/<script[^>]+\/nexo-cloud-v5-ui\.js/);
 assert.match(home,/href="\/historicos\.html"/);
 assert.match(app,/window\.location\.assign\('\/historicos\.html\?jogo='/);
});
test('V6: históricos do Crash preservados; consulta Cloud e R2 legado',()=>{
 assert.match(js,/\/api\/crash\/history\?limit=200/);
 assert.match(js,/\/api\/cloud\/history\?game_id=/);
 assert.match(js,/bestHistory/);
});
test('V6: Double é alimentado pelo endpoint existente e mantém pedras numeradas',()=>{
 assert.match(js,/\/api\/history\?game_id=blitz-double&limit=200/);
 assert.match(js,/nx6-double/);
 assert.match(css,/\.nx6-tile\.nx6-double/);
});
test('V6: nenhum código de envio para Telegram ou operações administrativas',()=>{
 assert.doesNotMatch(js,/sendMessage|sendSticker|sendAnimation|\/api\/adm\//);
 assert.doesNotMatch(js,/\bfetch\([^)]*method:\s*['"]POST/);
});
test('V6: fotos das pedras não misturam relógio nem duplicam DOM do Double',()=>{
 assert.match(html,/id="nx6-grid"/);
 assert.match(css,/\.nx6-time/);
 assert.doesNotMatch(js,/\bdocument\.getElementById\(['"]balls['"]\)/);
 assert.doesNotMatch(html,/id="balls"|id="nexo-v11-now"/);
});
