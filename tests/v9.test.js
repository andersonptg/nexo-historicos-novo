import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAdmin,processNewRounds} from '../worker/src/adm.js';

test('V9: liga com chat privado verificado sem mensagem global, envia ativacao e sinais no privado primeiro',async()=>{
 const store=new Map(),sent=[];
 const R2={
  get:async key=>store.has(key)?{json:async()=>structuredClone(JSON.parse(store.get(key)))}:null,
  put:async(key,value)=>{store.set(key,typeof value==='string'?value:JSON.stringify(value))},
  delete:async key=>store.delete(key),
  list:async({prefix})=>({objects:[...store.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false})
 };
 const env={R2,NEXO_ADM_PASSWORD:'v'.repeat(36),NEXO_TELEGRAM_BOT_TOKEN:'123456:'+('a'.repeat(32)),NEXO_TELEGRAM_WEBHOOK_SECRET:'secret-webhook-v9-testing-1234567890'};
 const request=(p,method='GET',payload=null,cookie='',headers={})=>{
  const req=new Request('https://nexo.test'+p,{method,headers:{Origin:'https://nexo.test',...(cookie?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{}),...headers},...(payload?{body:JSON.stringify(payload)}:{})});
  return routeAdmin(req,env,new URL(req.url));
 };
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const method=String(url).split('/').at(-1);
  const args=options.body instanceof FormData?{}:JSON.parse(options.body||'{}');
  if(method==='sendMessage')sent.push({to:String(args.chat_id),text:args.text});
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true,username:'V9_TEST'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://nexo.test/api/telegram/webhook'}});
  if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator',can_post_messages:true}});
  return Response.json({ok:true,result:true});
 };
 try{
  let r=await request('/api/adm/login','POST',{password:env.NEXO_ADM_PASSWORD});
  assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
  r=await request('/api/adm/telegram/owner-id','PUT',{id:'123456789'},cookie);
  assert.equal(r.status,200);
  r=await request('/api/telegram/webhook','POST',{message:{chat:{id:123456789,type:'private'},from:{id:123456789},text:'/start'}},'',{'X-Telegram-Bot-Api-Secret-Token':env.NEXO_TELEGRAM_WEBHOOK_SECRET});
  assert.equal(r.status,200);
  assert.equal(JSON.parse(store.get('nexo-v3/telegram/owner.json')).id,'123456789');
  const strategy=(await(await request('/api/adm/strategies','POST',{name:'V9 Teste',pattern:['red'],target:'black',maxGale:2,messages:{}},cookie)).json()).strategy;
  r=await request('/api/adm/strategies/'+strategy.id,'PUT',{...strategy,enabled:true},cookie);
  assert.equal(r.status,200);
  sent.length=0;
  r=await request('/api/adm/telegram/activate','POST',{confirm:true},cookie);
  assert.equal(r.status,200);
  const activation=await r.json();assert.equal(activation.privateFirst,true);
  assert.ok(sent.some(v=>v.to==='123456789'&&v.text.includes('ROBÔ ATIVADO')));
  assert.ok(sent.every(v=>v.to==='123456789'));
  const stamp=Math.floor(Date.now()/60000)*60;
  await processNewRounds(env,{id:'brabet-double'},[{id:'a'.repeat(32),seq:1,number:4,color:'red',minute_epoch:stamp}]);
  assert.ok(sent.some(v=>v.to==='123456789'&&v.text.includes('ENTRADA CONFIRMADA')),'entrada padrao sem cadastro manual');
  assert.equal([...store.keys()].filter(k=>k.startsWith('nexo-v3/outbox/sent/')).length>=2,true);
  // Existing model/config remains unmigrated: no synthetic global template objects.
  assert.equal(store.has('nexo-v3/admin/global-signals.json'),false);
 }finally{globalThis.fetch=old}
});
