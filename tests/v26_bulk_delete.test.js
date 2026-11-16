import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.js';
import {scheduledAdmin} from '../worker/src/adm.js';

const R='nexo-v3/';
function harness(){
 const data=new Map();let blockCatalogueWrite=false;
 const calls={deletes:[],list:[]};
 const bucket={
  get:async key=>data.has(key)?{json:async()=>structuredClone(JSON.parse(data.get(key)))}:null,
  put:async(key,body)=>{if(key===R+'admin/strategies.json'&&blockCatalogueWrite)throw Error('falha de gravacao simulada');data.set(key,String(body));return {}},
  delete:async key=>{calls.deletes.push(key);data.delete(key)},
  list:async({prefix,limit=100,cursor})=>{
   calls.list.push(prefix);const keys=[...data.keys()].filter(k=>k.startsWith(prefix)).sort();
   const at=cursor?Number(cursor):0;
   const found=keys.slice(at,at+limit);
   return {objects:found.map(key=>({key})),truncated:at+limit<keys.length,cursor:at+limit<keys.length?String(at+limit):undefined};
  },
 };
 const env={R2:bucket,NEXO_ADM_PASSWORD:'w'.repeat(40),NEXO_V1_INGEST_TOKEN:'x'.repeat(44),ASSETS:{fetch:async()=>new Response('ok')}};
 const req=(path,method='GET',body,headers={})=>new Request('https://nexo.test'+path,{method,headers:{Origin:'https://nexo.test',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const doReq=(path,method,body,cookie)=>worker.fetch(req(path,method,body,{Cookie:cookie}),env);
 async function login(){const resp=await worker.fetch(req('/api/adm/login','POST',{password:env.NEXO_ADM_PASSWORD}),env);assert.equal(resp.status,200);return resp.headers.get('set-cookie').split(';')[0]}
 async function create(cookie,name){
  const resp=await doReq('/api/adm/strategies','POST',{name,target:'black',pattern:['red','black'],maxGale:0},cookie);
  assert.equal(resp.status,200);return (await resp.json()).strategy;
 }
 return {data,calls,env,req,doReq,login,create,setFail(value){blockCatalogueWrite=value}};
}

test('V25.4: exclusao em lote exige login, validacao e IDs distintos',async()=>{
 const h=harness(),cookie=await h.login(),a=await h.create(cookie,'Regra Alfa');
 const path='/api/adm/strategies/purge-batch';
 assert.equal((await h.doReq(path,'POST',{ids:[a.id],confirm:true},'')).status,401);
 assert.equal((await h.doReq(path,'POST',{ids:[a.id]},cookie)).status,400);
 assert.equal((await h.doReq(path,'POST',{ids:[a.id,a.id],confirm:true},cookie)).status,400);
 assert.equal((await h.doReq(path,'POST',{ids:[a.id,'b'.repeat(32)],confirm:true},cookie)).status,409);
 assert.equal((await h.doReq(path,'POST',{ids:Array(11).fill(a.id),confirm:true},cookie)).status,400);
 assert.equal(JSON.parse(h.data.get(R+'admin/strategies.json')).length,1);
 assert.equal([...h.data.keys()].filter(k=>k.startsWith(R+'maintenance/purge/')).length,0);
});

test('V25.4: remover duas regras de uma vez preserva terceira e historico, sem limpeza pesada na resposta',async()=>{
 const h=harness(),cookie=await h.login();
 const a=await h.create(cookie,'Alfa');
 const b=await h.create(cookie,'Beta');
 const c=await h.create(cookie,'Gama');
 const score=k=>R+'scores/'+k+'.json';
 h.data.set(score(a.id),JSON.stringify({day:'2026-11-16',green:2,white:1,red:1}));
 h.data.set(score(b.id),JSON.stringify({day:'2026-11-16',green:1,white:0,red:0}));
 h.data.set(score(c.id),JSON.stringify({day:'2026-11-16',green:5,white:0,red:1}));
 const key='nexo-v1/games/brabet-double/latest.json';h.data.set(key,JSON.stringify({items:[{seq:777}]}));
 const response=await h.doReq('/api/adm/strategies/purge-batch','POST',{ids:[a.id,b.id],confirm:true},cookie);
 assert.equal(response.status,200);assert.equal((await response.json()).deleted,2);
 assert.deepEqual(JSON.parse(h.data.get(R+'admin/strategies.json')).map(s=>s.id),[c.id]);
 assert.equal(h.calls.deletes.length,0,'HTTP nao deve executar exclusao R2 custosa');
 assert.equal(h.data.has(score(a.id)),true,'limpeza em background, nao durante HTTP');
 assert.equal(h.data.has(key),true,'historico geral intocado');
 assert.equal(h.data.has(R+'maintenance/purge/'+a.id+'.json'),true);
 assert.equal(h.data.has(R+'maintenance/purge/'+b.id+'.json'),true);
 await scheduledAdmin(h.env);
 await scheduledAdmin(h.env);
 assert.equal(h.data.has(score(a.id)),false);
 assert.equal(h.data.has(score(b.id)),false);
 assert.equal(h.data.has(score(c.id)),true);
 assert.equal(h.data.has(key),true);
 const after=await h.doReq('/api/adm/bootstrap','GET',undefined,cookie);
 assert.equal(after.status,200);assert.deepEqual((await after.json()).strategies.map(s=>s.id),[c.id]);
});

test('V25.4: falha no catalogo nao autoriza cron a apagar regra ainda ativa',async()=>{
 const h=harness(),cookie=await h.login(),a=await h.create(cookie,'Regra Segura');
 const score=R+'scores/'+a.id+'.json';assert.equal(h.data.has(score),true);
 h.setFail(true);
 const response=await h.doReq('/api/adm/strategies/purge-batch','POST',{ids:[a.id],confirm:true},cookie);
 assert.equal(response.status,400);
 h.setFail(false);
 await scheduledAdmin(h.env);
 assert.equal(h.data.has(score),true,'regra ativa fica protegida contra tarefa criada antes de falha');
 assert.equal(JSON.parse(h.data.get(R+'admin/strategies.json'))[0].id,a.id);
 const retry=await h.doReq('/api/adm/strategies/'+a.id+'/purge','POST',{id:a.id,confirm:true},cookie);
 assert.equal(retry.status,200,'rota antiga tambem usa exclusao segura');
 await scheduledAdmin(h.env);
 assert.equal(h.data.has(score),false);
});

test('V25.4: placares de cards exibem percentual historico verificavel, nunca fabricam 100% sem amostra',()=>{
 const js=readFileSync(new URL('../worker/public/adm-v17.js',import.meta.url),'utf8');
 const start=js.indexOf(' function v26Stats(score){');const end=js.indexOf(' function v26UpdateSelection()',start);
 assert.ok(start>=0&&end>start,'funcao do placar visivel nos cards');
 const mockEl=(tag,cls,txt)=>({tag,cls,text:txt,children:[],append(...items){this.children.push(...items)}});
 const fn=new Function('el',js.slice(start,end)+'\nreturn v26Stats;')(mockEl);
 const result=fn({green:2,white:1,red:1});
 assert.deepEqual(result.children[0].children.map(c=>c.children[1].text),[2,1,1,'75,0%']);
 assert.match(result.children[1].text,/4 ciclos encerrados/);
 const empty=fn({green:0,white:0,red:0});
 assert.equal(empty.children[0].children[3].children[1].text,'—');
 assert.match(js,/v26SelectedIds=new Set\(\)/);
 assert.match(js,/check\.type='checkbox'/);
 assert.match(js,/v26ConfirmBulkDelete/);
 const css=readFileSync(new URL('../worker/public/adm-v17.css',import.meta.url),'utf8');
 assert.match(css,/\.v26-card-stats/);
 assert.match(css,/\.v26-bulk-bar/);
});


test('V25.4.1: excluir dono do ciclo limpa o ownerId sem resetar cursor ou outra regra',async()=>{
 const h=harness(),cookie=await h.login();
 const a=await h.create(cookie,'Dono do ciclo'),b=await h.create(cookie,'Outra estrategia');
 const key=R+'runtime/game-owner/brabet-double.json';
 h.data.set(key,JSON.stringify({ownerId:a.id,lastSeq:780,updatedAt:111}));
 const res=await h.doReq('/api/adm/strategies/purge-batch','POST',{ids:[a.id],confirm:true},cookie);
 assert.equal(res.status,200);
 const state=JSON.parse(h.data.get(key));
 assert.equal(state.ownerId,null,'dono removido nao pode bloquear estrategia ativa');
 assert.equal(state.lastSeq,780,'nao alterar cursor das pedras');
 assert.deepEqual(JSON.parse(h.data.get(R+'admin/strategies.json')).map(s=>s.id),[b.id]);
});
