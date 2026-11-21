import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFortuneV65} from '../worker/src/nexo-fortune-v65.js';

const NOW = Date.parse('2026-11-20T18:45:00-03:00');
function item(i, asset) {
  const minute=44-Math.floor(i/2);
  const clock='18:'+String(minute).padStart(2,'0');
  const val=asset.startsWith('panda')?'<span>9.74x</span>':'';
  return `<div class="contents"><div class="double-item"><button class="item relative mb-1 border" style="background-image: url(/images/fortune-doubles/${asset}.png)">${val}</button><div class="double-time">${clock}</div></div></div>`;
}
function html(assets){return '<html><body><div class="results-panel">'+assets.map((v,i)=>item(i,v)).join('')+'</div></body></html>';}
const colors=Array.from({length:30},(_,i)=>i%10===0?'panda':i%2===0?'red-4':'black-10');

test('V6.5.2: red-4 e black-10 sao reconhecidos sem mudar Double convencional',()=>{
 const rows=parseFortuneV65(html(colors),NOW);
 assert.equal(rows.length,30);
 assert.equal(rows[0].color,'gold');
 assert.equal(rows[1].color,'purple');
 assert.equal(rows[2].color,'red');
 assert.equal(rows[1].number,undefined);
 assert.equal(rows[2].number,undefined);
 assert.equal(rows[0].multiplier,9.74);
 assert.equal(rows[1].multiplier,undefined);
});
test('V6.5.2: preserva varias rodadas no mesmo minuto e cronologia da fonte',()=>{
 const rows=parseFortuneV65(html(colors),NOW);
 assert.equal(rows[0].minute_epoch,rows[1].minute_epoch);
 assert.ok(rows.every((x,i)=>i===0||x.minute_epoch<=rows[i-1].minute_epoch));
});
test('V6.5.2: suporta black-8 a black-14 e black sem sufixo',()=>{
 for(const asset of ['black','black-8','black-9','black-10','black-11','black-12','black-13','black-14']){
  const rows=parseFortuneV65(html([asset,...colors]),NOW);
  assert.equal(rows[0].color,'purple',asset);
 }
});
test('V6.5.2: rejeita nomes desconhecidos e variantes numericas fora do limite',()=>{
 for(const asset of ['black-15','black-99','blue-10','black-0','red-99']){
  assert.throws(()=>parseFortuneV65(html([asset,...colors]),NOW),/FORTUNE_VARIANTE_DESCONHECIDA/,asset);
 }
});
test('V6.5.2: preserva rejeicao de multiplicador em cor comum',()=>{
 const withInvalid=html(['black-10',...colors]).replace('double-time','double-time');
 const bad=withInvalid.replace('black-10.png)"></button>', 'black-10.png)"><span>9.74x</span></button>');
 assert.throws(()=>parseFortuneV65(bad,NOW),/FORTUNE_MULTIPLICADOR_FORA_DO_PANDA/);
});
