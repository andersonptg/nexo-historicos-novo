import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAdmin} from '../worker/src/adm.js';

function setup(){
 const files=new Map();
 const R2={
  async get(key){return files.has(key)?{async json(){return JSON.parse(files.get(key));}}:null;},
  async put(key,data){files.set(key,typeof data==='string'?data:JSON.stringify(data));},
  async delete(key){files.delete(key);},
  async list({prefix}){return {objects:[...files.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key})),truncated:false};}
 };
 const env={R2,NEXO_ADM_PASSWORD:'n'.repeat(36)};
 const req=(path,method='GET',data=null,cookie='')=>new Request('https://nexo.test'+path,{method,headers:{Origin:'https://nexo.test',...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const call=(path,method='GET',data=null,cookie='')=>{const r=req(path,method,data,cookie);return routeAdmin(r,env,new URL(r.url));};
 async function login(){const r=await call('/api/adm/login','POST',{password:env.NEXO_ADM_PASSWORD});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
 return {files,env,call,login};
}

test('V7: configuração global exige autenticação e persiste no prefixo ADM',async()=>{
 const x=setup();
 assert.equal((await x.call('/api/adm/global-signals')).status,401);
 const cookie=await x.login();
 const initial=await x.call('/api/adm/global-signals','GET',null,cookie);
 assert.equal(initial.status,200);
 assert.equal((await initial.json()).config.registration.enabled,false);
 const save=await x.call('/api/adm/global-signals','PUT',{mode:'event',key:'green',template:{text:'✅ GREEN {numero}',type:'text',assetId:''}},cookie);
 assert.equal(save.status,200);
 const loaded=await x.call('/api/adm/global-signals','GET',null,cookie);
 assert.equal((await loaded.json()).config.templates.green.text,'✅ GREEN {numero}');
 assert.ok(x.files.has('nexo-v3/admin/global-signals.json'));
 assert.ok(![...x.files.keys()].some(x=>x.startsWith('nexo-v1/games/')));
});

test('V7: link somente HTTPS e separado do texto das mensagens',async()=>{
 const x=setup(),cookie=await x.login();
 const bad=await x.call('/api/adm/global-signals','PUT',{mode:'link',registration:{enabled:true,url:'javascript:alert(1)',label:'CADASTRE-SE'}},cookie);
 assert.equal(bad.status,400);
 const good=await x.call('/api/adm/global-signals','PUT',{mode:'link',registration:{enabled:true,url:'https://example.org/cadastro',label:'🔗 CADASTRE-SE'}},cookie);
 assert.equal(good.status,200);
 const conf=(await good.json()).config;
 assert.equal(conf.registration.url,'https://example.org/cadastro');
 assert.equal(conf.templates.entry_black,undefined);
});

test('V7: mídia precisa existir, GALE aceita somente texto, eventos isolados',async()=>{
 const x=setup(),cookie=await x.login();
 const unknown=await x.call('/api/adm/global-signals','PUT',{mode:'event',key:'algum',template:{text:'a',type:'text'}},cookie);
 assert.equal(unknown.status,400);
 const gif=await x.call('/api/adm/global-signals','PUT',{mode:'event',key:'bot_on',template:{text:'BOT ON',type:'gif',assetId:'f'.repeat(32)}},cookie);
 assert.equal(gif.status,400);
 const galeBad=await x.call('/api/adm/global-signals','PUT',{mode:'event',key:'gale1',template:{text:'GALE 1',type:'sticker',assetId:'f'.repeat(32)}},cookie);
 assert.equal(galeBad.status,400);
 const gale=await x.call('/api/adm/global-signals','PUT',{mode:'event',key:'gale1',template:{text:'- - - - GALE 1 - - - -',type:'text'}},cookie);
 assert.equal(gale.status,200);
 const white=await x.call('/api/adm/global-signals','PUT',{mode:'event',key:'white',template:{text:'WIN BRANCO',type:'text'}},cookie);
 assert.equal(white.status,200);
 const config=(await white.json()).config;
 assert.equal(config.templates.gale1.text,'- - - - GALE 1 - - - -');
 assert.equal(config.templates.white.text,'WIN BRANCO');
 assert.equal(config.templates.red,undefined);
});
