// Historical reconciliation only. No changes to Telegram or strategy activation.
const eq=(a,b)=>a?.minute_epoch===b?.minute_epoch&&a?.number===b?.number&&a?.color===b?.color;
export function validWindow(rows,now){
 return Array.isArray(rows)&&rows.length>=8&&rows.length<=200&&rows.every((r,i)=>r&&Number.isInteger(r.number)&&r.number>=0&&r.number<=14&&r.color===(r.number===0?'white':r.number<=7?'red':'black')&&Number.isSafeInteger(r.minute_epoch)&&r.minute_epoch%60===0&&r.minute_epoch>1600000000&&r.minute_epoch<=now+120&&(!i||(rows[i-1].minute_epoch>=r.minute_epoch&&rows[i-1].minute_epoch-r.minute_epoch<=900)))&&now-rows[0].minute_epoch<=150&&rows[0].minute_epoch-rows.at(-1).minute_epoch<=21600;
}
export function headMatch(old,source){
 if(!Array.isArray(old)||old.length<8)return null;
 const found=[];
 for(let i=0;i+8<=source.length;i++)if(old.slice(0,8).every((r,j)=>eq(r,source[i+j])))found.push(i);
 return found.length===1?found[0]:null;
}
export function strictlyNewer(source,cutoff){return source.filter(r=>r.minute_epoch>cutoff);}
export function recoveryPrefix(old,source,prior,now){
 if(!old?.length||!validWindow(source,now)||!Number.isSafeInteger(prior?.at)||now-prior.at<15||now-prior.at>1800||prior.seq!==old[0].seq||prior.cutoff!==old[0].minute_epoch||!validWindow(prior.rows,prior.at))return null;
 const overlap=headMatch(prior.rows,source);
 if(overlap===null||overlap===0||source[0].minute_epoch<=prior.rows[0].minute_epoch)return null;
 const newer=strictlyNewer(source,old[0].minute_epoch);
 return newer.length>=8?newer:null;
}
