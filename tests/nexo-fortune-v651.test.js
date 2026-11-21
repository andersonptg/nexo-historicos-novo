import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFortuneV65} from '../worker/src/nexo-fortune-v65.js';

const NOW=Date.parse('2026-11-20T16:45:00-03:00');
const asset=(i)=>i%11===0?'panda':i%2===0?'red-6':'purple-11';
function item(i,variant=asset(i)){
 const clock=`16:${String(44-Math.floor(i/2)).padStart(2,'0')}`;
 const x=variant==='panda'?'<span>9.74x</span>':'';
 return `<div class="contents"><div class="double-item"><button class="item relative mb-1 border" style="background-image: url(/images/fortune-doubles/${variant}.png)">${x}</button><div class="double-time">${clock}</div></div></div>`;
}
const doc=arr=>'<html><body><div class="results-panel">'+arr.join('')+'</div></body></html>';

test('V6.5.1: variante real red-6 identifica vermelho sem converter em número',()=>{
 const rows=parseFortuneV65(doc(Array.from({length:30},(_,i)=>item(i))),NOW);
 assert.equal(rows.length,30);
 assert.equal(rows[2].color,'red');
 assert.equal(rows[2].number,undefined);
 assert.ok(rows.every(x=>['red','purple','gold'].includes(x.color)));
});
test('V6.5.1: variantes numeradas roxas e Panda preservam cor e multiplicador',()=>{
 const rows=parseFortuneV65(doc(Array.from({length:30},(_,i)=>item(i))),NOW);
 assert.equal(rows[1].color,'purple');
 assert.equal(rows[0].color,'gold');
 assert.equal(rows[0].multiplier,9.74);
 assert.equal(rows[1].multiplier,undefined);
 assert.equal(rows[0].minute_epoch,rows[1].minute_epoch);
});
test('V6.5.1: rejeita imagem de cor desconhecida ou sufixo numerico inesperado',()=>{
 for(const unknown of ['blue-9','red-99','purple-999']){
  const html=doc([item(0,unknown),...Array.from({length:20},(_,i)=>item(i+1))]);
  assert.throws(()=>parseFortuneV65(html,NOW),/FORTUNE_VARIANTE_DESCONHECIDA/);
 }
});
