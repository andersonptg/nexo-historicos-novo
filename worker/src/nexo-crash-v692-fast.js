// NEXO V6.9.2: analyze all thresholds in a single bounded scan.
// Read-only statistical analysis. Does not publish signals or extrapolate future outcomes.
const CATEGORIES=['<2x','2-<4x','4-<10x','>=10x'];
const CATEGORIZE=x=>x<2?0:x<4?1:x<10?2:3;
function decodePattern(bits,length){
 const pattern=Array(length);let v=bits;
 for(let i=length-1;i>=0;i--){pattern[i]=CATEGORIES[v&3];v>>>=2;}
 return pattern;
}
export function analyzeCrashAllFast(items,{targets=[2,5,10,25,50,100],length=0,minimum=3,minHits=1,gaps=[],maxPatterns=30}={}){
 length=Number(length);minimum=Number(minimum);minHits=Number(minHits);maxPatterns=Math.min(80,Math.max(1,Number(maxPatterns)||30));
 if(!Number.isInteger(length)||length<0||length>12||!Number.isInteger(minimum)||minimum<1||minimum>100||!Number.isInteger(minHits)||minHits<1||minHits>100||!Array.isArray(targets)||targets.length<1||targets.length>7||targets.some(t=>![2,5,10,20,25,50,100].includes(t)))throw Error('Filtros invalidos');
 const now=Math.floor(Date.now()/1000);
 const seq=(Array.isArray(items)?items:[]).filter(x=>x&&Number.isSafeInteger(x.seq)&&x.seq>0&&Number.isSafeInteger(x.minute_epoch)&&x.minute_epoch>1700000000&&x.minute_epoch<now+300&&typeof x.multiplier==='number'&&Number.isFinite(x.multiplier)&&x.multiplier>=1&&x.multiplier<=1e7).sort((a,b)=>a.seq-b.seq);
 const n=seq.length,groups=new Map(),classes=new Uint8Array(n),discontinuities=new Uint32Array(n),boundaries=new Set((Array.isArray(gaps)?gaps:[]).map(x=>Number(x?.after_seq)));
 for(let i=0;i<n;i++){
  classes[i]=CATEGORIZE(seq[i].multiplier);
  if(i)discontinuities[i]=discontinuities[i-1]+(seq[i].seq!==seq[i-1].seq+1||boundaries.has(seq[i-1].seq)?1:0);
 }
 const successes=new Uint32Array(targets.length);
 let eligible=0;
 const lengths=length===0?[3,4,5,6,7,8,9,10,11,12]:[length];
 for(const size of lengths){
  if(size>=n)continue;
  const mask=(1<<(size*2))-1;
  let code=0;
  for(let k=0;k<size;k++)code=(code<<2)|classes[k];
  for(let i=size;i<n;i++){
   if(discontinuities[i]===discontinuities[i-size]){
    const id=size+'|'+code;
    let entry=groups.get(id);
    if(!entry){entry={length:size,code,count:0,hits:new Uint32Array(targets.length)};groups.set(id,entry);}
    entry.count++;eligible++;
    const value=seq[i].multiplier;
    for(let ti=0;ti<targets.length;ti++)if(value>=targets[ti]){entry.hits[ti]++;successes[ti]++;}
   }
   code=((code<<2)|classes[i])&mask;
  }
 }
 const source=[...groups.values()].filter(x=>x.count>=minimum),patternCache=new Map();
 return targets.map((target,ti)=>{
  const baseline=eligible?successes[ti]/eligible:0;
  const patterns=source.filter(x=>x.hits[ti]>=minHits)
    .sort((a,b)=>b.hits[ti]-a.hits[ti]||b.hits[ti]/b.count-a.hits[ti]/a.count||b.count-a.count||a.length-b.length)
    .slice(0,maxPatterns)
    .map(x=>{
     const key=x.length+'|'+x.code;
     if(!patternCache.has(key))patternCache.set(key,decodePattern(x.code,x.length));
     return {length:x.length,pattern:patternCache.get(key),count:x.count,hits:x.hits[ti],rate:x.hits[ti]/x.count,baseline};
    });
  return {target,eligible,baseline,patterns};
 });
}
