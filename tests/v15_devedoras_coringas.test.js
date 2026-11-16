import test from 'node:test';
import assert from 'node:assert/strict';
import {processWhiteRounds,resetWhiteAfterCatchup,routeWhiteAdmin,whiteShouldBlockLegacy} from '../worker/src/white.js';
import {computeMinuteTargets,whiteV15Active} from '../worker/src/white-v15.js';
const stamp=clock=>Math.floor(new Date(clock+'-03:00').getTime()/1000);
const row=(seq,number,clock)=>({id:seq.toString(16).padStart(32,'0'),seq,number,color:number===0?'white':number<=7?'red':'black',minute_epoch:stamp(clock)});
function setup(){
 const db=new Map();const env={R2:{get:async k=>db.has(k)?{json:async()=>structuredClone(JSON.parse(db.get(k)))}:null,put:async(k,v)=>db.set(k,typeof v==='string'?v:JSON.stringify(v)),delete:async k=>db.delete(k),list:async({prefix,limit=100})=>({objects:[...db.keys()].filter(x=>x.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false})}};
 const put=(k,v)=>db.set(k,JSON.stringify(v));const read=(k)=>JSON.parse(db.get(k));
 const req=(path,method='GET',body)=>routeWhiteAdmin(new Request('https://nexo.test/api/adm/white/v15/'+path,{method,...(body!==undefined?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})}),env,new URL('https://nexo.test/api/adm/white/v15/'+path));
 const ingest=async(...rounds)=>{for(const r of rounds)await processWhiteRounds(env,{id:'brabet-double'},[r])};
 const rules=async()=>{const res=await req('overview');assert.equal(res.status,200);return (await res.json()).rules};
 const enable=async(type,extras={})=>{const all=await rules(),r=all.find(x=>x.type===type);assert.ok(r);const update=await req('rules/'+r.id,'PUT',{...r,enabled:true,...extras});const result=await update.json();assert.equal(update.status,200,JSON.stringify(result));return result.rule};
 const events=()=>[...db].filter(([k])=>k.startsWith('nexo-white-v15/events/')).map(([,v])=>JSON.parse(v));
 return {env,db,put,read,req,ingest,enable,events,rules};
}

