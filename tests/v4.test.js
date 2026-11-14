import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
function make(){
 const store=new Map();const R2={
 get:async key=>store.has(key)?{json:async()=>JSON.parse(store.get(key)),arrayBuffer:async()=>new TextEncoder().encode(store.get(key)).buffer,body:store.get(key)}:null,
 put:async(k,v)=>{store.set(k,v);return {}},delete:async k=>{store.delete(k)},
 list:async({prefix,limit=500})=>({objects:[...store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false})
 };
 const env={R2,NEXO_V1_INGEST_TOKEN:'x'.repeat(48),NEXO_ADM_PASSWORD:'a'.repeat(38),NEXO_BOT_ENCRYPTION_KEY:'P'.repeat(45),ASSETS:{fetch:async()=>new Response('HTML')}};
 const request=(path,options={})=>new Request('https://nexo.test'+path,{...options,headers:{Origin:'https://nexo.test',...(options.headers||{})}});
 async function auth(){const r=await worker.fetch(request('/api/adm/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:env.NEXO_ADM_PASSWORD})}),env);assert.equal(r.status,200);return r.headers.get('Set-Cookie').split(';')[0];}
 const post=(path,body,cookie)=>worker.fetch(request('/api/adm/'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)}),env);
 return {store,env,request,auth,post};
}
const rawToken='123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';
test('V4 bot registration is authenticated, encrypted at rest; secret absent refuses',async()=>{
 const {env,store,request,auth,post}=make();const old=globalThis.fetch;
 globalThis.fetch=async url=>{const method=String(url).split('/').at(-1);
  if(method==='getMe')return Response.json({ok:true,result:{is_bot:true,id:123456,username:'NexoDemoBot'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:''}});
  if(method==='setWebhook')return Response.json({ok:true,result:true});
  return Response.json({ok:false,description:'unsupported'},{status:400});
 };
 try{
  const c=await auth();
  assert.equal((await post('bot/save',{token:rawToken},'')).status,401);
  const backup=env.NEXO_BOT_ENCRYPTION_KEY;delete env.NEXO_BOT_ENCRYPTION_KEY;
  const noKey=await post('bot/save',{token:rawToken},c);assert.equal(noKey.status,503);env.NEXO_BOT_ENCRYPTION_KEY=backup;
  const r=await post('bot/save',{token:rawToken},c);assert.equal(r.status,200);const out=await r.json();assert.equal(out.bot.username,'NexoDemoBot');assert.equal(out.notified,false);assert.equal(out.webhook,'conectado');
  const stored=store.get('nexo-v3/telegram/bot-encrypted.json');assert.ok(stored);assert.ok(!stored.includes(rawToken));
  const boot=await worker.fetch(request('/api/adm/bootstrap',{headers:{Cookie:c}}),env);const b=await boot.json();assert.equal(b.telegramConfigured,true);assert.equal(b.botName,'NexoDemoBot');assert.ok(!JSON.stringify(b).includes(rawToken));
  assert.equal((await post('bot/save',{token:'not-token'},c)).status,400);
 }finally{globalThis.fetch=old}
});
test('V4 owner verifies pairing, receives confirmation; stickers & animations are imported only from owner',async()=>{
 const {env,store,request,auth,post}=make();const calls=[];const old=globalThis.fetch;
 globalThis.fetch=async (url,opts)=>{const method=String(url).split('/').at(-1),body=opts.body instanceof FormData?{}:JSON.parse(opts.body);calls.push({method,body});
  if(method==='getMe')return Response.json({ok:true,result:{is_bot:true,id:123456,username:'NexoDemoBot'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:''}});
  if(method==='setWebhook')return Response.json({ok:true,result:true});
  if(method==='sendMessage')return Response.json({ok:true,result:{message_id:12}});
  if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator'}});
  return Response.json({ok:false,description:'unknown'},{status:400});
 };
 try{
  const c=await auth();await post('bot/save',{token:rawToken},c);
  const pair=await(await post('bot/pair',{},c)).json();assert.ok(/^\/vincular [A-Z0-9]{10}$/.test(pair.command));
  const doc=store.get('nexo-v3/telegram/pair.json');assert.ok(doc&&!doc.includes(pair.command.split(' ')[1]));
  // Webhook header derived from Cloudflare encryption secret, not from public script
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('nexo-v4-webhook:'+env.NEXO_BOT_ENCRYPTION_KEY)));
  const secret=[...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
  const webhook=async message=>worker.fetch(request('/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({message})}),env);
  const fakeSticker={file_id:'CAACAgIAAxkBA',file_unique_id:'unique-one',emoji:'✅',file_size:1200};
  await webhook({chat:{id:888,type:'private'},from:{id:888},sticker:fakeSticker});
  assert.equal(JSON.parse(store.get('nexo-v3/media/catalog.json')||'[]').length,0);
  const linked=await webhook({chat:{id:888,type:'private'},from:{id:888},text:pair.command});assert.equal(linked.status,200);
  assert.equal(JSON.parse(store.get('nexo-v3/telegram/owner.json')).id,'888');
  assert.ok(calls.some(x=>x.method==='sendMessage'&&x.body.text.includes('ROBÔ CADASTRADO COM SUCESSO')));
  await webhook({chat:{id:999,type:'private'},from:{id:999},sticker:{file_id:'other',file_unique_id:'other'}});
  await webhook({chat:{id:888,type:'private'},from:{id:888},sticker:fakeSticker});
  await webhook({chat:{id:888,type:'private'},from:{id:888},sticker:fakeSticker});
  await webhook({chat:{id:888,type:'private'},from:{id:888},animation:{file_id:'CgACAg',file_unique_id:'gif-one',file_size:20000}});
  const catalog=JSON.parse(store.get('nexo-v3/media/catalog.json'));
  assert.equal(catalog.length,2);assert.equal(catalog[0].kind,'sticker');assert.equal(catalog[1].kind,'gif');assert.ok(catalog.every(x=>x.origin==='telegram'));
  // Resaving same token notifies already linked administrator without revealing token
  const next=await(await post('bot/save',{token:rawToken},c)).json();assert.equal(next.notified,true);
  assert.equal((await post('bot/pair',{},'')).status,401);
 }finally{globalThis.fetch=old}
});
test('V4 never overrides a foreign webhook, preserving other bot service',async()=>{
 const {env,request,auth,post}=make();const old=globalThis.fetch;let sets=0;
 globalThis.fetch=async url=>{const method=String(url).split('/').at(-1);
  if(method==='getMe')return Response.json({ok:true,result:{is_bot:true,id:12,username:'NexoDemoBot'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://antigo.exemplo/api/telegram'}});
  if(method==='setWebhook'){sets++;return Response.json({ok:true,result:true})}
  return Response.json({ok:true,result:{status:'administrator'}})};
 try{const c=await auth();const d=await(await post('bot/save',{token:rawToken},c)).json();assert.equal(d.webhook,'outro sistema');assert.equal(sets,0);
 const r=await worker.fetch(request('/api/adm/webhook/register',{method:'POST',headers:{Cookie:c}}),env);assert.equal(r.status,409);assert.equal(sets,0);
 }finally{globalThis.fetch=old}
});
