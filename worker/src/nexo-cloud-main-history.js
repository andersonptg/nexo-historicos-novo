// NEXO cloud main V1: reconcile observed source rows without importing foreign sequence IDs.
export const enabled=env=>env?.NEXO_CORES_LOCAL_RETIRED==='1'&&env?.NEXO_CLOUD_MAIN_BRIDGE==='1';
const valid=(r,now)=>r&&Number.isSafeInteger(r.minute_epoch)&&r.minute_epoch>1600000000&&r.minute_epoch<=now+120&&Number.isInteger(r.number)&&r.number>=0&&r.number<=14&&r.color===(r.number===0?'white':r.number<=7?'red':'black');
const equal=(a,b)=>a.minute_epoch===b.minute_epoch&&a.number===b.number&&a.color===b.color;
export async function planCloudRows(old,source,now,minimumSeq=0,initial=false){
 if(!Array.isArray(old)||!Array.isArray(source)||source.length<8||source.length>200||source.some((r,i)=>!valid(r,now)||(i&&r.minute_epoch>source[i-1].minute_epoch)))throw Error('Janela cloud invalida');
 if(now-source[0].minute_epoch>150)throw Error('Fonte cloud sem rodada recente');
 if(old.some((r,i)=>!valid(r,now)||!Number.isSafeInteger(r.seq)||r.seq<=0||! /^[a-f0-9]{32}$/.test(r.id)|| (i&&r.minute_epoch>old[i-1].minute_epoch)))throw Error('Historico principal sem sequencia verificavel');
 if(!Number.isSafeInteger(minimumSeq)||minimumSeq<0)throw Error('Cursor principal invalido');
 const lastSeq=Math.max(minimumSeq,0,...old.map(r=>r.seq));
 let count=0,gap=false;
 if(!old.length){if(lastSeq)throw Error('Cursor existente sem historico principal');count=source.length;gap=true;}
 else{
  // Match the newest existing row and the immediately preceding observed rows.
  const required=Math.min(old.length,8);
  if(required<4)throw Error('Historico principal insuficiente para conciliar');
  const matches=[];
  for(let i=0;i+required<=source.length;i++)if(old.slice(0,required).every((r,j)=>equal(r,source[i+j])))matches.push(i);
  if(matches.length>1)throw Error('Sobreposicao ambigua; nenhum dado alterado');
  if(matches.length===1)count=matches[0];
  else if(source.at(-1).minute_epoch>old[0].minute_epoch){count=source.length;gap=true;}
  else if(source[0].minute_epoch<old[0].minute_epoch)return {rows:[],catchup:false,gap:false};
  else throw Error('Sem sobreposicao segura; nenhum dado alterado');
 }
 const rows=[];
 for(let i=count-1;i>=0;i--){
  const r=source[i],seq=lastSeq+count-i;
  if(!Number.isSafeInteger(seq))throw Error('Cursor excedido');
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`nexo-cloud-main-v1|blitz-double|${seq}|${r.minute_epoch}|${r.number}`)));
  rows.push({id:[...hash.slice(0,16)].map(v=>v.toString(16).padStart(2,'0')).join(''),seq,number:r.number,color:r.color,minute_epoch:r.minute_epoch});
 }
 return {rows,catchup:initial||gap||count>3||rows.some(r=>now-r.minute_epoch>150),gap};
}
