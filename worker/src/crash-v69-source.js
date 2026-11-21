/* NEXO V6.9 — fonte mais recente para a pesquisa estatística do Blitz Crash.
 * Somente leitura: preserva os arquivos históricos e não envia Telegram.
 */
const newestMinute=doc=>Math.max(0,...(Array.isArray(doc?.items)?doc.items:[]).slice(0,1500).map(x=>Number(x?.minute_epoch)||0));
const updatedMs=doc=>{const n=Number(doc?.updated_at)||0;return n>1e11?n:n*1000;};
export async function readNewestCrash(env){
 const fetchDoc=async key=>{const obj=await env.R2.get(key);return obj?await obj.json():null;};
 const [legacy,cloud]=await Promise.allSettled([
  fetchDoc('nexo-crash-v2/history.json'),
  fetchDoc('nexo-cloud-v5/games/blitz-crash/history.json')
 ]);
 const a=legacy.status==='fulfilled'?legacy.value:null;
 const b=cloud.status==='fulfilled'?cloud.value:null;
 if(!a&&!b){
  if(legacy.status==='rejected'&&cloud.status==='rejected')throw Error('Historicos Crash indisponiveis');
  return {items:[],gaps:[],updated_at:null,source_label:'Sem historico'};
 }
 const ma=newestMinute(a),mb=newestMinute(b);
 const chooseCloud=!!b&&(!a||mb>ma||(mb===ma&&updatedMs(b)>=updatedMs(a)));
 const result=chooseCloud?b:a;
 return {...result,items:Array.isArray(result.items)?result.items:[],gaps:Array.isArray(result.gaps)?result.gaps:[],source_label:chooseCloud?'Cloud · R2':'Historico · R2'};
}
