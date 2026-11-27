import test from 'node:test';import assert from 'node:assert/strict';import {wheelAround,renderMarkup,captureAdmin,captureResult,queueCapture,drainCaptureQueue} from '../worker/src/nexo-colors-capture-v2.js';
const t=()=>Math.floor(Date.now()/1000);const row={seq:123,number:9,color:'black',minute_epoch:1795738020};const evt={...row,id:'test-abcd-win_black',gameId:'blitz-double',roundId:'abcd',type:'win_black',at:t()};
function fake(){const docs=new Map();let screenshots=0;const png=new Uint8Array(120);png.set([137,80,78,71]);new DataView(png.buffer).setUint32(16,1440);new DataView(png.buffer).setUint32(20,700);return {docs,env:{R2:{list:async({prefix,limit})=>({objects:[...docs.keys()].filter(k=>k.startsWith(prefix)).sort().slice(0,limit).map(key=>({key}))}),delete:async k=>docs.delete(k),get:async k=>{const v=docs.get(k);return v===undefined?null:{json:async()=>JSON.parse(v),arrayBuffer:async()=>v.buffer}},put:async(k,v,opt)=>{if(opt?.onlyIf&&docs.has(k))return null;docs.set(k,v);return {key:k}}},ASSETS:{fetch:async()=>new Response('/* visual */')},NEXO_COLORS_BROWSER:{quickAction:async(a,o)=>{assert.equal(a,'screenshot');assert.equal(o.selector,'#nxr-panel');screenshots++;return new Response(png)}}},count:()=>screenshots};}
const cfg='nexo-v3/colors-capture-v1/config-v2.json';
test('15 posições circulares e horário real',()=>{for(let i=0;i<15;i++){const a=wheelAround(i);assert.equal(a.length,5);assert.equal(a[2],i);assert.equal(new Set(a).size,5);}assert.deepEqual(wheelAround(0),[12,4,0,11,5]);assert.deepEqual(wheelAround(9),[10,6,9,7,8]);const h=renderMarkup(row,'','');assert.match(h,/#123/);assert.match(h,/nxr-marker/);});
test('ADM exige prévia, salva e desliga',async()=>{const {env}=fake();const path='/api/adm/colors-capture';const req=(method,b)=>new Request('https://test'+path,{method,...(b?{body:JSON.stringify(b)}:{})});let r=await captureAdmin(req('GET'),env,path);assert.equal((await r.json()).config.enabled,false);r=await captureAdmin(req('PUT',{enabled:true,includeRed:false}),env,path);assert.equal(r.status,409);r=await captureAdmin(req('POST'),env,path+'/preview',async()=>({items:[row]}));assert.equal(r.headers.get('content-type'),'image/png');r=await captureAdmin(req('PUT',{enabled:true,includeRed:false}),env,path);assert.equal((await r.json()).config.enabled,true);r=await captureAdmin(req('PUT',{enabled:false,includeRed:true}),env,path);assert.equal((await r.json()).config.enabled,false);});
test('dedup por rodada/destino, só grupo confirmado, sem legenda',async()=>{const {env,docs,count}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,includeRed:false}));let calls=0;const opts={groups:async()=>[{id:'-12345',selected:true,admin:true},{id:'-54321',selected:true,admin:true}],sent:async id=>id==='-12345',send:async form=>{calls++;assert.equal(form.get('chat_id'),'-12345');assert.equal(form.has('caption'),false);return {message_id:7}}};await captureResult(env,evt,opts);await captureResult(env,evt,opts);await captureResult(env,{...evt,type:'red',seq:124},opts);assert.equal(calls,1);assert.equal(count(),1);});
test('entrega incerta não é repetida',async()=>{const {env,docs}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,includeRed:true}));let n=0;const opts={groups:async()=>[{id:'-12345',selected:true,admin:true}],sent:async()=>true,send:async()=>{n++;throw Error('timeout')}};await captureResult(env,evt,opts);await captureResult(env,evt,opts);assert.equal(n,1);});

