/* NEXO Fortune V7.1 — isolated Blitz Fortune Double rules. No legacy Double numbers. */
export const GAME_ID='blitz-fortune-double';
export const COLORS=['red','purple','gold'];
export const TARGETS={red_gold:['red','gold'],purple_gold:['purple','gold'],red:['red'],purple:['purple'],gold:['gold']};
export const LABELS={red:'Vermelho',purple:'Roxo',gold:'Dourado · Panda',red_gold:'Vermelho + Panda',purple_gold:'Roxo + Panda'};
export const MAX_PATTERN=256;
export function validFortuneRow(row){return row&&Number.isSafeInteger(row.seq)&&row.seq>0&&Number.isSafeInteger(row.minute_epoch)&&row.minute_epoch>1700000000&&row.minute_epoch<Math.floor(Date.now()/1000)+300&&COLORS.includes(row.color)&&(row.multiplier===undefined||row.multiplier===null||(row.color==='gold'&&typeof row.multiplier==='number'&&Number.isFinite(row.multiplier)&&row.multiplier>=1&&row.multiplier<=100000));}
export function cleanPattern(pattern){if(!Array.isArray(pattern)||pattern.length<1||pattern.length>MAX_PATTERN||pattern.some(x=>!COLORS.includes(x)))throw Error('Padrão inválido: use 1 a 256 pedras vermelha, roxa ou dourada.');return [...pattern];}
export function cleanRule(input,previous=null){
 const name=String(input?.name??previous?.name??'').trim();
 if(name.length<2||name.length>70)throw Error('Nome da estratégia: 2 a 70 caracteres.');
 const pattern=cleanPattern(input?.pattern??previous?.pattern);
 const target=String(input?.target??previous?.target??'');if(!Object.hasOwn(TARGETS,target))throw Error('Alvo inválido para Fortune Double.');
 const gale=Number(input?.maxGale??previous?.maxGale??0);if(!Number.isInteger(gale)||gale<0||gale>2)throw Error('Gale deve ser 0, 1 ou 2.');
 return {id:previous?.id||crypto.randomUUID().replaceAll('-',''),gameId:GAME_ID,name,pattern,target,maxGale:gale,
  enabled:input.enabled===undefined?previous?.enabled===true:input.enabled===true,archived:false,
  showPandaMultiplier:input.showPandaMultiplier===undefined?previous?.showPandaMultiplier!==false:input.showPandaMultiplier===true,
  createdAt:previous?.createdAt||Date.now(),updatedAt:Date.now()};
}
export function matchesTarget(row,target){return validFortuneRow(row)&&TARGETS[target]?.includes(row.color)===true;}
export function chronologicalRows(items,gaps=[]){
 const seen=new Set();const rows=(Array.isArray(items)?items:[]).filter(r=>{
  if(!validFortuneRow(r)||seen.has(r.seq))return false;seen.add(r.seq);return true;
 }).sort((a,b)=>a.seq-b.seq);
 const broken=new Set((Array.isArray(gaps)?gaps:[]).map(g=>Number(g.after_seq)));
 return {rows,broken};
}
/* Only recorded future outcomes count: if the result isn't in the snapshot, status is pending.
   Only sequences with consecutive internal IDs, respecting gaps, qualify. */
export function validateFortune(history,strategy){
 const pattern=cleanPattern(strategy.pattern),target=String(strategy.target),gale=Number(strategy.maxGale);
 if(!Object.hasOwn(TARGETS,target)||!Number.isInteger(gale)||gale<0||gale>2)throw Error('Regra inválida.');
 const {rows,broken}=chronologicalRows(history?.items,history?.gaps);
 const total=rows.length,n=pattern.length;
 let triggers=0,resolved=0,win=0,red=0,pending=0;
 const byStep=[0,0,0],events=[];let opportunities=0;
 for(let i=n;i<total;i++){
  let good=true;
  for(let j=0;j<n;j++){
   const current=rows[i-n+j];if(current.color!==pattern[j]){good=false;break}
   if(j&& (current.seq!==rows[i-n+j-1].seq+1||broken.has(rows[i-n+j-1].seq))){good=false;break}
  }
  if(!good||rows[i].seq!==rows[i-1].seq+1||broken.has(rows[i-1].seq))continue;
  triggers++;opportunities++;let result='pending',step=null,goldMultiplier=null;
  for(let k=0;k<=gale;k++){
   const index=i+k;
   if(index>=total || (k&&(rows[index].seq!==rows[index-1].seq+1||broken.has(rows[index-1].seq))))break;
   if(matchesTarget(rows[index],target)){
    result='win';step=k;goldMultiplier=rows[index].color==='gold'?rows[index].multiplier??null:null;break;
   }
   if(k===gale){result='red';step=k;}
  }
  if(result==='win'){win++;resolved++;byStep[step]++;}
  else if(result==='red'){red++;resolved++;}else pending++;
  if(events.length<120)events.push({seq:rows[i].seq,minute_epoch:rows[i].minute_epoch,result,step,pandaMultiplier:goldMultiplier});
 }
 return {game_id:GAME_ID,precision:'minute',target,maxGale:gale,patternSize:n,sampleRows:total,triggers,opportunities,resolved,win,red,pending,
  winByStep:{entry:byStep[0],gale1:byStep[1],gale2:byStep[2]},rate:resolved?win/resolved:null,ratePercent:resolved?Math.round(win/resolved*10000)/100:null,
  events,guaranteed:false,source:'nexo-cloud-v5/games/blitz-fortune-double/history.json'};
}
export function pandaDisplay(row){if(row?.color!=='gold')return '';const x=row.multiplier;return typeof x==='number'&&Number.isFinite(x)?Number(x).toFixed(2)+'x':'Multiplicador não informado';}
