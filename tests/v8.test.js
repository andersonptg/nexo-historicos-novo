import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAdmin} from '../worker/src/adm.js';
const secret='z'.repeat(40);
function setup(externalBot=false){
 const files=new Map(),calls=[];
 const R2={
   async get(key){return files.has(key)?{async json(){return JSON.parse(files.get(key));}}:null},
   async put(key,body){files.set(key,typeof body==='string'?body:JSON.stringify(body))},
   async delete(key){files.delete(key)},
   async list({prefix}){return {objects:[...files.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}}
 };
 const env={R2,NEXO_ADM_PASSWORD:'m'.repeat(36),NEXO_BOT_ENCRYPTION_KEY:secret};
 if(externalBot)env.NEXO_TELEGRAM_BOT_TOKEN='123456:'+('a'.repeat(32));
 const req=(path,method='GET',data=null,cookie='',extra={})=>new Request('https://nexo.test'+path,{
   method,headers:{Origin:'https://nexo.test',...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});
 const call=(path,method='GET',data=null,cookie='',extra={})=>{
   const r=req(path,method,data,cookie,extra);return routeAdmin(r,env,new URL(r.url))};
 async function login(){const r=await call('/api/adm/login','POST',{password:env.NEXO_ADM_PASSWORD});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
 return {files,calls,env,call,login,req};
}
async function secretFor(key){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('nexo-v4-webhook:'+key));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

test('V8: ID do Telegram só pode ser salvo por ADM e após cadastrar bot',async()=>{
 const s=setup();let r=await s.call('/api/adm/telegram/owner-id','PUT',{id:'123456789'});assert.equal(r.status,401);
 const cookie=await s.login();r=await s.call('/api/adm/telegram/owner-id','PUT',{id:'123456789'},cookie);assert.equal(r.status,409);
 s.env.NEXO_TELEGRAM_BOT_TOKEN='123456:'+('a'.repeat(32));
 for(const id of ['1','abc','-12345','00000123','123 456']){
  r=await s.call('/api/adm/telegram/owner-id','PUT',{id},cookie);assert.equal(r.status,400);
 }
 r=await s.call('/api/adm/telegram/owner-id','PUT',{id:'123456789'},cookie);assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.verified,false);
 assert.equal(JSON.parse(s.files.get('nexo-v3/telegram/owner-request.json')).id,'123456789');
});

test('V8: mensagem PRIVADA verifica ID real do remetente e captura mídias sem duplicar',async()=>{
 const s=setup(true),oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const method=String(url).split('/').pop();s.calls.push({method,args:JSON.parse(options.body||'{}')});
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true,username:'NEXO_TEST_BOT'}});
  if(method==='sendMessage')return Response.json({ok:true,result:{message_id:3}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://nexo.test/api/telegram/webhook'}});
  return Response.json({ok:true,result:true});
 };
 try{
  const cookie=await s.login();await s.call('/api/adm/telegram/owner-id','PUT',{id:'123456789'},cookie);
  const secret=await secretFor(s.env.NEXO_BOT_ENCRYPTION_KEY);
  const update=async(from,id,more={})=>s.call('/api/telegram/webhook','POST',{
   message:{from:{id:from},chat:{id,type:'private'},...more}},'',{'X-Telegram-Bot-Api-Secret-Token':secret});
  let r=await update(42,42,{text:'/start'});assert.equal(r.status,200);assert.equal(s.files.has('nexo-v3/telegram/owner.json'),false);
  r=await update(123456789,123456789,{text:'/start'});assert.equal(r.status,200);
  assert.equal(JSON.parse(s.files.get('nexo-v3/telegram/owner.json')).id,'123456789');
  const media={sticker:{file_id:'file-01',file_unique_id:'uniq-8',emoji:'⭐',file_size:1024}};
  await update(123456789,123456789,media);await update(123456789,123456789,media);
  const saved=JSON.parse(s.files.get('nexo-v3/media/catalog.json'));
  assert.equal(saved.length,1);assert.equal(saved[0].origin,'telegram');
  const status=(await(await s.call('/api/adm/telegram/status','GET',null,cookie)).json());
  assert.equal(status.ownerPaired,true);assert.equal(status.requestedId,'123456789');
  assert.equal(status.webhook,'connected');
 }finally{globalThis.fetch=oldFetch}
});

