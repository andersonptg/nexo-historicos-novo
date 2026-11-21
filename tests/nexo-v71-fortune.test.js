import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ID,COLORS,TARGETS,cleanRule,validateFortune,pandaDisplay} from '../worker/src/nexo-fortune-v71-core.js';
import {fortuneAdmin,fortunePublic} from '../worker/src/nexo-fortune-v71-server.js';
const current=Math.floor(Date.now()/60000)*60;
const history=(colors,multipliers={})=>({items:colors.map((color,i)=>({seq:i+1,minute_epoch:current-(colors.length-1-i)*60,color,...(color==='gold'&&i in multipliers?{multiplier:multipliers[i]}:{})})),gaps:[]});
const makeEnv=()=>{const mem=new Map();const R2={get:async k=>mem.has(k)?{json:async()=>structuredClone(mem.get(k))}:null,put:async(k,v)=>mem.set(k,JSON.parse(v)),delete:async k=>mem.delete(k)};return {mem,env:{R2,NEXO_BOT_ENCRYPTION_KEY:'Fortune-Encryption-Test-Key-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'}};};
const url=path=>new URL('https://nexo.example'+path);
const call=(env,path,method='GET',body,headers={})=>{const request=new Request(url(path),{method,headers:{'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return fortuneAdmin(request,env,url(path));};
test('Fortune V7.1: color categories and 5 GREEN choices do not use conventional Double numbers',()=>{
 assert.deepEqual(COLORS,['red','purple','gold']);assert.deepEqual(Object.keys(TARGETS),['red_gold','purple_gold','red','purple','gold']);
 assert.equal(pandaDisplay({color:'gold',multiplier:9.45}),'9.45x');assert.equal(pandaDisplay({color:'gold'}),'Multiplicador não informado');
 assert.throws(()=>cleanRule({name:'Teste',pattern:['black'],target:'gold',maxGale:2}),/Padrão inválido/);
 assert.throws(()=>cleanRule({name:'Teste',pattern:['red'],target:'white',maxGale:2}),/Alvo inválido/);
});
test('Fortune V7.1: validates win, Gale 1 and RED on only recorded rows',()=>{
 const h={items:['red','purple','gold','purple','red','purple','purple','red','red'].map((color,i)=>({seq:i+1,color,minute_epoch:current-600+i*60,...(color==='gold'?{multiplier:7.7}:{})})),gaps:[]};
 const r=validateFortune(h,{pattern:['red','purple'],target:'gold',maxGale:2});
 assert.equal(r.triggers,2);assert.equal(r.win,1);assert.equal(r.winByStep.entry,1);assert.equal(r.red,1);assert.equal(r.ratePercent,50);
 assert.equal(r.events[0].pandaMultiplier,7.7);
 const gap=validateFortune({...h,gaps:[{after_seq:2}]},{pattern:['red','purple'],target:'gold',maxGale:2});
 assert.equal(gap.triggers,1);
});
test('Fortune V7.1: admin CRUD is confined to nexo-fortune-v71 and new rules start paused',async()=>{
 const {mem,env}=makeEnv();const s=await call(env,'/api/adm/fortune/strategies','POST',{name:'Fortune Padrão',pattern:['red','purple'],target:'red_gold',maxGale:1,enabled:true});assert.equal(s.status,200,await s.clone().text());const strategy=(await s.json()).strategy;
 assert.equal(strategy.enabled,false);assert.equal(strategy.gameId,GAME_ID);assert.ok(mem.has('nexo-fortune-v71/strategies.json'));assert.equal(mem.has('nexo-v3/admin/strategies.json'),false);
 const updated=await call(env,'/api/adm/fortune/strategies/'+strategy.id,'PUT',{...strategy,enabled:true});assert.equal((await updated.json()).strategy.enabled,true);
 const result=await call(env,'/api/adm/fortune/strategies/'+strategy.id,'DELETE');assert.equal((await result.json()).archived,true);
 assert.equal(mem.get('nexo-fortune-v71/strategies.json')[0].archived,true);
});
test('Fortune V7.1: protected validation checks game id and gaps, no Telegram',async()=>{
 const {mem,env}=makeEnv();mem.set('nexo-cloud-v5/games/blitz-fortune-double/history.json',history(['red','purple','gold','red','purple','gold','red']));
 const req=await call(env,'/api/adm/fortune/validate','POST',{gameId:GAME_ID,pattern:['red','purple'],target:'gold',maxGale:0});const data=await req.json();assert.equal(req.status,200);assert.equal(data.game_id,GAME_ID);assert.equal(data.win,2);
 const bad=await call(env,'/api/adm/fortune/validate','POST',{gameId:'blitz-double',pattern:['red'],target:'gold',maxGale:0});assert.equal(bad.status,400);
});
test('Fortune V7.1: exclusive bot token, verified owner reused, group discovery and private media',async()=>{
 const {mem,env}=makeEnv();mem.set('nexo-v3/telegram/owner.json',{id:'123456789'});
 let calls=[];const existingFetch=globalThis.fetch;
 globalThis.fetch=async (u,opt)=>{const method=String(u).split('/').pop();calls.push({method,payload:opt?.body?JSON.parse(opt.body):null});if(method==='getMe')return Response.json({ok:true,result:{id:7777777,is_bot:true,username:'fortune_independente'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:''}});if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator'}});
  return Response.json({ok:true,result:{message_id:123}})};
 try{
  const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcde',response=await call(env,'/api/adm/fortune/bot/connect','POST',{token});assert.equal(response.status,200,await response.clone().text());
  const bot=mem.get('nexo-fortune-v71/telegram/bot.json');assert.ok(bot.ciphertext);assert.ok(!JSON.stringify(bot).includes(token));assert.equal(mem.has('nexo-v3/telegram/bot-encrypted.json'),false);
  const secret=calls.find(x=>x.method==='setWebhook')?.payload.secret_token;assert.ok(secret);assert.equal(calls.find(x=>x.method==='setWebhook')?.payload.allowed_updates.includes('my_chat_member'),true);
  const groupRequest=new Request('https://nexo.example/api/fortune/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({my_chat_member:{chat:{id:-100123456,title:'Fortune Teste',type:'supergroup'},new_chat_member:{status:'administrator'}}})});
  const groupRes=await fortunePublic(groupRequest,env,new URL(groupRequest.url));assert.equal(groupRes.status,200);
  assert.equal(mem.get('nexo-fortune-v71/telegram/groups.json')[0].admin,true);
  const select=await call(env,'/api/adm/fortune/groups','PUT',{ids:['-100123456']});assert.equal(select.status,200);
  const testSend=await call(env,'/api/adm/fortune/bot/test','POST',{target:'red_gold',event:'green',groupId:'-100123456'});assert.equal(testSend.status,200,await testSend.clone().text());assert.ok(calls.some(x=>x.method==='sendMessage'));
  const invalid=new Request('https://nexo.example/api/fortune/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'wrong'},body:'{}'});assert.equal((await fortunePublic(invalid,env,new URL(invalid.url))).status,401);
 }finally{globalThis.fetch=existingFetch}
});
