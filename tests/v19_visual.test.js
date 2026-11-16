import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const asset=p=>readFileSync(new URL('../worker/public/pedras-v19/'+p,import.meta.url));

test('V19: site e ADM incluem estilo e JS sem alterar a API do motor',()=>{
  for(const p of ['worker/public/index.html','worker/public/adm.html']){
    const h=source(p);
    assert.equal(h.split('nexo-v19.css?v=19.0.0').length-1,1);
    assert.equal(h.split('nexo-v19.js?v=19.0.0').length-1,1);
    assert.ok(h.indexOf('nexo-v19.js')>h.indexOf('app.js') || p.includes('adm.html'));
  }
  const js=source('worker/public/nexo-v19.js');
  assert.ok(js.includes('nexo-v19-theme'));
  assert.ok(js.includes('nexo-v19-time'));
  assert.ok(js.includes('nexo-v19-numbers'));
  assert.ok(js.includes('organizeEditor'));
  assert.ok(!js.includes('fetch('),'UI nao deve fazer novas consultas de rede ou enviar Telegram');
});

test('V19: as 15 pedras correspondem a PNGs separados e validos',()=>{
  for(let n=0;n<=14;n++){
    const buf=asset(String(n).padStart(2,'0')+'.png');
    assert.ok(buf.length>1500);
    assert.equal(buf.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(buf.readUInt32BE(16),192);
    assert.equal(buf.readUInt32BE(20),192);
    assert.equal(buf[25],6,'PNG RGBA com transparencia');
  }
  for(const c of ['red','black'])assert.equal(asset('cor_'+c+'.png').readUInt32BE(16),192);
});

test('V19: hora fica fora da imagem e sistema mantem minutos da fonte',()=>{
  const s=source('worker/public/app.js');
  const css=source('worker/public/nexo-v19.css');
  assert.ok(s.includes('cell.dataset.nexoEpoch'));
  assert.ok(s.includes('cell.dataset.nexoObserved'));
  assert.ok(css.includes('.balls .stone small'));
  assert.ok(css.includes('#page-estrategias.v17-edit-open'));
});