test('V8: remover bot requer confirmação, envio desligado e preserva mídia/estratégias',async()=>{
 const s=setup(),oldFetch=globalThis.fetch;let currentWebhook='https://nexo.test/api/telegram/webhook';
 globalThis.fetch=async(url,options={})=>{
  const method=String(url).split('/').pop();s.calls.push(method);
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true,username:'NEXO_TEST_BOT'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:currentWebhook}});
  if(method==='setWebhook'){currentWebhook=JSON.parse(options.body).url;return Response.json({ok:true,result:true})}
  if(method==='deleteWebhook'){currentWebhook='';return Response.json({ok:true,result:true})}
  return Response.json({ok:true,result:true});
 };
 try{
  const cookie=await s.login(),token='123456:'+('a'.repeat(32));
  let save=await s.call('/api/adm/bot/save','POST',{token},cookie);assert.equal(save.status,200);
  s.files.set('nexo-v3/media/catalog.json',JSON.stringify([{id:'x',kind:'sticker'}]));
  s.files.set('nexo-v3/admin/strategies.json',JSON.stringify([{id:'abc'}]));
  let r=await s.call('/api/adm/telegram/bot/remove','POST',{confirm:false},cookie);assert.equal(r.status,400);
  s.files.set('nexo-v3/admin/settings.json',JSON.stringify({botEnabled:true}));
  r=await s.call('/api/adm/telegram/bot/remove','POST',{confirm:true},cookie);assert.equal(r.status,409);
  s.files.set('nexo-v3/admin/settings.json',JSON.stringify({botEnabled:false}));
  r=await s.call('/api/adm/telegram/bot/remove','POST',{confirm:true},cookie);assert.equal(r.status,200);
  assert.equal(s.files.has('nexo-v3/telegram/bot-encrypted.json'),false);
  assert.equal(currentWebhook,'');assert.ok(s.calls.includes('deleteWebhook'));
  assert.ok(s.files.has('nexo-v3/media/catalog.json'));
  assert.ok(s.files.has('nexo-v3/admin/strategies.json'));
 }finally{globalThis.fetch=oldFetch}
});

test('V8: não remove webhook de OUTRO sistema e não altera sinais automaticamente',async()=>{
 const s=setup(),oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const method=String(url).split('/').pop();s.calls.push(method);
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true,username:'TEST_BOT'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://outro-sistema.example/webhook'}});
  return Response.json({ok:true,result:true});
 };
 try{
  const cookie=await s.login();const save=await s.call('/api/adm/bot/save','POST',{token:'123456:'+('a'.repeat(32))},cookie);assert.equal(save.status,200);
  const register=await s.call('/api/adm/webhook/register','POST',{},cookie);assert.equal(register.status,409);
  assert.ok(!s.calls.includes('setWebhook'));
  const settings=JSON.parse(s.files.get('nexo-v3/admin/settings.json')||'{}');
  assert.notEqual(settings.botEnabled,true);
 }finally{globalThis.fetch=oldFetch}
});

test('V8: status identifica Secret ausente sem revelar token',async()=>{
 const s=setup();s.files.set('nexo-v3/telegram/bot-encrypted.json',JSON.stringify({ciphertext:'not-a-real-ciphertext',iv:'test',username:'ARROZZAL_BOT'}));
 delete s.env.NEXO_BOT_ENCRYPTION_KEY;
 const cookie=await s.login(),r=await s.call('/api/adm/telegram/status','GET',null,cookie);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.configured,true);assert.equal(data.keyState,'missing');
 assert.equal(data.webhook,'error');assert.equal(JSON.stringify(data).includes('not-a-real-ciphertext'),false);
});
