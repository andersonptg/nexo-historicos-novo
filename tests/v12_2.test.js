import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import {processNewRounds} from '../worker/src/adm.js';

function harness({gale=0,stone=true,after=true}={}){
 const data=new Map(),sent=[];
 const R2={
  get:async key=>data.has(key)?{json:async()=>structuredClone(JSON.parse(data.get(key)))}:null,
  put:async(key,value)=>{data.set(key,typeof value==='string'?value:JSON.stringify(value))},
  delete:async key=>data.delete(key),
  list:async({prefix,limit=100,cursor})=>{const keys=[...data.keys()].filter(k=>k.startsWith(prefix)).sort(),start=Number(cursor)||0,part=keys.slice(start,start+limit);return {objects:part.map(key=>({key})),truncated:start+limit<keys.length,cursor:String(start+part.length)}}
 };
 const env={R2,NEXO_TELEGRAM_BOT_TOKEN:'123456:'+('a'.repeat(32)),NEXO_ADM_PASSWORD:'h'.repeat(40)};
 const sid='a'.repeat(32),otherSid='b'.repeat(32);
 const strategy={id:sid,name:'Teste Exclusão e Após Pedra',gameId:'brabet-double',target:'black',pattern:['red','red'],maxGale:gale,enabled:true,archived:false,jokerWhite:false,showNumbers:true,showStoneAfter:stone,showAfterPattern:after,messages:{},media:{}};
 const put=(key,val)=>data.set(key,JSON.stringify(val));
 const row=(seq,number,color)=>({seq,id:seq.toString(16).padStart(32,'0'),number,color,minute_epoch:Math.floor(Date.now()/60000)*60});
 put('nexo-v3/admin/strategies.json',[strategy]);
 put('nexo-v3/admin/settings.json',{botEnabled:true});
 put('nexo-v3/runtime/'+sid+'.json',{lastSeq:0,recent:[],active:null});
 put('nexo-v3/telegram/owner.json',{id:'123456789'});
 put('nexo-v3/admin/global-signals.json',{version:3,registration:{enabled:true,url:'https://example.org/cadastro',label:'🔗 CADASTRE-SE'},afterPattern:{enabled:true,text:'🎲 Após pedra: {pedra}'},stone:{enabled:true,text:'🎲 Pedra sorteada: {pedra}'},templates:{}});
 const events=()=>[...data].filter(([k])=>k.startsWith('nexo-v3/events/')).map(([,v])=>JSON.parse(v));
 return {data,sent,R2,env,strategy,sid,otherSid,put,row,events};
}
async function withTelegram(h,fn){
 const old=globalThis.fetch;let counter=1200;
 globalThis.fetch=async(url,options={})=>{
  const method=String(url).split('/').at(-1),params=options.body instanceof FormData?{}:JSON.parse(options.body||'{}');
  h.sent.push({method,params});
  return Response.json({ok:true,result:{message_id:++counter}});
 };
 try{return await fn()}finally{globalThis.fetch=old}
}
const msgs=h=>h.sent.filter(x=>x.method==='sendMessage').map(x=>x.params.text);

test('V12.2: entrada, cadastro e apos-pedra são 3 balões distintos e ordenados; WIN recebe pedra circular',async()=>{
 const h=harness();
 await withTelegram(h,async()=>{
  await processNewRounds(h.env,{id:'brabet-double'},[h.row(1,1,'red')]);
  await processNewRounds(h.env,{id:'brabet-double'},[h.row(2,6,'red')]);
  await processNewRounds(h.env,{id:'brabet-double'},[h.row(3,8,'black')]);
 });
 const out=msgs(h);
 assert.equal(out.length,5,JSON.stringify(out));
 assert.match(out[0],/ENTRADA CONFIRMADA/);
 assert.equal(out[1],'🔗 CADASTRE-SE');
 assert.equal(out[2],'🎲 Após pedra: 🔴6');
 assert.match(out[3],/WIN NO ⚫8/);
 assert.equal(out[4],'🎲 Pedra sorteada: ⚫8');
 const entry=h.events().find(e=>e.type==='entry_black');
 const win=h.events().find(e=>e.type==='win_black');
 assert.equal(entry.afterPattern,'🎲 Após pedra: 🔴6');
 assert.ok(entry.registration);
 assert.equal(win.registration,undefined);
});

