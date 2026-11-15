import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAdmin,processNewRounds,scheduledAdmin} from '../worker/src/adm.js';

function harness({deleteFailsOnce=false}={}){
 const values=new Map(),sent=[],deleted=[],calls=[];
 let seqMessage=4000,failRemaining=deleteFailsOnce?1:0;
 const R2={
  async get(key){return values.has(key)?{async json(){return structuredClone(JSON.parse(values.get(key)))}}:null},
  async put(key,value){values.set(key,typeof value==='string'?value:JSON.stringify(value))},
  async delete(key){values.delete(key)},
  async list({prefix,limit=1000,cursor}){const all=[...values.keys()].filter(k=>k.startsWith(prefix)).sort();const offset=cursor?Number(cursor):0,part=all.slice(offset,offset+limit);return {objects:part.map(key=>({key})),truncated:offset+part.length<all.length,cursor:String(offset+part.length)}}
 };
 const env={R2,NEXO_ADM_PASSWORD:'p'.repeat(36),NEXO_TELEGRAM_BOT_TOKEN:'123456:'+('a'.repeat(32))};
 let owner='123456789';
 globalThis.__v10_test_fetch_backup=globalThis.__v10_test_fetch_backup||globalThis.fetch;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const method=String(url).split('/').at(-1),params=options.body instanceof FormData?{chat_id:options.body.get('chat_id')} :JSON.parse(options.body||'{}');
  calls.push({method,params});
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true,username:'NEXO_V10_TEST'}});
  if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator',can_post_messages:true}});
  if(method==='deleteMessage'){
    if(failRemaining-->0)return Response.json({ok:false,description:'Temporary Telegram outage'},{status:503});
    deleted.push({chat:String(params.chat_id),messageId:params.message_id});return Response.json({ok:true,result:true});
  }
  if(['sendMessage','sendSticker','sendAnimation'].includes(method)){
    const message_id=++seqMessage;sent.push({chat:String(params.chat_id),method,message_id,text:params.text||''});
    return Response.json({ok:true,result:{message_id}});
  }
  return Response.json({ok:true,result:true});
 };
 const restore=()=>{globalThis.fetch=originalFetch};
 const put=(key,val)=>values.set(key,JSON.stringify(val));
 const get=(key)=>values.has(key)?JSON.parse(values.get(key)):null;
 const request=async(path,method='GET',body=null,cookie='')=>{
  const r=new Request('https://nexo.test'+path,{method,headers:{Origin:'https://nexo.test',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return routeAdmin(r,env,new URL(r.url));
 };
 const login=async()=>{
  const response=await request('/api/adm/login','POST',{password:env.NEXO_ADM_PASSWORD});
  assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
 };
 const start=(strategies,template={text:'🚨 ATENÇÃO: aguardando pedra.',type:'text',assetId:'',saved:true})=>{
  put('nexo-v3/admin/settings.json',{botEnabled:true});
  put('nexo-v3/telegram/owner.json',{id:owner});
  put('nexo-v3/telegram/groups.json',[{id:'-100555666',admin:true,selected:true,name:'Grupo teste'}]);
  put('nexo-v3/admin/strategies.json',strategies);
  put('nexo-v3/admin/global-signals.json',{version:1,templates:{attention:template},registration:{enabled:false}});
  for(const s of strategies)put('nexo-v3/runtime/'+s.id+'.json',{lastSeq:0,recent:[],active:null});
 };
 const push=async(seq,n,color,id='brabet-double')=>processNewRounds(env,{id},[{id:seq.toString(16).padStart(32,'0'),seq,number:n,color,minute_epoch:Math.floor(Date.now()/60000)*60+seq}]);
 return {values,sent,deleted,calls,env,put,get,request,login,start,push,restore};
}
const makeStrategy=(id,pattern=['red','black','red'])=>({
 id,name:'Teste V10 '+id.slice(0,3),gameId:'brabet-double',target:'black',pattern,maxGale:0,
 enabled:true,archived:false,jokerWhite:false,showNumbers:true,messages:{},media:{},updatedAt:0
});

test('V10: atenção aparece uma vez no privado e grupo; desaparece ANTES da entrada confirmada',async()=>{
 const h=harness();try{
  const sid='a'.repeat(32);h.start([makeStrategy(sid)]);
  await h.push(1,2,'red');await h.push(2,8,'black');
  const alerts=h.sent.filter(x=>x.text.includes('ATENÇÃO'));assert.equal(alerts.length,2);
  assert.deepEqual(alerts.map(x=>x.chat),['123456789','-100555666']);
  const tracked=[...h.values.keys()].filter(x=>x.includes('temporary-attention/'));assert.equal(tracked.length,1);
  await h.push(3,3,'red');
  assert.deepEqual(h.deleted.map(x=>x.messageId).sort(),alerts.map(x=>x.message_id).sort());
  assert.equal(h.sent.filter(x=>x.text.includes('ENTRADA CONFIRMADA')).length,2);
  const enter=h.sent.filter(x=>x.text.includes('ENTRADA CONFIRMADA'));
  assert.ok(enter.every(x=>!h.deleted.some(d=>d.messageId===x.message_id)));
  assert.equal([...h.values.keys()].filter(x=>x.includes('temporary-attention/')).length,0);
 }finally{h.restore()}
});

test('V10: mudança do padrão apaga a ATENÇÃO sem enviar entrada',async()=>{
 const h=harness();try{
  const sid='b'.repeat(32);h.start([makeStrategy(sid)]);
  await h.push(1,1,'red');await h.push(2,9,'black');
  assert.equal(h.sent.filter(x=>x.text.includes('ATENÇÃO')).length,2);
  await h.push(3,11,'black');
  assert.equal(h.deleted.length,2);
  assert.equal(h.sent.filter(x=>x.text.includes('ENTRADA CONFIRMADA')).length,0);
 }finally{h.restore()}
});

test('V10: padrão de 25 pedras funciona; ATENÇÃO não duplica com prefixo contínuo',async()=>{
 const h=harness();try{
  const sid='c'.repeat(32),pattern=Array(25).fill('red');h.start([makeStrategy(sid,pattern)]);
  for(let n=1;n<=24;n++)await h.push(n,1,'red');
  assert.equal(h.sent.filter(x=>x.text.includes('ATENÇÃO')).length,2);
  await h.push(25,1,'red');
  assert.equal(h.deleted.length,2);
  assert.equal(h.sent.filter(x=>x.text.includes('ENTRADA CONFIRMADA')).length,2);
 }finally{h.restore()}
});

test('V10: sticker e texto do aviso são apagados, mas WIN e entrada continuam',async()=>{
 const h=harness();try{
  const sid='d'.repeat(32);h.start([makeStrategy(sid)],{text:'🚨 ATENÇÃO com sticker',type:'sticker',assetId:'sticker001',saved:true});
  h.put('nexo-v3/media/catalog.json',[{id:'sticker001',kind:'sticker',fileId:'telegram_file',name:'Aviso'}]);
  await h.push(1,1,'red');await h.push(2,8,'black');
  assert.equal(h.sent.filter(x=>x.method==='sendSticker').length,2);
  const before=h.sent.filter(x=>x.method==='sendSticker'||x.text.includes('ATENÇÃO'));
  assert.equal(before.length,4);
  await h.push(3,3,'red');
  assert.deepEqual(new Set(h.deleted.map(x=>x.messageId)),new Set(before.map(x=>x.message_id)));
 }finally{h.restore()}
});

test('V10: exclusão temporária que falhou tenta novamente no agendador sem apagar outros sinais',async()=>{
 const h=harness({deleteFailsOnce:true});try{
  const sid='e'.repeat(32);h.start([makeStrategy(sid)]);
  await h.push(1,1,'red');await h.push(2,9,'black');await h.push(3,10,'black');
  assert.equal(h.deleted.length,1); // Um dos destinos falhou temporariamente.
  const stale=[...h.values.keys()].filter(x=>x.includes('temporary-attention/'));
  assert.equal(stale.length,1);assert.equal(h.get(stale[0]).active,false);
  await scheduledAdmin(h.env);
  assert.equal(h.deleted.length,2);
  assert.equal([...h.values.keys()].filter(x=>x.includes('temporary-attention/')).length,0);
 }finally{h.restore()}
});

test('V10: troca da sequência no ADM apaga ATENÇÃO pendente sem alterar outro cadastro',async()=>{
 const h=harness();try{
  const sid='f'.repeat(32),other='1'.repeat(32);h.start([makeStrategy(sid),makeStrategy(other,['red','red','black'])]);
  await h.push(1,1,'red');await h.push(2,9,'black');
  const cookie=await h.login();
  const response=await h.request('/api/adm/strategies/'+sid,'PUT',{...makeStrategy(sid),pattern:['black','red']},cookie);
  assert.equal(response.status,200);
  assert.equal(h.deleted.length,2);
  assert.equal(h.get('nexo-v3/admin/strategies.json').length,2);
 }finally{h.restore()}
});

test('V10: exclusão definitiva exige nome exato e preserva banco do jogo, outros cadastros e bot',async()=>{
 const h=harness();try{
  const cookie=await h.login(),long=Array(26).fill('red');
  const create=async(name,pattern)=>{
   const r=await h.request('/api/adm/strategies','POST',{name,pattern,target:'black',maxGale:1},cookie);
   assert.equal(r.status,200);return (await r.json()).strategy;
  };
  const a=await create('Minha principal',long),b=await create('Outra regra',['black','red']);
  h.put('nexo-v1/games/brabet-double/latest.json',{items:[{number:2}]});
  h.put('nexo-v3/events/'+a.id+'_abc_entry_black.json',{id:'old'});
  h.put('nexo-v3/outbox/pending/'+a.id+'_abc_entry_black_123.json',{id:'old'});
  let r=await h.request('/api/adm/strategies/'+a.id+'/purge','POST',{confirm:true,name:'Outro'},cookie);
  assert.equal(r.status,400);assert.equal(h.get('nexo-v3/admin/strategies.json').length,2);
  r=await h.request('/api/adm/strategies/'+a.id+'/purge','POST',{confirm:true,name:a.name},cookie);
  assert.equal(r.status,200);
  const remaining=h.get('nexo-v3/admin/strategies.json');
  assert.equal(remaining.length,1);assert.equal(remaining[0].id,b.id);
  assert.equal(h.get('nexo-v3/runtime/'+a.id+'.json'),null);
  assert.deepEqual(h.get('nexo-v1/games/brabet-double/latest.json'),{items:[{number:2}]});
  assert.equal(h.get('nexo-v3/events/'+a.id+'_abc_entry_black.json'),null);
  assert.ok(h.get('nexo-v3/runtime/'+b.id+'.json'));
 }finally{h.restore()}
});
