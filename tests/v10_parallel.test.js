import test from 'node:test';
import assert from 'node:assert/strict';
import {processNewRounds} from '../worker/src/adm.js';

test('V10.1: privado e dois grupos recebem sem aguardar um chat anterior; ATENÇÃO é apagada antes da entrada',async()=>{
 const memory=new Map(),sent=[],deleted=[],calls=[];
 let seqId=2000;
 const R2={
  async get(key){return memory.has(key)?{async json(){return JSON.parse(memory.get(key))}}:null},
  async put(key,v){memory.set(key,typeof v==='string'?v:JSON.stringify(v));},
  async delete(key){memory.delete(key)},
  async list({prefix,limit=100,cursor}){const keys=[...memory.keys()].filter(k=>k.startsWith(prefix)).sort();const start=cursor?Number(cursor):0;const part=keys.slice(start,start+limit);return {objects:part.map(key=>({key})),truncated:start+limit<keys.length,cursor:String(start+part.length)}}
 };
 const env={R2,NEXO_TELEGRAM_BOT_TOKEN:'123456:'+('a'.repeat(32))};
 const sid='f'.repeat(32);
 const strategy={id:sid,name:'Teste paralelo',enabled:true,archived:false,gameId:'brabet-double',target:'red',pattern:['black','red','black'],maxGale:0,jokerWhite:false,showNumbers:true,messages:{},media:{}};
 memory.set('nexo-v3/admin/settings.json',JSON.stringify({botEnabled:true}));
 memory.set('nexo-v3/admin/strategies.json',JSON.stringify([strategy]));
 memory.set('nexo-v3/telegram/owner.json',JSON.stringify({id:'123456789'}));
 memory.set('nexo-v3/telegram/groups.json',JSON.stringify([{id:'-100100200',selected:true,admin:true},{id:'-100100201',selected:true,admin:true}]));
 memory.set('nexo-v3/admin/global-signals.json',JSON.stringify({templates:{attention:{saved:true,text:'🚨 ATENÇÃO TESTE',type:'text',assetId:''}}}));
 memory.set('nexo-v3/runtime/'+sid+'.json',JSON.stringify({lastSeq:0,recent:[],active:null}));
 let releaseSlowPrivate;const slowPrivate=new Promise(resolve=>releaseSlowPrivate=resolve);
 let privateAwaited=false,groupWasStartedWhilePrivateWaited=false;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const method=String(url).split('/').pop(),data=JSON.parse(options?.body||'{}');
  calls.push({method,data});
  if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator',can_post_messages:true}});
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true}});
  if(method==='sendMessage'){
   if(data.text.includes('ATENÇÃO')&&String(data.chat_id)==='123456789'){
    privateAwaited=true;
    await Promise.race([slowPrivate,new Promise((_,reject)=>setTimeout(()=>reject(Error('grupos ficaram bloqueados pelo privado')),1500))]);
   }
   if(data.text.includes('ATENÇÃO')&&String(data.chat_id)==='-100100200'&&privateAwaited){groupWasStartedWhilePrivateWaited=true;releaseSlowPrivate();}
   const result={chat:String(data.chat_id),id:++seqId,text:data.text};sent.push(result);
   return Response.json({ok:true,result:{message_id:result.id}});
  }
  if(method==='deleteMessage'){deleted.push({chat:String(data.chat_id),id:data.message_id});return Response.json({ok:true,result:true})}
  return Response.json({ok:true,result:true});
 };
 const push=async(seq,number,color)=>processNewRounds(env,{id:'brabet-double'},[{seq,id:seq.toString(16).padStart(32,'0'),minute_epoch:Math.floor(Date.now()/60000)*60,number,color}]);
 try{
  await push(1,8,'black');await push(2,1,'red');
  assert.equal(groupWasStartedWhilePrivateWaited,true,'grupo recebe sem esperar o privado concluir');
  assert.equal(sent.filter(x=>x.text.includes('ATENÇÃO')).length,3);
  await push(3,9,'black');
  assert.equal(deleted.length,3);
  assert.deepEqual(new Set(deleted.map(x=>x.id)),new Set(sent.filter(x=>x.text.includes('ATENÇÃO')).map(x=>x.id)));
  assert.equal(sent.filter(x=>x.text.includes('ENTRADA CONFIRMADA')).length,3);
  assert.equal([...memory.keys()].filter(x=>x.includes('attention-message-ids/')).length,0);
 }finally{releaseSlowPrivate();globalThis.fetch=originalFetch}
});