test('V15: quatro modelos prontos PAUSADOS, fonte por minuto e 3 casas como referência visual',async()=>{
 const h=setup(),res=await h.req('overview'),d=await res.json();assert.equal(res.status,200);assert.deepEqual(d.rules.map(x=>x.type),['debt4','debt11','minute4','minute11']);assert.deepEqual(d.rules.map(x=>x.enabled),[false,false,false,false]);assert.equal(d.botEnabled,false);assert.equal(d.config.roundsPerMinute,3);
});
test('V15: devedora 4→1 somente aciona quando 1 volta; espera uma CASA antes do sinal',async()=>{
 const h=setup(),r=await h.enable('debt4');
 await h.ingest(row(1,4,'2026-11-15T20:00:00'),row(2,1,'2026-11-15T20:00:00'),row(3,8,'2026-11-15T20:01:00'));
 assert.deepEqual(h.events(),[]);assert.equal(h.read('nexo-white-v15/runtime.json').debts[r.id].originSeq,2);
 await h.ingest(row(4,1,'2026-11-15T20:01:00'));assert.deepEqual(h.events().map(x=>x.type),['attention']);
 await h.ingest(row(5,8,'2026-11-15T20:02:00'));assert.deepEqual(h.events().map(x=>x.type),['attention','signal']);
 assert.deepEqual([h.read('nexo-white-v15/runtime.json').active.startSeq,h.read('nexo-white-v15/runtime.json').active.endSeq],[6,9]);
 await h.ingest(row(6,3,'2026-11-15T20:02:00'),row(7,0,'2026-11-15T20:02:00'));assert.deepEqual(h.events().map(x=>x.type),['attention','signal','win']);assert.equal(h.read('nexo-white-v15/scores/'+r.id+'.json').wins,1);
});
test('V15: 5→11 cria dívida na pedra 5; reaparência, espera, e LOSS após 4 rodadas sem branco',async()=>{
 const h=setup(),r=await h.enable('debt11');
 await h.ingest(row(1,5,'2026-11-15T20:00:00'),row(2,11,'2026-11-15T20:00:00'),row(3,6,'2026-11-15T20:01:00'),row(4,5,'2026-11-15T20:01:00'),row(5,4,'2026-11-15T20:01:00'),row(6,1,'2026-11-15T20:02:00'),row(7,2,'2026-11-15T20:02:00'),row(8,13,'2026-11-15T20:02:00'));
 assert.deepEqual(h.events().map(x=>x.type),['attention','signal']);await h.ingest(row(9,10,'2026-11-15T20:03:00'));
 assert.deepEqual(h.events().map(x=>x.type),['attention','signal','loss']);assert.equal(h.read('nexo-white-v15/scores/'+r.id+'.json').losses,1);
});
test('V15: branco na CASA DE ESPERA não conta como WIN do sinal ainda não emitido',async()=>{
 const h=setup();await h.enable('debt4');
 await h.ingest(row(1,4,'2026-11-15T20:00:00'),row(2,1,'2026-11-15T20:00:00'),row(3,12,'2026-11-15T20:01:00'),row(4,1,'2026-11-15T20:01:00'),row(5,0,'2026-11-15T20:02:00'));
 assert.deepEqual(h.events().map(x=>x.type),['attention','signal']);
});
test('V15: coringa 4 + duas cores quaisquer no MESMO minuto gera 20:45 e 20:49, +1 rodada de espera',async()=>{
 const h=setup(),r=await h.enable('minute4');await h.ingest(row(1,4,'2026-11-15T20:35:00'),row(2,9,'2026-11-15T20:35:00'),row(3,6,'2026-11-15T20:35:00'));
 assert.deepEqual(h.events().map(x=>x.type),['attention']);const a=h.read('nexo-white-v15/runtime.json').active;assert.deepEqual([a.label1,a.label2],['20:45','20:49']);
 await h.ingest(row(4,8,'2026-11-15T20:36:00'));assert.deepEqual(h.events().map(x=>x.type),['attention','signal']);
 await h.ingest(row(5,0,'2026-11-15T20:45:00'));assert.equal(h.read('nexo-white-v15/scores/'+r.id+'.json').wins,1);
});
test('V15: coringa antes do 11 usa minuto ANTERIOR ao 11 como base; vira hora',async()=>{
 const h=setup();await h.enable('minute11');await h.ingest(row(1,9,'2026-11-15T23:54:00'),row(2,6,'2026-11-15T23:54:00'),row(3,11,'2026-11-15T23:55:00'));
 const a=h.read('nexo-white-v15/runtime.json').active;assert.equal(a.label1,'00:04');assert.equal(a.label2,'00:08');
 assert.deepEqual([a.base,a.target1],[stamp('2026-11-15T23:54:00'),stamp('2026-11-16T00:04:00')]);
});
test('V15: sequência 4 com coringa NÃO admite branco nem mudança de minuto; exige 3 rodadas consecutivas',async()=>{
 for(const rounds of [
  [row(1,4,'2026-11-15T20:35:00'),row(2,0,'2026-11-15T20:35:00'),row(3,6,'2026-11-15T20:35:00')],
  [row(1,4,'2026-11-15T20:35:00'),row(2,9,'2026-11-15T20:35:00'),row(3,6,'2026-11-15T20:36:00')],
  [row(1,4,'2026-11-15T20:35:00'),row(3,9,'2026-11-15T20:35:00'),row(4,6,'2026-11-15T20:35:00')]
 ]){const h=setup();await h.enable('minute4');await h.ingest(...rounds);assert.equal(h.read('nexo-white-v15/runtime.json').active,null)}
});
test('V15: alvo minuto calculado, não inventar 1ª/2ª/3ª casa a partir dos segundos ausentes',()=>{
 const a=computeMinuteTargets(stamp('2026-11-15T23:57:00'),10,4);assert.deepEqual([a.label1,a.label2],['00:07','00:11']);
});
test('V15: apenas UMA estratégia em sinal; sem duplicação de rodada recebida duas vezes',async()=>{
 const h=setup();await h.enable('minute4');await h.enable('debt4');const rows=[row(1,4,'2026-11-15T20:35:00'),row(2,9,'2026-11-15T20:35:00'),row(3,6,'2026-11-15T20:35:00')];await h.ingest(...rows);await h.ingest(...rows);assert.equal(h.events().length,1);assert.equal(await whiteV15Active(h.env),true);
});
test('V15: estratégia V14 em andamento bloqueia abertura de nova V15',async()=>{
 const h=setup();await h.enable('minute4');h.put('nexo-white-v1/runtime.json',{active:{status:'active'},lastSeq:0});await h.ingest(row(1,4,'2026-11-15T20:35:00'),row(2,9,'2026-11-15T20:35:00'),row(3,6,'2026-11-15T20:35:00'));assert.equal(h.read('nexo-white-v15/runtime.json').active,null);
});
test('V15: catchup preserva regras, cancela sinal sem inventar LOSS/WIN',async()=>{
 const h=setup(),r=await h.enable('minute4');await h.ingest(row(1,4,'2026-11-15T20:35:00'),row(2,9,'2026-11-15T20:35:00'),row(3,6,'2026-11-15T20:35:00'));
 await resetWhiteAfterCatchup(h.env,{id:'brabet-double'},[row(99,12,'2026-11-15T21:00:00')]);assert.equal(await whiteV15Active(h.env),false);assert.equal(h.read('nexo-white-v15/scores/'+r.id+'.json').cancelled,1);assert.deepEqual(h.events().map(x=>x.type),['attention']);
});
test('V15: link exige HTTPS público e nome; 3 casas padrão é editável sem afirmar precisão dos giros',async()=>{
 const h=setup();let x=await h.req('config','PUT',{kind:'general',signupEnabled:true,signupUrl:'javascript:alert(1)',signupLabel:'Clique aqui',roundsPerMinute:3});assert.equal(x.status,400);
 x=await h.req('config','PUT',{kind:'general',signupEnabled:true,signupUrl:'https://example.org/cadastro?a=1&b=2',signupLabel:'CADASTRE-SE AQUI',roundsPerMinute:3});assert.equal(x.status,200);assert.equal(h.read('nexo-white-v15/config.json').signupEnabled,true);
});
test('V15: regra individual não permite grupo não confirmado no bot',async()=>{
 const h=setup();const r=(await h.rules())[0];const x=await h.req('rules/'+r.id,'PUT',{...r,chats:['-1000000000000'],enabled:true});assert.equal(x.status,400);assert.equal(h.read('nexo-white-v15/rules.json')[0].enabled,false);
});
test('V15: restauração acrescenta somente presets ausentes sem sobrescrever edições',async()=>{
 const h=setup(),rules=await h.rules();await h.req('rules/'+rules[0].id,'DELETE',{confirm:true});let r=await h.req('rules/restore','POST',{confirm:true});assert.equal((await r.json()).added,1);r=await h.req('rules/restore','POST',{confirm:true});assert.equal((await r.json()).added,0);
});
test('V15: bot desligado nunca envia mensagens, mesmo com padrões ativados',async()=>{
 const h=setup();await h.enable('debt4');const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:true})};try{await h.ingest(row(1,4,'2026-11-15T20:00:00'),row(2,1,'2026-11-15T20:00:00'),row(3,8,'2026-11-15T20:01:00'),row(4,1,'2026-11-15T20:01:00'),row(5,8,'2026-11-15T20:02:00'));assert.equal(calls,0)}finally{globalThis.fetch=original}
});
test('V15: Telegram sinal e LINK em mensagens distintas; HTML do nome corretamente escapado',async()=>{
 const h=setup(),id='-1001234567890';h.env.NEXO_WHITE_BOT_TOKEN='123456:'+('x'.repeat(32));h.put('nexo-white-v1/config.json',{botEnabled:true,chats:[id]});h.put('nexo-white-v1/chats.json',[{id,name:'Teste',permitted:true}]);const rule=await h.enable('debt4');h.put('nexo-white-v15/config.json',{roundsPerMinute:3,signupEnabled:true,signupUrl:'https://example.org/register?a=1&b=2',signupLabel:'CADASTRE-SE & RECEBA',messageTemplates:{attention:{type:'text',text:'ATENÇÃO'},signal:{type:'text',text:'PEDRA {pedra} · {formula}'},win:{type:'text',text:'WIN'},loss:{type:'text',text:'LOSS'}}});
 const calls=[],old=globalThis.fetch;globalThis.fetch=async(url,opts)=>{calls.push({method:String(url).split('/').at(-1),body:JSON.parse(opts.body)});return Response.json({ok:true,result:{message_id:calls.length}})};
 try{await h.ingest(row(1,4,'2026-11-15T20:00:00'),row(2,1,'2026-11-15T20:00:00'),row(3,8,'2026-11-15T20:01:00'),row(4,1,'2026-11-15T20:01:00'),row(5,8,'2026-11-15T20:02:00'));assert.deepEqual(calls.map(x=>x.method),['sendMessage','sendMessage','sendMessage']);assert.match(calls[1].body.text,/Pedra 1 puxa o próximo branco em até 4 casas/);assert.match(calls[2].body.text,/CADASTRE-SE &amp; RECEBA/);assert.match(calls[2].body.text,/a=1&amp;b=2/);assert.equal(h.read('nexo-white-v15/scores/'+rule.id+'.json').signals,1)}finally{globalThis.fetch=old}
});
test('V15: falha Telegram em um grupo bloqueia só aquele, outros grupos continuam',async()=>{
 const h=setup(),one='-1001234567890',two='-1001234567891';h.env.NEXO_WHITE_BOT_TOKEN='123456:'+('x'.repeat(32));h.put('nexo-white-v1/config.json',{botEnabled:true,chats:[one,two]});h.put('nexo-white-v1/chats.json',[{id:one,permitted:true},{id:two,permitted:true}]);await h.enable('debt4');const calls=[],old=globalThis.fetch;globalThis.fetch=async(url,opt)=>{const b=JSON.parse(opt.body);calls.push(b.chat_id);if(b.chat_id===one)throw Error('Rede incerta');return Response.json({ok:true,result:{message_id:1}})};
 try{await h.ingest(row(1,4,'2026-11-15T20:00:00'),row(2,1,'2026-11-15T20:00:00'),row(3,8,'2026-11-15T20:01:00'),row(4,1,'2026-11-15T20:01:00'),row(5,8,'2026-11-15T20:02:00'));assert.deepEqual(calls,[one,two,two]);const v=await h.req('overview');assert.equal((await v.json()).blocked.length,1)}finally{globalThis.fetch=old}
});
