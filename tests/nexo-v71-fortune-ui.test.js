import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync('worker/public/fortune-studio.html','utf8'),js=readFileSync('worker/public/nexo-fortune-v71.js','utf8'),css=readFileSync('worker/public/nexo-fortune-v71.css','utf8'),adm=readFileSync('worker/public/adm.html','utf8'),historic=readFileSync('worker/public/historicos.html','utf8');
test('Fortune: own studio with builder, validator, saved, history, bot and stickers',()=>{
 for(const s of ['builder','validator','saved','history','robot','media'])assert.match(html,new RegExp('data-area="'+s+'"'));
 assert.match(js,/patternView/);assert.match(js,/strategies\//);assert.match(js,/groups\/refresh/);assert.match(js,/bot\/connect/);assert.match(js,/bot\/test/);
});
test('Fortune: panda image glyph and separate red purple gold CSS',()=>{assert.match(js,/🐼/);for(const c of ['red','purple','gold'])assert.match(css,new RegExp('\\.fv-stone\\.'+c));assert.match(js,/pandaDisplay/)});
test('Fortune: Crash strategy panel hidden from ADM, its historical data never deleted',()=>{assert.match(adm,/data-nexo-fortune="v71"/);assert.doesNotMatch(adm,/data-nexo-studio="v70"/);assert.doesNotMatch(adm,/src="\/nexo-crash-v2-adm\.js/);assert.match(historic,/nexo-fortune-validate-link/);});
