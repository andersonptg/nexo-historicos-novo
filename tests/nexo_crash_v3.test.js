import test from 'node:test';
import assert from 'node:assert/strict';
import {crashV3Public, crashV3Admin} from '../worker/src/crash-v3.js';
function setup(){
 const data=new Map();const R2={get:async key=>data.has(key)?{json:async()=>structuredClone(data.get(key))}:null,put:async(k,x)=>{data.set(k,JSON.parse(x))}};
 const env={R2,NEXO_BOT_ENCRYPTION_KEY:'1234567890abcdefghijABCDEFGHIJKLMNOP'};
 const ownerId='123456789';
 data.set('nexo-v3/telegram/owner.json',{id:ownerId});
 return {data,env,ownerId};
}
let calls=[];
const original=globalThis.fetch;
globalThis.fetch=async(url,opt)=>{const x=String(url);const method=x.split('/').pop();calls.push({url:x,method,body:JSON.parse(opt.body)});if(method==='getMe')return Response.json({ok:true,result:{id:89898989,is_bot:true,username:'crash_oficial_bot'}});if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:''}});if(method==='getFile')return Response.json({ok:true,result:{file_path:'stickers/sticker.webp',file_size:1000}});return Response.json({ok:true,result:{message_id:45}});};
const jsonReq=(path,body,method='GET',headers={})=>new Request('https://nexo.test'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
const adm=(req,e,o)=>crashV3Admin(req,e,new URL(req.url),{ownerId:o});
const pub=(req,e)=>crashV3Public(req,e,new URL(req.url),{analyze:(items,{threshold})=>({eligible:items.length,baseline:.5,patterns:[{pattern:['<2x'],count:6,hits:3,rate:.5}]})});
test('same owner id; exclusive Crash bot token encrypted, webhook registered',async()=>{
 calls=[];const {data,env,ownerId}=setup();const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcd';
 const r=await adm(jsonReq('/api/adm/crash/v3/bot',{token},'POST'),env,ownerId);assert.equal(r.status,200,await r.text());
 const record=data.get('nexo-crash-v2/telegram/bot.json');assert.ok(record?.ciphertext);assert.ok(!JSON.stringify(record).includes(token));
 const call=calls.find(x=>x.method==='setWebhook');assert.equal(call.body.url,'https://nexo.test/api/crash/telegram/webhook');assert.equal(call.body.allowed_updates[0],'message');
 const secret=call.body.secret_token;
 const bad=await pub(jsonReq('/api/crash/telegram/webhook',{message:{chat:{id:ownerId,type:'private'},from:{id:ownerId},sticker:{file_id:'ABC',file_unique_id:'D'}}},'POST',{'X-Telegram-Bot-Api-Secret-Token':'wrong'}),env);assert.equal(bad.status,401);
 const req=jsonReq('/api/crash/telegram/webhook',{message:{chat:{id:Number(ownerId),type:'private'},from:{id:Number(ownerId)},sticker:{file_id:'ABC',file_unique_id:'D',emoji:'🎉'}}},'POST',{'X-Telegram-Bot-Api-Secret-Token':secret});const got=await pub(req,env);assert.equal(got.status,200);
 assert.equal(data.get('nexo-crash-v2/telegram/media.json').length,1);
 assert.equal(data.has('nexo-v3/media/catalog.json'),false);
 const cfg=await adm(jsonReq('/api/adm/crash/v3/signals'),env,ownerId);assert.equal((await cfg.json()).media.length,1);
 const dup=await pub(jsonReq('/api/crash/telegram/webhook',{message:{chat:{id:Number(ownerId),type:'private'},from:{id:Number(ownerId)},sticker:{file_id:'ABC',file_unique_id:'D'}}},'POST',{'X-Telegram-Bot-Api-Secret-Token':secret}),env);assert.equal(dup.status,200);assert.equal(data.get('nexo-crash-v2/telegram/media.json').length,1);
});
test('target-specific GREEN media, one RED, verified private test uses Crash bot',async()=>{
 calls=[];const {data,env,ownerId}=setup();const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcd';
 await adm(jsonReq('/api/adm/crash/v3/bot',{token},'POST'),env,ownerId);
 const sticker={id:'0123456789abcdef0123456789abcdef',kind:'sticker',fileId:'FILE_CRASH',name:'Green 2x',fileUniqueId:'s'};
 data.set('nexo-crash-v2/telegram/media.json',[sticker]);
 const targets={};for(const t of [2,5,10,20,50,100])targets[String(t)]={entry:{kind:'text',text:`Entrada {alvo}x`,assetId:''},green:t===2?{kind:'sticker',text:'GREEN {alvo}x',assetId:sticker.id}:{kind:'text',text:`GREEN ${t}x`,assetId:''}};
 const cfg={targets,red:{kind:'text',text:'RED único',assetId:''}};
 const r=await adm(jsonReq('/api/adm/crash/v3/signals',cfg,'PUT'),env,ownerId);assert.equal(r.status,200);
 const res=await adm(jsonReq('/api/adm/crash/v3/test-private',{event:'green',target:2},'POST'),env,ownerId);assert.equal(res.status,200,await res.text());
 assert.equal(calls.find(x=>x.method==='sendSticker').body.sticker,'FILE_CRASH');
 assert.equal(calls.find(x=>x.method==='sendMessage').body.chat_id,ownerId);
 const bad=await adm(jsonReq('/api/adm/crash/v3/test-private',{event:'green',target:3},'POST'),env,ownerId);assert.equal(bad.status,400);
});
test('search analyses all 6 thresholds',async()=>{
 const {env,data}=setup();data.set('nexo-crash-v2/history.json',{items:[{seq:1,multiplier:1.5}],gaps:[],updated_at:3});
 const r=await pub(jsonReq('/api/crash/analysis-all?length=3&minimum=3'),env);const d=await r.json();assert.deepEqual(d.analyses.map(x=>x.target),[2,5,10,25,50,100]);
});
