import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
function setup(){
 const store=new Map();const bucket={
  get:async key=>store.has(key)?{json:async()=>JSON.parse(store.get(key).body),arrayBuffer:async()=>new TextEncoder().encode(store.get(key).body).buffer,body:store.get(key).body,etag:'x'}:null,
  put:async(key,body)=>{store.set(key,{body});return {etag:'x'}},
  delete:async key=>{store.delete(key)},
  list:async({prefix,limit=500})=>({objects:[...store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false})
 };
 const env={R2:bucket,NEXO_V1_INGEST_TOKEN:'v'.repeat(48),NEXO_ADM_PASSWORD:'h'.repeat(38),ASSETS:{fetch:async()=>new Response('<html>ADM</html>')}};
 const req=(path,options={})=>new Request('https://nexo.test'+path,{...options,headers:{Origin:'https://nexo.test',...(options.headers||{})}});
 const reqBody=(path,method,body,cookie)=>req(path,{method,headers:{'Content-Type':'application/json',Cookie:cookie||''},body:JSON.stringify(body)});
 async function auth(){const r=await worker.fetch(reqBody('/api/adm/login','POST',{password:env.NEXO_ADM_PASSWORD}),env);assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];return cookie}
 return {store,bucket,env,req,reqBody,auth};
}
test('V3 ADM refuses unauthenticated writes and protects login',async()=>{
 const {env,req,reqBody,auth}=setup();
 const u=await worker.fetch(req('/api/adm/bootstrap'),env);assert.equal(u.status,401);
 const wrong=await worker.fetch(reqBody('/api/adm/login','POST',{password:'wrong'}),env);assert.equal(wrong.status,401);
 const cookie=await auth();const ok=await worker.fetch(req('/api/adm/bootstrap',{headers:{Cookie:cookie}}),env);
 assert.equal(ok.status,200);const data=await ok.json();assert.deepEqual(data.strategies,[]);
 const csrf=await worker.fetch(new Request('https://nexo.test/api/adm/settings',{method:'PUT',headers:{Origin:'https://other.test',Cookie:cookie,'Content-Type':'application/json'},body:'{}'}),env);assert.equal(csrf.status,403);
});
test('ADM create/update strategy, separate black/red messages, no automatic Gale text',async()=>{
 const {env,reqBody,req,auth}=setup(),cookie=await auth();
 const b={name:'Teste Double',gameId:'brabet-double',target:'black',pattern:['red','*'],maxGale:1,enabled:true,messages:{entry_black:'Entrada PRETO\nAté Gale 1',entry_red:'Entrada VERMELHO SEM GALE'},media:{entry_black:{type:'text',assetId:''}}};
 const r=await worker.fetch(reqBody('/api/adm/strategies','POST',b,cookie),env);assert.equal(r.status,200);const created=(await r.json()).strategy;
 assert.equal(created.enabled,false);assert.equal(created.messages.entry_black,'Entrada PRETO\nAté Gale 1');assert.equal(created.messages.entry_red,'Entrada VERMELHO SEM GALE');
 assert.equal(created.maxGale,1);assert.equal(created.messages.gale2,'');
 const patch={...created,name:'Teste EDITADA',maxGale:2,messages:{...created.messages,entry_black:'Texto livre',gale2:'- - - GALE 2 - - -'},enabled:true};
 const a=await worker.fetch(reqBody('/api/adm/strategies/'+created.id,'PUT',patch,cookie),env);assert.equal(a.status,200);const updated=(await a.json()).strategy;assert.equal(updated.enabled,true);assert.equal(updated.messages.entry_black,'Texto livre');
 const sim=await worker.fetch(reqBody('/api/adm/strategies/'+created.id+'/simulate','POST',{},cookie),env);assert.equal(sim.status,200);
 const boot=await (await worker.fetch(req('/api/adm/bootstrap',{headers:{Cookie:cookie}}),env)).json();assert.equal(boot.strategies.length,1);
});
test('V3 automatic score flow processes only new rounds, with Gale 1 and separate white/red',async()=>{
 const {env,reqBody,req,auth}=setup(),cookie=await auth(),stamp=Math.floor(Date.now()/1000)-200;
 const s=(await(await worker.fetch(reqBody('/api/adm/strategies','POST',{name:'Regra TESTE',target:'black',pattern:['red'],maxGale:1,messages:{entry_black:'ENTRADA',gale1:'GALE 1',win_black:'GANHOU'}},cookie),env)).json()).strategy;
 await worker.fetch(reqBody('/api/adm/strategies/'+s.id,'PUT',{...s,enabled:true},cookie),env);
 async function ingest(n,color,seq){const row={id:seq.toString(16).padStart(32,'a'),minute_epoch:stamp+seq*60,number:n,color,seq};const r=await worker.fetch(req('/api/ingest',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.NEXO_V1_INGEST_TOKEN},body:JSON.stringify({game_id:'brabet-double',items:[row]})}),env);assert.equal(r.status,200);return row}
 await ingest(1,'red',1);await ingest(5,'red',2);await ingest(9,'black',3);
 const all=await(await worker.fetch(req('/api/adm/scores',{headers:{Cookie:cookie}}),env)).json();const sc=all.scores[0];
 assert.equal(sc.entries,1);assert.equal(sc.gale1,1);assert.equal(sc.green,1);assert.equal(sc.red,0);
 assert.equal(all.scores.length,1);
});
test('ADM groups cannot be selected if bot is not administrator',async()=>{
 const {env,reqBody,auth}=setup(),cookie=await auth();
 const r=await worker.fetch(reqBody('/api/adm/groups/selection','PUT',{ids:['-1234']},cookie),env);
 assert.equal(r.status,400);
});
test('V3 webhook rejects unauthenticated Telegram events',async()=>{
 const {env,reqBody}=setup();env.NEXO_TELEGRAM_WEBHOOK_SECRET='s'.repeat(25);
 const r=await worker.fetch(reqBody('/api/telegram/webhook','POST',{my_chat_member:{chat:{id:-12,type:'supergroup',title:'X'}}}),env);
 assert.equal(r.status,401);
});
test('V3 cannot change history storage prefix',async()=>{
 const {env,store,reqBody,auth}=setup(),cookie=await auth();
 await worker.fetch(reqBody('/api/adm/settings','PUT',{showNumbers:false,resetMidnight:false},cookie),env);
 assert.ok([...store.keys()].every(k=>k.startsWith('nexo-v3/')));
});