test('fila separada: nenhum browser ou envio no evento, apenas no cron',async()=>{const {env,docs,count}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,enabledSince:t()-1}));let calls=0;const opts={groups:async()=>[{id:'-12345',selected:true,admin:true}],sent:async()=>true,send:async f=>{calls++;assert.equal(f.has('caption'),false);return {message_id:8}}};assert.equal(await queueCapture(env,evt),true);assert.equal(await queueCapture(env,evt),false);assert.equal(count(),0);assert.equal(calls,0);await drainCaptureQueue(env,opts);await drainCaptureQueue(env,opts);assert.equal(count(),1);assert.equal(calls,1);});
test('não captura entrada nem evento antigo e respeita desativação',async()=>{const {env,docs,count}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,enabledSince:t()-1}));assert.equal(await queueCapture(env,{...evt,type:'entry_black'}),false);assert.equal(await queueCapture(env,{...evt,at:t()-181}),false);assert.equal(await queueCapture(env,evt),true);docs.set(cfg,JSON.stringify({enabled:false,previewAt:1}));await drainCaptureQueue(env,{groups:async()=>{throw Error('não deveria enviar')}});assert.equal(count(),0);});

import {confirmedEntryText} from '../worker/src/nexo-colors-capture-v2.js';
test('cita apenas o texto original confirmado do mesmo ciclo e chat',async()=>{
 const e={...evt,strategyId:'st1',entryRoundId:'entry1'};
 const stage=(id,chat)=>({eventId:id,chatId:chat,confirmed:{text:{messageId:42}}});
 assert.equal(await confirmedEntryText(e,'-12345',async(id,chat)=>id==='st1_entry1_entry_black'?stage(id,chat):null),42);
 assert.equal(await confirmedEntryText(e,'-12345',async(id)=>stage(id,'-999')),null);
 assert.equal(await confirmedEntryText(e,'-12345',async(id,chat)=>stage(id,chat)),null);
 assert.equal(await confirmedEntryText(evt,'-12345',async()=>{throw Error('no lookup')}),null);
});
test('opção salva sem alterar ativação e mantém compatibilidade com clientes antigos',async()=>{
 const {env,docs}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,enabledSince:t()-10}));
 const path='/api/adm/colors-capture';const req=b=>new Request('https://test'+path,{method:'PUT',body:JSON.stringify(b)});
 let r=await captureAdmin(req({enabled:true,includeRed:false,replyToEntry:true}),env,path);
 const a=(await r.json()).config;assert.equal(a.replyToEntry,true);assert.equal(a.enabled,true);assert.equal(a.previewAt,1);
 r=await captureAdmin(req({enabled:true,includeRed:false}),env,path);assert.equal((await r.json()).config.replyToEntry,true);
 r=await captureAdmin(req({enabled:true,includeRed:false,replyToEntry:false}),env,path);assert.equal((await r.json()).config.replyToEntry,false);
});
test('fila conserva vínculo, usa ID por grupo, não coloca legenda, não duplica',async()=>{
 const {env,docs}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,replyToEntry:true}));
 const e={...evt,strategyId:'st1',entryRoundId:'entry1'};const calls=[];
 const opts={groups:async()=>[{id:'-12345',selected:true,admin:true},{id:'-54321',selected:true,admin:true}],sent:async()=>true,reply:async(chat,r)=>{assert.equal(r.entryRoundId,'entry1');assert.equal(r.strategyId,'st1');return chat==='-12345'?42:84;},send:async f=>{calls.push([f.get('chat_id'),JSON.parse(f.get('reply_parameters'))]);assert.equal(f.has('caption'),false);return {message_id:8}}};
 assert.equal(await queueCapture(env,e),true);await drainCaptureQueue(env,opts);await drainCaptureQueue(env,opts);
 assert.equal(calls.length,2);assert.deepEqual(Object.fromEntries(calls),{'-12345':{message_id:42,allow_sending_without_reply:true},'-54321':{message_id:84,allow_sending_without_reply:true}});
});
test('não cita mensagem errada se vínculo faltar; opção desligada preserva envio',async()=>{
 for(const enabled of [true,false]){const {env,docs}=fake();docs.set(cfg,JSON.stringify({enabled:true,previewAt:1,replyToEntry:enabled}));let n=0;
 await captureResult(env,evt,{groups:async()=>[{id:'-12345',selected:true,admin:true}],sent:async()=>true,reply:async()=>{if(!enabled)throw Error('lookup indevido');return null;},send:async f=>{n++;assert.equal(f.has('reply_parameters'),false);return {message_id:8}}});assert.equal(n,1);}
});
