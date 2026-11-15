import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateWhiteWindows,processWhiteRounds,resetWhiteAfterCatchup,whiteHasActiveForecast,routeWhiteAdmin,scheduledWhite} from '../worker/src/white.js';
const epoch=s=>Math.floor(new Date(s+'-03:00').getTime()/1000);
const row=(seq,color,number,clock)=>({id:seq.toString(16).padStart(32,'0'),seq,color,number,minute_epoch:epoch(clock)});
function harness(){
 const values=new Map();const env={R2:{
  async get(k){return values.has(k)?{async json(){return structuredClone(JSON.parse(values.get(k)))}}:null},
  async put(k,x){values.set(k,typeof x==='string'?x:JSON.stringify(x))},
  async delete(k){values.delete(k)},
  async list({prefix,limit=100}){return {objects:[...values.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false}}
 }};
 const put=(key,x)=>values.set(key,JSON.stringify(x));
 const read=key=>JSON.parse(values.get(key));
 const rule=(id,extras={})=>({id,name:'Branco teste',before:{color:'black',number:8},after:{color:'red',number:7},increment:4,tolerance:1,enabled:true,...extras});
 return {values,env,put,read,rule};
}
test('V13: ⚫8 05:20, ⚪0 05:20, 🔴7 05:21 => 05:35 e 05:39',()=>{
 const a=calculateWhiteWindows(row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00'));
 assert.deepEqual([a.sum,a.label1,a.label2],[35,'05:35','05:39']);
});
test('V13: minuto ultrapassou 59, avança a hora e respeita virada do dia',()=>{
 const a=calculateWhiteWindows(row(1,'black',8,'2026-11-15T05:58:00'),row(2,'white',0,'2026-11-15T05:58:00'),row(3,'red',7,'2026-11-15T05:59:00'));
 assert.deepEqual([a.sum,a.label1,a.label2],[73,'06:13','06:17']);
 const b=calculateWhiteWindows(row(1,'black',8,'2026-11-15T23:58:00'),row(2,'white',0,'2026-11-15T23:58:00'),row(3,'red',7,'2026-11-15T23:59:00'));
 assert.deepEqual([b.label1,b.label2],['00:13','00:17']);
});
test('V13: minuto calculado já passou; escolher próxima hora, não enviar previsão passada',()=>{
 const a=calculateWhiteWindows(row(1,'black',8,'2026-11-15T05:40:00'),row(2,'white',0,'2026-11-15T05:40:00'),row(3,'red',7,'2026-11-15T05:55:00'));
 assert.equal(a.label1,'06:55');
});
test('V13: um padrão cria uma tendência, sem Telegram ligado por padrão',async()=>{
 const h=harness();h.put('nexo-white-v1/rules.json',[h.rule('a'.repeat(32))]);
 for(const r of [row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00')])await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
 assert.equal((await whiteHasActiveForecast(h.env)),true);
 const a=h.read('nexo-white-v1/runtime.json').active;
 assert.equal(a.sum,35);assert.equal(a.label1,'05:35');assert.equal(a.label2,'05:39');
 assert.equal(h.read('nexo-white-v1/scores/'+'a'.repeat(32)+'.json').signals,1);
});
test('V13: mesma rodada não gera sinal duas vezes; múltiplas regras não se sobrepõem',async()=>{
 const h=harness();h.put('nexo-white-v1/rules.json',[h.rule('a'.repeat(32)),h.rule('b'.repeat(32))]);
 const rows=[row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00')];
 for(const r of rows)await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
 await processWhiteRounds(h.env,{id:'brabet-double'},rows);
 const ev=[...h.values.keys()].filter(k=>k.startsWith('nexo-white-v1/events/'));
 assert.equal(ev.length,1);assert.equal(h.read('nexo-white-v1/runtime.json').active.strategyId,'a'.repeat(32));
});
test('V13: estratégia tradicional ativa bloqueia a nova tendência',async()=>{
 const h=harness();h.put('nexo-white-v1/rules.json',[h.rule('a'.repeat(32))]);h.put('nexo-v3/runtime/game-owner/brabet-double.json',{ownerId:'x'.repeat(32)});
 for(const r of [row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00')])await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
 assert.equal(await whiteHasActiveForecast(h.env),false);
});
test('V13: WIN só com branco dentro de ±1 minuto; resultado registrado separadamente',async()=>{
 const h=harness(),id='a'.repeat(32);h.put('nexo-white-v1/rules.json',[h.rule(id)]);
 for(const r of [row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00'),row(4,'white',0,'2026-11-15T05:34:00')])await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
 assert.equal(h.read('nexo-white-v1/scores/'+id+'.json').wins,1);assert.equal(await whiteHasActiveForecast(h.env),false);
 const ev=[...h.values].filter(([k])=>k.startsWith('nexo-white-v1/events/')).map(([,v])=>JSON.parse(v));
 assert.deepEqual(ev.map(x=>x.type).sort(),['signal','win']);
});
test('V13: LOSS somente após fonte confirmar rodada além da última janela',async()=>{
 const h=harness(),id='a'.repeat(32);h.put('nexo-white-v1/rules.json',[h.rule(id)]);
 for(const r of [row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00'),row(4,'red',6,'2026-11-15T05:35:00'),row(5,'black',8,'2026-11-15T05:42:00')])await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
 assert.equal(h.read('nexo-white-v1/scores/'+id+'.json').losses,1);assert.equal(await whiteHasActiveForecast(h.env),false);
});
test('V13: catchup cancela tendência sem produzir WIN/LOSS fictício',async()=>{
 const h=harness(),id='a'.repeat(32);h.put('nexo-white-v1/rules.json',[h.rule(id)]);
 for(const r of [row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00')])await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
 await resetWhiteAfterCatchup(h.env,{id:'brabet-double'},[row(100,'black',8,'2026-11-15T06:00:00')]);
 assert.equal(await whiteHasActiveForecast(h.env),false);assert.equal(h.read('nexo-white-v1/scores/'+id+'.json').cancelled,1);
});
test('V13: CRUD exige regra válida; criação começa pausada',async()=>{
 const h=harness(),base='https://nexo.test/api/adm/white/';
 const req=(path,method='GET',body)=>new Request(base+path,{method,...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});
 const invalid=await routeWhiteAdmin(req('rules','POST',{name:'Ab',before:{color:'black',number:8},after:{color:'red',number:7},increment:4,tolerance:1}),h.env,new URL(base+'rules'));
 assert.equal(invalid.status,400);
 const good=await routeWhiteAdmin(req('rules','POST',{name:'Minha regra 1',before:{color:'black',number:8},after:{color:'red',number:7},increment:4,tolerance:1,enabled:true}),h.env,new URL(base+'rules'));
 assert.equal(good.status,200);const v=await good.json();assert.equal(v.rule.enabled,false);
 const overview=await routeWhiteAdmin(req('overview'),h.env,new URL(base+'overview'));
 assert.equal((await overview.json()).rules.length,1);
 const del=await routeWhiteAdmin(req('rules/'+v.rule.id,'DELETE',{confirm:true}),h.env,new URL(base+'rules/'+v.rule.id));
 assert.equal((await del.json()).ok,true);assert.deepEqual(h.read('nexo-white-v1/rules.json'),[]);
});
test('V13: agendamento não emite LOSS por relógio sem resultado confirmado',async()=>{
 const h=harness(),id='a'.repeat(32);h.put('nexo-white-v1/runtime.json',{lastSeq:3,recent:[],active:{status:'active',strategyId:id,name:'Teste',target1:epoch('2026-11-14T05:35:00'),target2:epoch('2026-11-14T05:39:00'),tolerance:1,attentionSent:false},lastSourceMinute:epoch('2026-11-14T05:21:00'),lastReceivedAt:0});
 await scheduledWhite(h.env);assert.equal(await whiteHasActiveForecast(h.env),true);
});

test('V13: bot independente usa TEXTO no sinal e somente STICKER no WIN, sem duplicação',async()=>{
 const h=harness(),sid='a'.repeat(32),chatId='-1001234567890';
 h.env.NEXO_WHITE_BOT_TOKEN='123456:'+('a'.repeat(32));
 h.put('nexo-white-v1/rules.json',[h.rule(sid)]);
 h.put('nexo-white-v1/config.json',{botEnabled:true,chats:[chatId],templates:{
  signal:{type:'text',text:'SINAL BRABET {hora1} {hora2}'},
  attention:{type:'text',text:'ATENTOS'},
  win:{type:'sticker',mediaId:'f'.repeat(32)},
  loss:{type:'text',text:'LOSS'}
 }});
 h.put('nexo-white-v1/media.json',[{id:'f'.repeat(32),type:'sticker',fileId:'sticker_id_BrancoV13'}]);
 const calls=[],original=globalThis.fetch;globalThis.fetch=async(url,options)=>{
  const method=String(url).split('/').at(-1),body=JSON.parse(options.body);calls.push({method,body});return Response.json({ok:true,result:{message_id:calls.length}})
 };
 try{
  const rows=[row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00'),row(4,'white',0,'2026-11-15T05:35:00')];
  for(const r of rows)await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
  assert.deepEqual(calls.map(x=>x.method),['sendMessage','sendSticker']);
  assert.match(calls[0].body.text,/05:35.*05:39/);
  assert.equal(calls[1].body.sticker,'sticker_id_BrancoV13');
  await processWhiteRounds(h.env,{id:'brabet-double'},rows);
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=original}
});

test('V13: erro em um grupo bloqueia somente esse destino; outro continua sem duplicar',async()=>{
 const h=harness(),sid='a'.repeat(32),one='-1001234567891',two='-1001234567892';
 h.env.NEXO_WHITE_BOT_TOKEN='123456:'+('a'.repeat(32));h.put('nexo-white-v1/rules.json',[h.rule(sid)]);
 h.put('nexo-white-v1/config.json',{botEnabled:true,chats:[one,two],templates:{signal:{type:'text',text:'SINAL {hora1}'},attention:{type:'text',text:'ATENTOS'},win:{type:'text',text:'WIN'},loss:{type:'text',text:'LOSS'}}});
 const calls=[],old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(String(body.chat_id)===one)throw Error('network uncertain');return Response.json({ok:true,result:{message_id:calls.length}})};
 try{
  for(const r of [row(1,'black',8,'2026-11-15T05:20:00'),row(2,'white',0,'2026-11-15T05:20:00'),row(3,'red',7,'2026-11-15T05:21:00'),row(4,'white',0,'2026-11-15T05:35:00')])await processWhiteRounds(h.env,{id:'brabet-double'},[r]);
  assert.deepEqual(calls.map(c=>String(c.chat_id)),[one,two,two]);
  const res=await routeWhiteAdmin(new Request('https://nexo.test/api/adm/white/overview'),h.env,new URL('https://nexo.test/api/adm/white/overview'));
  const x=await res.json();assert.equal(x.blocked.length,1);assert.equal(x.blocked[0].chatId,one);
  const u=await routeWhiteAdmin(new Request('https://nexo.test/api/adm/white/deliveries/clear',{method:'POST',body:JSON.stringify({chatId:one,confirm:true})}),h.env,new URL('https://nexo.test/api/adm/white/deliveries/clear'));
  assert.equal(u.status,200);
 }finally{globalThis.fetch=old}
});
