// NEXO BRANCO VIP V1 — isolated R2 namespace, standalone Telegram bot.
const ROOT='nexo-branco-vip/v1/';
const KEY={cfg:ROOT+'config.json',token:ROOT+'bot-aes.json',groups:ROOT+'groups.json',media:ROOT+'media.json',owner:'nexo-v3/telegram/owner.json'};
const events=['attention','entry','green','red'];
const defs=[
 {id:'branco-r1',name:'Pedra 4 → próxima dezena',description:'Depois da pedra 4, use o minuto da pedra seguinte e calcule a próxima dezena.'},
 {id:'branco-r2',name:'Pedra 11 → minuto final 4',description:'Pedra 11: um minuto anterior como referência; próximo minuto terminado em 4.'},
 {id:'branco-r3',name:'Branco + vizinhos',description:'Branco: número anterior + minuto do branco + número posterior; soma com transporte de hora.'},
 {id:'branco-r4',name:'Branco no minuto 0',description:'Branco em minuto 00, 10, 20, 30, 40 ou 50; somar números vizinhos ao minuto.'},
 {id:'branco-r5',name:'Pedra devedora após 4',description:'Número imediatamente depois da pedra 4: branco nas próximas N rodadas.'},
 {id:'branco-r6',name:'Pedra devedora antes do 11',description:'Número imediatamente antes da pedra 11: branco nas próximas N rodadas.'}
];
const defaults=()=>({version:1,enabled:false,revision:0,protection:true,offset:4,houses4:4,houses11:4,templates:{attention:{text:'⚠️ ATENÇÃO · BRANCO',type:'text',assetId:''},entry:{text:'BLITZ PRO BRANCO\n     ▫️{hora}:{minuto}▫️{numero}',type:'text',assetId:''},green:{text:'✅ GREEN BRANCO',type:'text',assetId:''},red:{text:'🔴 RED BRANCO',type:'text',assetId:''}},strategies:defs.map(x=>({...x,enabled:true})),updatedAt:0});
const normalizeCfg=x=>({...defaults(),...x,protection:true,offset:4,strategies:defs.map(d=>({...d,enabled:x?.strategies?.find(s=>s.id===d.id)?.enabled??true})),houses4:Number.isInteger(x?.houses4)?x.houses4:4,houses11:Number.isInteger(x?.houses11)?x.houses11:4});
const j=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(e,status=400)=>j({ok:false,error:e},status);
const get=async(env,k,d)=>{const r=await env.R2.get(k);if(!r)return structuredClone(d);try{return await r.json()}catch{throw Error('JSON corrompido em '+k)}};
const put=(env,k,o)=>env.R2.put(k,JSON.stringify(o),{httpMetadata:{contentType:'application/json'}});
const utf=new TextEncoder();
const secret=env=>env.NEXO_BOT_ENCRYPTION_KEY || env.NEXO_BRANCO_KEY || '';
async function cryptoKey(env){if(secret(env).length<32)throw Error('Configure o secret NEXO_BOT_ENCRYPTION_KEY ou NEXO_BRANCO_KEY (minimo 32 caracteres).');const digest=await crypto.subtle.digest('SHA-256',utf.encode(secret(env)));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt'])}
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function saveToken(env,token){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf.encode('NEXO-BRANCO-VIP-1')},await cryptoKey(env),utf.encode(token));await put(env,KEY.token,{v:1,iv:b64(iv),cipher:b64(cipher)})}
async function openToken(env){const stored=await get(env,KEY.token,null);if(!stored)return null;const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(stored.iv),additionalData:utf.encode('NEXO-BRANCO-VIP-1')},await cryptoKey(env),un64(stored.cipher));return new TextDecoder().decode(raw)}
async function stats(env){return get(env,ROOT+'scores.json',{})}
function validCfg(b,prev){
 if(!b||typeof b!=='object')throw Error('JSON invalido');
 const cfg={...prev};
 if(typeof b.enabled==='boolean')cfg.enabled=b.enabled;
 cfg.protection=true;
 cfg.offset=4;
 for(const field of ['houses4','houses11']){if(b[field]!==undefined){if(!Number.isInteger(b[field])||b[field]<1||b[field]>30)throw Error('Casas devem ficar de 1 a 30');cfg[field]=b[field]}}
 if(b.strategies!==undefined){if(!Array.isArray(b.strategies)||b.strategies.length!==6||defs.some((d,i)=>b.strategies[i]?.id!==d.id||typeof b.strategies[i].enabled!=='boolean'))throw Error('As seis estrategias sao fixas e nao podem ser excluidas');cfg.strategies=defs.map((d,i)=>({...d,enabled:b.strategies[i].enabled}))}
 if(b.templates!==undefined){if(!b.templates||typeof b.templates!=='object')throw Error('Modelos invalidos');const all=cfg.templates={...cfg.templates};for(const e of events){if(!b.templates[e])continue;const x=b.templates[e],type=x.type||'text';if(!['text','sticker','gif'].includes(type)||typeof x.text!=='string'||x.text.length>1500)throw Error('Modelo invalido em '+e);all[e]={type,text:x.text,assetId:type==='text'?'':String(x.assetId||'')};}}
 cfg.revision=(Number(prev.revision)||0)+1;cfg.updatedAt=Math.floor(Date.now()/1000);return cfg;
}
// Called from routeAdmin AFTER cookie authorization.
export async function brancoVipAdmin(req,env,url){
 const p=url.pathname;if(!p.startsWith('/api/adm/branco-vip'))return null;
 if(!env.R2)return fail('R2 indisponivel',503);
 const cfg=normalizeCfg(await get(env,KEY.cfg,defaults())),owner=await get(env,KEY.owner,null);
 const groups=await get(env,KEY.groups,[]),media=await get(env,KEY.media,[]);
 if(p==='/api/adm/branco-vip'&&req.method==='GET')return j({ok:true,config:cfg,ownerIdConfigured:!!owner?.id,tokenConfigured:!!await get(env,KEY.token,null),groups,media,scores:await stats(env),heartbeat:await get(env,ROOT+'heartbeat.json',null)});
 if(p.startsWith('/api/adm/branco-vip/preview/')&&req.method==='GET'){
  const id=p.split('/').pop(),item=media.find(x=>x.id===id);if(!item)return fail('Midia nao encontrada',404);
  const file=await env.R2.get(ROOT+'preview/'+id);if(!file)return fail('Previa ainda nao enviada',404);
  return new Response(file.body,{headers:{'Content-Type':item.mime||'application/octet-stream','Cache-Control':'private,max-age=120','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}})
 }
 if(p==='/api/adm/branco-vip/token'&&req.method==='POST'){
  const b=await req.json().catch(()=>null),token=String(b?.token||'').trim();
  if(!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token))return fail('Token de Telegram invalido');
  const reply=await fetch('https://api.telegram.org/bot'+token+'/getMe');const result=await reply.json().catch(()=>({}));
  if(!reply.ok||!result.ok)return fail('Telegram nao reconheceu o token',400);
  await saveToken(env,token);return j({ok:true,username:result.result.username||'',notice:'Token salvo criptografado; nao e retornado ao navegador.'})
 }
 if(p==='/api/adm/branco-vip/config'&&req.method==='POST'){
  const b=await req.json().catch(()=>null);let next;try{next=validCfg(b,cfg)}catch(e){return fail(e.message)}
  if(Object.values(next.templates).some(x=>x.type!=='text'&&!media.some(m=>m.id===x.assetId&&m.kind===x.type)))return fail('Selecione uma midia existente para o evento');
  if(next.enabled&&!await get(env,KEY.token,null))return fail('Cadastre um token antes de ligar o branco',409);
  if(next.enabled&&!owner?.id&&!groups.some(x=>x.selected&&x.admin))return fail('Vincule o privado ou selecione grupo autorizado',409);
  await put(env,KEY.cfg,next);return j({ok:true,config:next})
 }
 if(p==='/api/adm/branco-vip/groups'&&req.method==='POST'){
  const b=await req.json().catch(()=>null);if(!Array.isArray(b?.selected))return fail('Lista invalida');const ids=new Set(b.selected.map(String));
  if([...ids].some(id=>!groups.some(g=>g.id===id&&g.admin)))return fail('Grupo nao autorizado',409);
  await put(env,KEY.groups,groups.map(g=>({...g,selected:g.admin&&ids.has(g.id)})));return j({ok:true})
 }
 return fail('Rota desconhecida',404)
}
const mediaKind=x=>x==='sticker'||x==='gif';
// Called before routeAdmin, authenticated using the existing ingestion token.
export async function brancoVipSync(req,env,url,tokenOK){
 const p=url.pathname;if(!p.startsWith('/api/branco-vip/'))return null;
 if(!tokenOK(req,env))return fail('Nao autorizado',401);
 if(!env.R2)return fail('R2 indisponivel',503);
 const cfg=normalizeCfg(await get(env,KEY.cfg,defaults())),groups=await get(env,KEY.groups,[]),owner=await get(env,KEY.owner,null),media=await get(env,KEY.media,[]);
 if(p==='/api/branco-vip/sync'&&req.method==='GET'){
  let token=null;try{token=await openToken(env)}catch(e){return fail('Chave de criptografia indisponivel',503)}
  return j({ok:true,config:cfg,groups,media,ownerId:String(owner?.id||''),botToken:token});
 }
 if(p==='/api/branco-vip/status'&&req.method==='POST'){
  const b=await req.json().catch(()=>null);if(!b||!Number.isSafeInteger(b.seq)||b.seq<0||typeof b.running!=='boolean')return fail('Status invalido');
  await put(env,ROOT+'heartbeat.json',{seq:b.seq,running:b.running,at:Math.floor(Date.now()/1000)});return j({ok:true})
 }
 if(p==='/api/branco-vip/groups'&&req.method==='POST'){
  const b=await req.json().catch(()=>null);if(!b||!/^[-]?\d{5,20}$/.test(String(b.id))||typeof b.name!=='string'||typeof b.admin!=='boolean')return fail('Grupo invalido');
  const id=String(b.id),all=await get(env,KEY.groups,[]),prev=all.find(x=>x.id===id);
  await put(env,KEY.groups,[...all.filter(x=>x.id!==id),{id,name:b.name.slice(0,120),admin:b.admin,selected:b.admin&&!!prev?.selected,updatedAt:Date.now()}].slice(-100));return j({ok:true})
 }
 if(p==='/api/branco-vip/media'&&req.method==='POST'){
  const b=await req.json().catch(()=>null),m=b?.media;
  if(!m||!/^b[a-f0-9]{32}$/.test(m.id)||!mediaKind(m.kind)||typeof m.fileId!=='string'||m.fileId.length>350||!['image/webp','image/jpeg','image/png','image/gif','video/mp4'].includes(m.mime)||typeof b.data!=='string'||b.data.length>7_000_000)return fail('Midia invalida');
  if(!/^[-A-Za-z0-9_+/=]+$/.test(b.data))return fail('Base64 invalido');
  const raw=Uint8Array.from(atob(b.data),c=>c.charCodeAt(0));if(raw.length>5*1024*1024||raw.length<30)return fail('Previa excede 5MB ou esta vazia');
  const list=await get(env,KEY.media,[]);if(list.some(x=>x.id===m.id))return j({ok:true,duplicate:true});
  await env.R2.put(ROOT+'preview/'+m.id,raw,{httpMetadata:{contentType:m.mime}});
  await put(env,KEY.media,[...list,{id:m.id,kind:m.kind,fileId:m.fileId,mime:m.mime,name:String(m.name||m.kind).slice(0,60),createdAt:Date.now()}].slice(-100));return j({ok:true})
 }
 if(p==='/api/branco-vip/scores'&&req.method==='POST'){
  const b=await req.json().catch(()=>null);if(!b||!Number.isSafeInteger(b.seq)||b.seq<0||!/^\d{4}-\d{2}-\d{2}$/.test(b.day)||!Array.isArray(b.scores)||b.scores.length!==6)return fail('Placar invalido');
  const previous=await get(env,ROOT+'scores-checkpoint.json',null);
  if(previous&&previous.day===b.day&&b.seq<previous.seq)return fail('Snapshot anterior',409);
  const out={};for(const x of b.scores){if(!defs.some(d=>d.id===x.id)||out[x.id]||!['entries','green','red'].every(k=>Number.isSafeInteger(x[k])&&x[k]>=0&&x[k]<=1000000))return fail('Contador invalido');out[x.id]={day:b.day,entries:x.entries,green:x.green,red:x.red,accuracy:(x.green+x.red)?Math.round(x.green*1000/(x.green+x.red))/10:null}}
  await put(env,ROOT+'scores.json',out);await put(env,ROOT+'scores-checkpoint.json',{day:b.day,seq:b.seq,updatedAt:Date.now()});return j({ok:true,updated:Object.keys(out).length})
 }
 return fail('Rota nao encontrada',404)
}
