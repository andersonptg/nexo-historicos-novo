import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NexoCloudCollector,cloudTest} from '../worker/src/nexo-cloud-v5.js';
const read=x=>readFileSync(x,'utf8');
test('V6.6: Double usa grade oito, sem mudar estilos Crash/Fortune',()=>{
 const css=read('worker/public/nexo-visual-v66.css');
 const js=read('worker/public/nexo-historicos-v6.js');
 const html=read('worker/public/historicos.html');
 assert.match(css,/body\.nx6-double-visual \.nx6-grid/);
 assert.match(css,/repeat\(8,minmax\(0,1fr\)\)/);
 assert.match(js,/classList\.toggle\('nx6-double-visual'/);
 assert.match(html,/nexo-visual-v66\.css/);
});
test('V6.6: histórico Blitz Double compara legado e Cloud; sem rodadas artificiais',()=>{
 const js=read('worker/public/nexo-historicos-v6.js');
 assert.match(js,/\/api\/history\?game_id=blitz-double&limit=200/);
 assert.match(js,/\/api\/cloud\/history\?game_id=blitz-double&limit=200/);
 assert.match(js,/bestHistory\(legacy,cloud\)/);
 assert.doesNotMatch(js,/Math\.random/);
});
test('V6.6: so jogos elegiveis sao candidatos a coleta',()=>{
 assert.equal(cloudTest.GAMES.length,50);
 assert.equal(cloudTest.GAMES.filter(g=>g.eligible).length,29);
});
test('V6.6: cron inicia sozinho e pausa manual nao religara',async()=>{
 const records=new Map(); let alarm=null;
 const storage={get:async k=>records.get(k),put:async(k,v)=>records.set(k,v),getAlarm:async()=>alarm,setAlarm:async v=>{alarm=v},deleteAlarm:async()=>{alarm=null}};
 const objects=new Map();
 const env={NEXO_CLOUD_AUTOSTART:'1',R2:{get:async k=>objects.has(k)?{json:async()=>objects.get(k)}:null,put:async(k,v)=>objects.set(k,JSON.parse(v))}};
 const e=new NexoCloudCollector({storage},env);
 let d=await (await e.fetch(new Request('https://nexo.internal/cloud/kick',{method:'POST'}))).json();
 assert.equal(d.running,true); assert.ok(alarm>0);
 d=await (await e.fetch(new Request('https://nexo.internal/cloud/pause',{method:'POST'}))).json();
 assert.equal(d.running,false);assert.equal(alarm,null);
 d=await (await e.fetch(new Request('https://nexo.internal/cloud/kick',{method:'POST'}))).json();
 assert.equal(d.running,false); assert.equal(alarm,null);
 d=await (await e.fetch(new Request('https://nexo.internal/cloud/start',{method:'POST',body:JSON.stringify({batch:4})}))).json();
 assert.equal(d.running,true);
});
