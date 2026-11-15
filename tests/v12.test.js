import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import {processNewRounds} from '../worker/src/adm.js';

function harness(){
 const mem=new Map(),sent=[];
 const R2={
  async get(key){return mem.has(key)?{async json(){return structuredClone(JSON.parse(mem.get(key)))}}:null},
  async put(key,val){mem.set(key,typeof val==='string'?val:JSON.stringify(val))},
  async delete(key){mem.delete(key)},
  async list({prefix,limit=100,cursor}){const ks=[...mem.keys()].filter(x=>x.startsWith(prefix)).sort(),n=Number(cursor)||0,part=ks.slice(n,n+limit);return {objects:part.map(key=>({key})),truncated:n+limit<ks.length,cursor:String(n+limit)}}
 };
 const env={R2,NEXO_TELEGRAM_BOT_TOKEN:'123456:'+('a'.repeat(32)),NEXO_V1_INGEST_TOKEN:'v'.repeat(48),NEXO_ADM_PASSWORD:'h'.repeat(38)};
 const put=(k,v)=>mem.set(k,JSON.stringify(v));
 const sid='a'.repeat(32);
 const strategy={id:sid,name:'NEXO teste V12',gameId:'brabet-double',enabled:true,archived:false,pattern:['red','red'],target:'black',maxGale:0,showNumbers:true,showStoneAfter:true,jokerWhite:false,messages:{},media:{}};
 const setup=()=>{
  put('nexo-v3/admin/strategies.json',[strategy]);put('nexo-v3/admin/settings.json',{botEnabled:true});
  put('nexo-v3/runtime/'+sid+'.json',{lastSeq:0,recent:[],active:null});
  put('nexo-v3/telegram/owner.json',{id:'123456789'});
  put('nexo-v3/telegram/groups.json',[]);
 };
 const events=()=>[...mem].filter(([k])=>k.startsWith('nexo-v3/events/')).map(([,v])=>JSON.parse(v));
 const row=(seq,num,color)=>({id:seq.toString(16).padStart(32,'0'),seq,number:num,color,minute_epoch:Math.floor(Date.now()/60000)*60});
 return {mem,env,sid,strategy,put,setup,events,sent,row};
}

test('V12: WIN com sticker NAO envia texto e nao envia pedra quando opcao desativada',async()=>{
 const h=harness();h.setup();
 h.put('nexo-v3/admin/global-signals.json',{stone:{enabled:false,text:'Pedra: {quadrado}'},templates:{green:{saved:true,type:'sticker',assetId:'f'.repeat(32),text:'✅ WIN NO {pedra}'}},registration:{enabled:false}});
 h.put('nexo-v3/media/catalog.json',[{id:'f'.repeat(32),kind:'sticker',fileId:'sticker-123'}]);
 const old=globalThis.fetch;let count=900;
 globalThis.fetch=async(url,opt)=>{
  const method=String(url).split('/').at(-1),data=opt.body instanceof FormData?{}:JSON.parse(opt.body);
  h.sent.push({method,data});return Response.json({ok:true,result:{message_id:++count}});
 };
 try{
  for(const r of [h.row(1,1,'red'),h.row(2,2,'red'),h.row(3,8,'black')])await processNewRounds(h.env,{id:'brabet-double'},[r]);
  const sends=h.sent.filter(x=>x.method==='sendMessage').map(x=>x.data.text);
  assert.ok(sends.some(x=>x.includes('ENTRADA')),'Entrada deve ser texto');
  assert.equal(h.sent.filter(x=>x.method==='sendSticker').length,1,'WIN deve usar só sticker');
  assert.ok(!sends.some(x=>x.includes('WIN')||x.includes('Pedra')),'Sem texto de WIN nem pedra desligada');
  const win=h.events().find(x=>x.type==='win_black');assert.ok(win);assert.equal(win.stoneAfter,undefined);
 }finally{globalThis.fetch=old;}
});

test('V12: modelo editavel da pedra usa quadradinho, e estrategia pode omitir só a sua pedra',async()=>{
 const h=harness();h.setup();h.put('nexo-v3/admin/settings.json',{botEnabled:false});
 h.put('nexo-v3/admin/global-signals.json',{stone:{enabled:true,text:'🎲 Resultado: {quadrado} / {cor}'},templates:{green:{saved:true,type:'text',assetId:'',text:'✅ WIN NO {pedra}'}}});
 for(const r of [h.row(1,2,'red'),h.row(2,3,'red'),h.row(3,8,'black')])await processNewRounds(h.env,{id:'brabet-double'},[r]);
 const win=h.events().find(x=>x.type==='win_black');
 assert.equal(win.message,'✅ WIN NO ⚫8');
 assert.equal(win.stoneAfter,'🎲 Resultado: ⬛8 / PRETO');
 const g=harness();g.setup();g.put('nexo-v3/admin/settings.json',{botEnabled:false});g.strategy.showStoneAfter=false;g.put('nexo-v3/admin/strategies.json',[g.strategy]);
 for(const r of [g.row(1,2,'red'),g.row(2,3,'red'),g.row(3,8,'black')])await processNewRounds(g.env,{id:'brabet-double'},[r]);
 assert.equal(g.events().find(x=>x.type==='win_black').stoneAfter,undefined);
});

test('V12: lote de 4 resultados novos é importado como catchup sem sinais atrasados',async()=>{
 const h=harness();h.setup();h.put('nexo-v3/admin/settings.json',{botEnabled:false});
 const items=[h.row(1,1,'red'),h.row(2,2,'red'),h.row(3,8,'black'),h.row(4,3,'red')];
 const req=new Request('https://nexo.test/api/ingest',{method:'POST',headers:{'Authorization':'Bearer '+h.env.NEXO_V1_INGEST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({game_id:'brabet-double',items})});
 const r=await worker.fetch(req,h.env),body=await r.json();
 assert.equal(r.status,200);assert.equal(body.catchup,true);assert.equal(body.skipped_signal_burst,true);
 assert.equal(h.events().length,0);
 assert.equal(JSON.parse(h.mem.get('nexo-v3/runtime/'+h.sid+'.json')).lastSeq,4);
});

test('V12: campo da pedra é protegido por sessão e não aceita valores inválidos',async()=>{
 const h=harness();
 const send=(p,method,body,cookie)=>worker.fetch(new Request('https://nexo.test'+p,{method,headers:{'Content-Type':'application/json',Origin:'https://nexo.test',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}),h.env);
 const denied=await send('/api/adm/global-signals','PUT',{mode:'stone',stone:{enabled:false,text:''}});
 assert.equal(denied.status,401);
 const login=await send('/api/adm/login','POST',{password:h.env.NEXO_ADM_PASSWORD});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const bad=await send('/api/adm/global-signals','PUT',{mode:'stone',stone:{enabled:true,text:'x'.repeat(401)}},cookie);
 assert.equal(bad.status,400);
 const saved=await send('/api/adm/global-signals','PUT',{mode:'stone',stone:{enabled:false,text:'🎲 {quadrado}'}},cookie);
 assert.equal(saved.status,200);
 const data=await saved.json();assert.deepEqual(data.config.stone,{enabled:false,text:'🎲 {quadrado}'});
});