test('V3 discovers only group where the bot is ADM, and Telegram sends only after explicit enable',async()=>{
 const {env,reqBody,req,store,auth}=setup(),cookie=await auth(),stamp=Math.floor(Date.now()/1000)-180;
 env.NEXO_TELEGRAM_BOT_TOKEN='123456:fake_bot_token_for_tests';
 env.NEXO_TELEGRAM_WEBHOOK_SECRET='secrettoken0123456789abcd';
 const outbound=[];const old=globalThis.fetch;
 globalThis.fetch=async (url,opts)=>{
  const method=String(url).split('/').at(-1);const args=opts.body instanceof FormData?{}:JSON.parse(opts.body);
  outbound.push({method,args});
  if(method==='getMe')return Response.json({ok:true,result:{id:150,username:'nexotest'}});
  if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator'}});
  if(method==='sendMessage')return Response.json({ok:true,result:{message_id:31}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:''}});
  if(method==='setWebhook')return Response.json({ok:true,result:true});
  return Response.json({ok:false,description:'Unknown method'},{status:400});
 };
 try{
  const wh=await worker.fetch(req('/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.NEXO_TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify({my_chat_member:{chat:{id:-100123,type:'supergroup',title:'NEXO SIG'}}})}),env);
  assert.equal(wh.status,200);
  const gs=(await (await worker.fetch(req('/api/adm/groups',{headers:{Cookie:cookie}}),env)).json()).groups;
  assert.equal(gs[0].admin,true);assert.equal(gs[0].selected,false);
  const saved=await worker.fetch(reqBody('/api/adm/groups/selection','PUT',{ids:[gs[0].id]},cookie),env);assert.equal(saved.status,200);
  const s=(await(await worker.fetch(reqBody('/api/adm/strategies','POST',{name:'Estrategia NEXO',target:'black',pattern:['red'],maxGale:0,messages:{entry_black:'PRETO + BRANCO'}},cookie),env)).json()).strategy;
  await worker.fetch(reqBody('/api/adm/strategies/'+s.id,'PUT',{...s,enabled:true},cookie),env);
  let entries=0;
  async function ingest(seq,color,n){const r={id:seq.toString(16).padStart(32,'a'),minute_epoch:stamp+seq*60,color,number:n,seq};return worker.fetch(req('/api/ingest',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.NEXO_V1_INGEST_TOKEN},body:JSON.stringify({game_id:'brabet-double',items:[r]})}),env)}
  await ingest(1,'black',9);assert.equal(outbound.filter(x=>x.method==='sendMessage').length,0);
  const on=await worker.fetch(reqBody('/api/adm/telegram/activate','POST',{confirm:true},cookie),env);assert.equal(on.status,200);
  await ingest(2,'red',4);assert.equal(outbound.filter(x=>x.method==='sendMessage').length,1);
  assert.equal(outbound.find(x=>x.method==='sendMessage').args.text,'PRETO + BRANCO');
  await worker.fetch(req('/api/adm/telegram/deactivate',{method:'POST',headers:{Cookie:cookie}}),env);
  await ingest(3,'black',9);assert.equal(outbound.filter(x=>x.method==='sendMessage').length,1);
 }finally{globalThis.fetch=old}
});
