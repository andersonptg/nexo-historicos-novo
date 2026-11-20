import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudTest} from '../worker/src/nexo-cloud-v5.js';
import catalog from '../catalog-cloud.json' with {type:'json'};
const crash={kind:'multiplier',id:'blitz-crash'};
function fixture(muls,head='<b>Crash</b><span>Conectando</span><span>200 Resultados</span>'){
 const hh='11';let minute=59;
 return '<!doctype html><html><body>'+head+muls.map(v=>`<div>${v}x</div><time>${hh}:${String(minute--).padStart(2,'0')}</time>`).join('')+'</body></html>';
}
test('V6.4: encontra 12 pares multiplier/horario mesmo com cabecalho dividido',()=>{
 const d=cloudTest.sourceRows(fixture(['1.21','3.35','1','5.83','1.07','20.01','1.48','5.83','1.5','1.6','1.7','1.8']),crash);
 assert.equal(d.length,12);
 assert.equal(d[0].multiplier,1.21);
 assert.equal(d[2].multiplier,1);
 assert.ok(d.every(x=>Number.isInteger(x.minute_epoch)&&x.minute_epoch>0));
 assert.ok(d.every((x,i)=>i===0||x.minute_epoch<=d[i-1].minute_epoch));
});
test('V6.4: rejeita explicacoes isoladas do site que nao sao rodadas',()=>{
 assert.throws(()=>cloudTest.sourceRows('<h1>Crash</h1><p>Ex.: 2x e 10x. Horario 13:30.</p>',crash),/FORMATO_NAO_RECONHECIDO/);
});
test('V6.4: URLs corretas do catalogo para os cinco HTTP 404',()=>{
 const cases={'trade-dolar-double':'/results/tradedolar/double','casa-campea-double':'/results/casacampea/double','casa-campea-crash':'/results/casacampea/crash','dezenas-club-aviator':'/results/dezenasclub/aviator','dezenas-club-aviator-2':'/results/dezenasclub/aviator-2'};
 for(const [id,path] of Object.entries(cases)){
  const g=catalog.games.find(x=>x.id===id);assert.ok(g,id);
  assert.equal(new URL(g.source_url).pathname,path);
 }
});
