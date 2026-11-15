import test from 'node:test';
import assert from 'node:assert/strict';
import {processNewRounds,resetAfterCatchup} from '../worker/src/adm.js';

function harness(){
 const mem=new Map();
 const R2={
  async get(key){return mem.has(key)?{json:async()=>structuredClone(JSON.parse(mem.get(key)))}:null},
  async put(key,value){mem.set(key,typeof value==='string'?value:JSON.stringify(value))},
  async delete(key){mem.delete(key)},
  async list({prefix,limit=100,cursor}){const names=[...mem.keys()].filter(x=>x.startsWith(prefix)).sort(),start=Number(cursor)||0,part=names.slice(start,start+limit);return {objects:part.map(key=>({key})),truncated:start+limit<names.length,cursor:String(start+limit)}}
 };
 const put=(key,val)=>mem.set(key,JSON.stringify(val));
 const env={R2};
 const events=()=>[...mem].filter(([k])=>k.startsWith('nexo-v3/events/')).map(([,v])=>JSON.parse(v));
 const strategy=(id)=>({id,name:'Estratégia '+id.slice(0,2),enabled:true,archived:false,gameId:'brabet-double',pattern:['red','red'],target:'black',maxGale:1,jokerWhite:false,showNumbers:true,messages:{},media:{}});
 const push=async(seq,number,color)=>processNewRounds(env,{id:'brabet-double'},[{seq,id:seq.toString(16).padStart(32,'0'),minute_epoch:Math.floor(Date.now()/60000)*60,number,color}]);
 return {mem,put,env,events,strategy,push};
}

test('V11: somente uma estratégia abre entrada por rodada, mesmo com dois padrões iguais',async()=>{
 const h=harness(),a=h.strategy('a'.repeat(32)),b=h.strategy('b'.repeat(32));
 h.put('nexo-v3/admin/strategies.json',[a,b]);h.put('nexo-v3/admin/settings.json',{botEnabled:false});
 for(const s of [a,b])h.put('nexo-v3/runtime/'+s.id+'.json',{lastSeq:0,recent:[],active:null});
 await h.push(1,1,'red');await h.push(2,2,'red');
 assert.equal(h.events().filter(x=>x.type==='entry_black').length,1);
 assert.equal(JSON.parse(h.mem.get('nexo-v3/runtime/game-owner/brabet-double.json')).ownerId,a.id);
 await h.push(3,11,'black');
 assert.equal(h.events().filter(x=>x.type==='win_black').length,1);
 assert.equal(JSON.parse(h.mem.get('nexo-v3/runtime/game-owner/brabet-double.json')).ownerId,null);
});

test('V12.2: entrada tem cadastro e após-pedra; WIN não repete cadastro',async()=>{
 const h=harness(),s=h.strategy('c'.repeat(32));
 h.put('nexo-v3/admin/strategies.json',[s]);h.put('nexo-v3/admin/settings.json',{botEnabled:false});
 h.put('nexo-v3/runtime/'+s.id+'.json',{lastSeq:0,recent:[],active:null});
 h.put('nexo-v3/admin/global-signals.json',{registration:{enabled:true,url:'https://example.org/registrar',label:'CADASTRE-SE'},templates:{green:{saved:true,type:'text',sendWithMedia:false,text:'✅ WIN NO {pedra}'}}});
 await h.push(1,1,'red');await h.push(2,3,'red');await h.push(3,8,'black');
 const entry=h.events().find(x=>x.type==='entry_black'),win=h.events().find(x=>x.type==='win_black');
 assert.ok(entry?.registration);
 assert.equal(entry.registration.url,'https://example.org/registrar');
 assert.equal(entry.afterPattern,'🎲 Após pedra: 🔴3');
 assert.equal(win.message,'✅ WIN NO ⚫8');
 assert.equal(win.stoneAfter,'🎲 Pedra sorteada: ⚫8');
 assert.equal(win.registration,undefined);
});

test('V11: catchup redefine o cursor e não gera sinais novos',async()=>{
 const h=harness(),s=h.strategy('d'.repeat(32));
 h.put('nexo-v3/admin/strategies.json',[s]);
 h.put('nexo-v3/runtime/'+s.id+'.json',{lastSeq:15,recent:[{number:1,color:'red'}],active:{step:1}});
 await resetAfterCatchup(h.env,{id:'brabet-double'},[{seq:205,id:'e'.repeat(32)}]);
 const state=JSON.parse(h.mem.get('nexo-v3/runtime/'+s.id+'.json'));
 assert.equal(state.lastSeq,205);assert.equal(state.active,null);assert.deepEqual(state.recent,[]);
 assert.equal(JSON.parse(h.mem.get('nexo-v3/runtime/game-owner/brabet-double.json')).ownerId,null);
 assert.equal(h.events().length,0);
});
