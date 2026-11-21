// NEXO Crash Studio: read-only formatting and classification helpers.
// Never predicts or fabricates a result; all stored data comes from existing APIs.
export const TARGETS=[2,5,10,25,50,100];
export const TOOLS=[
 {id:'builder',title:'Montador',icon:'🧱'},
 {id:'validator',title:'Validador',icon:'🔎'},
 {id:'strategies',title:'Salvas',icon:'📚'},
 {id:'candles',title:'Velas',icon:'💠'},
 {id:'stickers',title:'Stickers',icon:'🖼️'},
 {id:'reports',title:'Relatórios',icon:'📊'}
];
export const RANGE_TOKENS=['<2x','2-<4x','4-<10x','>=10x'];
export const PALETTE_FALLBACK=['#ef8296','#ffd16d','#61e3ad','#bb8cff'];
// Cores das velas usadas na central V6.7: abaixo de 2x cinza; a partir de 2x verde.
export function historyStoneColor(multiplier){return Number(multiplier)<2?'#292d3a':'#008b52';}
export function rangeIndex(x){const m=Number(x);if(!Number.isFinite(m)||m<1)return -1;return m<2?0:m<4?1:m<10?2:3;}
export function greenTier(x){const n=Number(x);if(!Number.isFinite(n)||n<2)return null;let tier=2;for(const t of TARGETS){if(n>=t)tier=t;else break;}return tier;}
export function normalPattern(value){
 const parts=Array.isArray(value)?value:String(value||'').split(',');
 const p=parts.map(x=>String(x).trim()).filter(Boolean);
 if(!p.length||p.length>12||p.some(x=>!RANGE_TOKENS.includes(x)))throw Error('Escolha entre 1 e 12 velas nas quatro faixas de cor.');
 return p;
}
export function freshRows(items){
 const now=Math.floor(Date.now()/1000),seen=new Set();
 return (Array.isArray(items)?items:[]).filter(x=>{
  if(!x||!Number.isSafeInteger(x.seq)||x.seq<=0||!Number.isSafeInteger(x.minute_epoch)||x.minute_epoch<1700000000||x.minute_epoch>now+300||!Number.isFinite(Number(x.multiplier))||Number(x.multiplier)<1)return false;
  if(seen.has(x.seq))return false;seen.add(x.seq);return true;
 }).sort((a,b)=>b.seq-a.seq);
}
export function selectGreenDoc(config,multiplier){const tier=greenTier(multiplier);return tier?config?.targets?.[String(tier)]?.green||null:null;}
export function reportRows(items,target){const rows=freshRows(items),hit=rows.filter(x=>Number(x.multiplier)>=target);return {total:rows.length,hits:hit.length,rate:rows.length?hit.length/rows.length:0,max:rows.length?Math.max(...rows.map(x=>Number(x.multiplier))):null,hitRows:hit};}
