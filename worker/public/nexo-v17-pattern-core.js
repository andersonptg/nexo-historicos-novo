/* NEXO V17 pattern mining (historical only). Browser and Node VM compatible. */
(function(root){
 'use strict';
 const VALID=new Set(['red','black','white']);
 const patternName=t=>t.startsWith('n:')?({red:'🔴',black:'⚫',white:'⚪'}[colorOf(Number(t.slice(2)))]+t.slice(2)):({red:'🔴',black:'⚫',white:'⚪'}[t]||'?');
 function colorOf(n){return n===0?'white':n>=1&&n<=7?'red':'black'}
 function normalize(raw){const arr=[],seen=new Set();for(const v of raw){const n=Number(v.number),ts=Number(v.minute_epoch),seq=Number(v.seq);if(!Number.isInteger(n)||n<0||n>14||!Number.isSafeInteger(ts)||ts<1)continue;const c=colorOf(n);if(v.color!==c)continue;const key=String(v.id||'')||`${seq}:${ts}:${n}`;if(seen.has(key))continue;seen.add(key);arr.push({number:n,color:c,minute_epoch:ts,seq:Number.isSafeInteger(seq)&&seq>0?seq:null,id:key});}
  arr.sort((a,b)=>a.minute_epoch-b.minute_epoch||(a.seq||0)-(b.seq||0));return arr}
 function consecutive(a,b){if(!a||!b||b.minute_epoch<a.minute_epoch||b.minute_epoch-a.minute_epoch>180)return false;if(a.seq&&b.seq&&b.seq!==a.seq+1)return false;return true}
 function variants(rows){const base=rows.map(r=>r.color),out=[base];out.push(rows.map(r=>'n:'+r.number));for(let j=0;j<base.length;j++){const mix=base.slice();mix[j]='n:'+rows[j].number;out.push(mix)}return out}
 function mine(raw,{minHits=5,maxLength=7,minLength=2,maxRecords=120000}={}){
  if(!Number.isInteger(minHits)||minHits<1||minHits>100000)throw Error('Número de acertos inválido');
  maxLength=Math.max(2,Math.min(7,Number(maxLength)||7));minLength=Math.max(2,Math.min(maxLength,Number(minLength)||2));
  const all=normalize(raw),truncated=all.length>maxRecords,rows=truncated?all.slice(-maxRecords):all;
  const hits=new Map(),lenTotal=rows.length;
  for(let i=0;i<lenTotal-minLength-1;i++){
   let contiguous=true;
   for(let L=minLength;L<=maxLength&&i+L+1<lenTotal;L++){
    for(let j=(L===minLength?1:L+1);j<=L+1;j++)if(!consecutive(rows[i+j-1],rows[i+j]))contiguous=false;
    if(!contiguous)break;
    const seqRows=rows.slice(i,i+L);const a=rows[i+L],b=rows[i+L+1];
    if(!a||!b)continue;
    const patterns=variants(seqRows);const keys=new Set();
    for(const tokens of patterns){const key=tokens.join(',');if(keys.has(key))continue;keys.add(key);
     for(const target of VALID){const k=key+'|'+target;let st=hits.get(k);if(!st){st={tokens,target,total:0,first:0,second:0,fail:0,lastAt:0};hits.set(k,st)}
      st.total++;if(a.color===target)st.first++;else if(b.color===target)st.second++;else st.fail++;
      st.lastAt=Math.max(st.lastAt,rows[i+L-1].minute_epoch);
     }
    }
   }
  }
  const items=[...hits.values()].filter(x=>x.first+x.second>=minHits&&x.fail===0).map(x=>({...x,accuracy:(x.first+x.second)/x.total,pattern:x.tokens.map(patternName).join(' → '),hits:x.first+x.second}));
  items.sort((a,b)=>b.hits-a.hits||a.tokens.length-b.tokens.length||a.pattern.localeCompare(b.pattern));
  return {items,records:rows.length,available:all.length,truncated,candidates:hits.size,notes:'100% significa somente ausência de falhas nas ocorrências observadas; não prevê a próxima rodada.'};
 }
 root.NEXO_V17_PATTERN={mine,normalize,colorOf};
})(typeof window!=='undefined'?window:globalThis);
