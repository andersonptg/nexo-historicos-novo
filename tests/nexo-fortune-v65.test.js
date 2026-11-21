import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFortuneV65} from '../worker/src/nexo-fortune-v65.js';
import {cloudTest} from '../worker/src/nexo-cloud-v5.js';
const NOW=Date.parse('2026-11-20T18:36:00-03:00');
function item(n,opt={}){
 const minutes=18*60+36-Math.floor(n/2); const time=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
 const kind=opt.type||(n%10===0?'panda':n%2===0?'red':'purple');
 const style=kind==='panda'?" style='background-image: url(/images/fortune-doubles/panda.png)'":kind==='red'?" style='background-image: url(/images/fortune-doubles/red.png)'":'';
 const val=kind==='panda'?'<span>8.50x</span>':'';
 return `<div class="contents"><div class="double-item" style="left: ; top: ;"><button class="item relative mb-1 border"${style}>${val}</button><div class="double-time">${time}</div></div></div>`;
}
const doc=items=>'<html><body><div class="results-panel">'+items.join('')+'</div></body></html>';
const html=doc(Array.from({length:120},(_,i)=>item(i)));
test('V6.5: Fortune Double identifica 120 resultados na ordem, inclusive duas rodadas no mesmo minuto',()=>{
 const rows=parseFortuneV65(html,NOW);assert.equal(rows.length,120);
 assert.equal(rows[0].color,'gold');assert.equal(rows[0].multiplier,8.5);
 assert.equal(rows[1].color,'purple');assert.equal(rows[2].color,'red');
 assert.equal(rows[0].minute_epoch,rows[1].minute_epoch);
 assert.ok(rows.every((x,i)=>i===0||x.minute_epoch<=rows[i-1].minute_epoch));
});
test('V6.5: rejeita Panda confundido com resultado comum e multiplicador fora de Panda',()=>{
 const bad=doc([item(0,{type:'red'}).replace('</button>','<span>8.5x</span></button>'),...Array.from({length:9},(_,i)=>item(i+1))]);
 assert.throws(()=>parseFortuneV65(bad,NOW),/MULTIPLICADOR_FORA_DO_PANDA/);
});
test('V6.5: não classifica cores sem vermelho e Panda reconhecidos',()=>{
 const bad=doc(Array.from({length:10},(_,i)=>item(i,{type:'purple'})));
 assert.throws(()=>parseFortuneV65(bad,NOW),/ROXO_NAO_VALIDADO/);
});
test('V6.5: multiplicador Gold não aparece nas rodadas roxas/vermelhas',()=>{
 const rows=parseFortuneV65(html,NOW);
 assert.ok(rows.every(r=>r.color==='gold'||!('multiplier' in r)));
});
test('V6.5: cloud mantém os 50 jogos, os demais parsers e o armazenamento por jogo',()=>{
 assert.equal(cloudTest.GAMES.length,50);
 const fortune=cloudTest.GAMES.find(x=>x.id==='blitz-fortune-double');
 assert.equal(fortune.kind,'fortune-double');assert.equal(fortune.eligible,true);
 assert.equal(cloudTest.GAMES.filter(x=>x.platform==='Blitz').length,5);
 assert.equal(cloudTest.GAMES.filter(x=>x.platform==='Blitz'&&x.eligible).length,5);
 const parse=cloudTest.sourceRows(html,fortune,NOW);
 assert.deepEqual(parse,parseFortuneV65(html,NOW));
 assert.equal(cloudTest.firstOverlap(parse,parse.slice(5),fortune).index,0);
});
