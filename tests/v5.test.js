import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAdmin} from '../worker/src/adm.js';
const token='123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';
function memoryR2(){
 const data=new Map();return {
  data,
  async get(key){const value=data.get(key);return value===undefined?null:{async json(){return JSON.parse(value)}}},
  async put(key,value){data.set(key, typeof value==='string'?value:JSON.stringify(value))},
  async delete(key){data.delete(key)},
  async list({prefix}){return {objects:[...data.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key})),truncated:false}}
 };
}
function request(path,options={}){return new Request('https://nexo.test'+path,{...options,headers:{Origin:'https://nexo.test',...(options.headers||{})}})}
function jsonReq(path,body,headers={}){return request(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})}
async function secret(key){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('nexo-v4-webhook:'+key));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
test('V5: grupo detectado automaticamente por mensagem, sticker privado importado e status protegido',async()=>{
 const R2=memoryR2();const env={R2,NEXO_ADM_PASSWORD:'adm-'.repeat(8),NEXO_BOT_ENCRYPTION_KEY:'encryption-key-'.repeat(4),NEXO_TELEGRAM_BOT_TOKEN:token};
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  const method=String(url).split('/').at(-1);
  if(method==='getMe')return Response.json({ok:true,result:{id:123456,is_bot:true,username:'BotNexoTeste'}});
  if(method==='getChatMember')return Response.json({ok:true,result:{status:'administrator'}});
  if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://nexo.test/api/telegram/webhook'}});
  if(method==='sendMessage')return Response.json({ok:true,result:{message_id:55}});
  return Response.json({ok:false,description:'unsupported call'},{status:400});
 };
 try{
  const login=await routeAdmin(jsonReq('/api/adm/login',{password:env.NEXO_ADM_PASSWORD}),env,new URL('https://nexo.test/api/adm/login'));
  assert.equal(login.status,200);
  const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const statusRes=await routeAdmin(request('/api/adm/telegram/status',{headers:{Cookie:cookie}}),env,new URL('https://nexo.test/api/adm/telegram/status'));
  assert.equal(statusRes.status,200);
  const status=await statusRes.json();assert.equal(status.webhook,'connected');assert.equal(status.configured,true);
  const tokenSec=await secret(env.NEXO_BOT_ENCRYPTION_KEY);
  const updates=(body)=>jsonReq('/api/telegram/webhook',body,{'X-Telegram-Bot-Api-Secret-Token':tokenSec});
  const group={id:-10012500,type:'supergroup',title:'Canal Teste NEXO'};
  const received=await routeAdmin(updates({message:{chat:group,text:'Mensagem normal de grupo'}}),env,new URL('https://nexo.test/api/telegram/webhook'));
  assert.equal(received.status,200);
  const found=JSON.parse(R2.data.get('nexo-v3/telegram/groups.json'));
  assert.equal(found.length,1);assert.equal(found[0].name,'Canal Teste NEXO');assert.equal(found[0].admin,true);
  await R2.put('nexo-v3/telegram/owner.json',JSON.stringify({id:'777',pairedAt:0}));
  const response=await routeAdmin(updates({message:{chat:{id:777,type:'private'},from:{id:777},sticker:{file_id:'sticker-valid-file',file_unique_id:'unique-test',emoji:'🔥',file_size:34567}}}),env,new URL('https://nexo.test/api/telegram/webhook'));
  assert.equal(response.status,200);
  const gallery=JSON.parse(R2.data.get('nexo-v3/media/catalog.json'));
  assert.equal(gallery.length,1);assert.equal(gallery[0].kind,'sticker');assert.equal(gallery[0].origin,'telegram');
  assert.equal(gallery[0].fileId,'sticker-valid-file');
  const unauthed=await routeAdmin(request('/api/adm/telegram/status'),env,new URL('https://nexo.test/api/adm/telegram/status'));
  assert.equal(unauthed.status,401);
 }finally{globalThis.fetch=original}
});