test('V12.2: RED não envia pedra sorteada mesmo se opção global e estratégia estiverem ligadas',async()=>{
 const h=harness();
 await withTelegram(h,async()=>{
  for(const r of [h.row(1,1,'red'),h.row(2,2,'red'),h.row(3,5,'red')])await processNewRounds(h.env,{id:'brabet-double'},[r]);
 });
 const out=msgs(h);
 assert.equal(out.filter(m=>m.includes('Pedra sorteada')).length,0);
 assert.equal(out.filter(m=>m.includes('Após pedra')).length,1);
 assert.equal(out.filter(m=>m.includes('CADASTRE-SE')).length,1);
 assert.equal(out.filter(m=>m.includes('RED')).length,1);
 const red=h.events().find(e=>e.type==='red');assert.ok(red);assert.equal(red.stoneAfter,undefined);
});

test('V12.2: pode desativar após-pedra por estratégia sem desativar o cadastro',async()=>{
 const h=harness({after:false});
 await withTelegram(h,async()=>{
  for(const r of [h.row(1,1,'red'),h.row(2,4,'red')])await processNewRounds(h.env,{id:'brabet-double'},[r]);
 });
 const out=msgs(h);assert.equal(out.length,2);assert.ok(out[0].includes('ENTRADA'));assert.equal(out[1],'🔗 CADASTRE-SE');
 assert.equal(h.events().find(e=>e.type==='entry_black').afterPattern,undefined);
});

test('V12.2: exclusão por ID, após confirmação, preserva outra estratégia e dados históricos',async()=>{
 const h=harness();h.put('nexo-v3/admin/settings.json',{botEnabled:false});
 const other={...h.strategy,id:h.otherSid,name:'Outra Regra',enabled:false};
 h.put('nexo-v3/admin/strategies.json',[h.strategy,other]);
 h.put('nexo-v3/runtime/'+h.otherSid+'.json',{lastSeq:10,recent:[],active:null});
 h.put('nexo-v3/runtime/game-owner/brabet-double.json',{ownerId:h.sid,lastSeq:10});
 h.put('nexo-v1/games/brabet-double/latest.json',{game_id:'brabet-double',items:[h.row(10,8,'black')]});
 const base='https://nexo.test';
 const request=(path,body,cookie='')=>worker.fetch(new Request(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}),h.env);
 const login=await request('/api/adm/login',{password:h.env.NEXO_ADM_PASSWORD});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const route='/api/adm/strategies/'+h.sid+'/purge';
 assert.equal((await request(route,{confirm:true,id:h.otherSid},cookie)).status,400,'outro ID não pode apagar esta regra');
 const removed=await request(route,{confirm:true,id:h.sid},cookie);assert.equal(removed.status,200,await removed.text());
 assert.deepEqual(JSON.parse(h.data.get('nexo-v3/admin/strategies.json')).map(s=>s.id),[h.otherSid]);
 assert.ok(h.data.has('nexo-v3/runtime/'+h.otherSid+'.json'));
 assert.ok(h.data.has('nexo-v1/games/brabet-double/latest.json'));
 assert.equal(JSON.parse(h.data.get('nexo-v3/runtime/game-owner/brabet-double.json')).ownerId,null);
});

test('V12.2: editar modelo após-pedra exige sessão e valida tamanho',async()=>{
 const h=harness();
 const base='https://nexo.test';
 const req=(path,body,cookie='')=>worker.fetch(new Request(base+path,{method:body?.password?'POST':'PUT',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}),h.env);
 const denied=await req('/api/adm/global-signals',{mode:'afterPattern',afterPattern:{enabled:true,text:'Após {pedra}'}});assert.equal(denied.status,401);
 const login=await req('/api/adm/login',{password:h.env.NEXO_ADM_PASSWORD});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await req('/api/adm/global-signals',{mode:'afterPattern',afterPattern:{enabled:true,text:'x'.repeat(401)}},cookie)).status,400);
 const ok=await req('/api/adm/global-signals',{mode:'afterPattern',afterPattern:{enabled:true,text:'Após pedra: {pedra}'}},cookie);assert.equal(ok.status,200);
 assert.equal((await ok.json()).config.afterPattern.text,'Após pedra: {pedra}');
});
