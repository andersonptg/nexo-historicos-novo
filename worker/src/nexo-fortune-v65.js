/* NEXO V6.5 — leitor exclusivo Blitz Fortune Double.
 * Sem número 0..14; resultado = red | purple | gold (Panda).
 * Não se utiliza para sinais Telegram.
 */
const CLOCK=/^(?:[01]?\d|2[0-3]):[0-5]\d$/;
const ITEM=/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bdouble-item\b[^"']*["'][^>]*>/gi;
const TIME=/<(?:div|span)\b[^>]*\bclass\s*=\s*["'][^"']*\bdouble-time\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i;
const BUTTON=/<button\b([^>]*)>([\s\S]*?)<\/button>/i;
const IMG=/fortune-doubles\/([a-z][a-z0-9_-]*)\.(?:png|webp|avif)/i;
const XVAL=/(?:^|[^\d])(\d+(?:[.,]\d{1,3})?)\s*x\b/i;
function rawText(t){return t.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim();}
function localToday(now){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 const val=k=>Number(parts.find(p=>p.type===k)?.value);
 return [val('year'),val('month'),val('day')];
}
export function parseFortuneV65(html,now=Date.now()){
 if(typeof html!=='string'||html.length<200)throw Error('FORTUNE_HTML_INSUFICIENTE');
 // Descarta trechos de scripts, evitando resultados fictícios de dados de interface.
 const raw=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'');
 const matches=[...raw.matchAll(ITEM)];
 if(matches.length<8||matches.length>2000)throw Error('FORTUNE_FORMATO: blocos double-item '+matches.length);
 let knownRed=0,knownGold=0,knownPurple=0,implicitPurple=0;
 const samples=[];
 for(let i=0;i<Math.min(matches.length,200);i++){
  const block=raw.slice(matches[i].index+matches[i][0].length,i+1<matches.length?matches[i+1].index:matches[i].index+6000);
  const t=TIME.exec(block),button=BUTTON.exec(block);
  if(!t||!button)throw Error('FORTUNE_FORMATO: bloco sem horario ou botao na posicao '+i);
  const clock=rawText(t[1]);
  if(!CLOCK.test(clock))throw Error('FORTUNE_FORMATO_HORA: '+clock.slice(0,20));
  const signature=button[1]+' '+button[2];
  const pic=IMG.exec(signature);
 const imageName=pic?.[1]?.toLowerCase()||'';
 // A fonte real usa imagens numeradas como red-6.png. O sufixo
 // identifica a variante gráfica, sem mudar a cor do resultado.
 // Aceitar somente cores conhecidas e sufixo numerico de 1 a 14.
 // 'black-N' e o nome do arquivo grafico da casa roxa do Fortune Double.
 // Nao alterar a categoria do Double convencional: esta regra so existe neste leitor.
 // Sufixos validos ficam entre 1 e 14; nomes fora dessa lista falham de modo seguro.
 const numbered=/^(red|vermelho|black|purple|roxo|violet|panda|gold|golden|dourado|yellow)-([1-9]|1[0-4])$/.exec(imageName);
 const graphicName=numbered?numbered[1]:imageName;
 const name=graphicName==='black'?'purple':graphicName;
  let color;
  if(['red','vermelho'].includes(name)){color='red';knownRed++}
  else if(['panda','gold','golden','dourado','yellow'].includes(name)){color='gold';knownGold++}
  else if(['purple','roxo','violet'].includes(name)){color='purple';knownPurple++}
  else if(name)throw Error('FORTUNE_VARIANTE_DESCONHECIDA: '+name);
  else if(/\b(?:purple|roxo|violet)\b/i.test(signature)){color='purple';knownPurple++}
  else if(/\b(?:red|vermelho)\b/i.test(signature)){color='red';knownRed++}
  else if(/\b(?:gold|dourado|yellow|panda)\b/i.test(signature)){color='gold';knownGold++}
  else if(/\bitem\b/i.test(button[1])&&!/background-image\s*:/i.test(button[1])){
   // A fonte desenha o roxo padrão sem imagem: validar toda a janela antes de usar.
   color='purple';implicitPurple++;
  }else throw Error('FORTUNE_SEM_COR: posicao '+i);
  const multiplierMatch=XVAL.exec(rawText(button[2]));
  let multiplier=multiplierMatch?Number(multiplierMatch[1].replace(',','.')):null;
  if(multiplier!==null&&(!Number.isFinite(multiplier)||multiplier<1||multiplier>100000))throw Error('FORTUNE_MULTIPLICADOR_INVALIDO');
  if(multiplier!==null&&color!=='gold')throw Error('FORTUNE_MULTIPLICADOR_FORA_DO_PANDA');
  samples.push({clock,color,...(multiplier!==null?{multiplier}:{})});
 }
 // Só permitir roxo sem imagem quando a janela realmente contém as duas variantes explícitas,
 // evitando inventar a cor quando a fonte alterar o layout.
 if(implicitPurple>0&&(!knownRed||!knownGold))throw Error('FORTUNE_ROXO_NAO_VALIDADO: faltam vermelho e panda na mesma janela');
 if(samples.length<8)throw Error('FORTUNE_JANELA_INSUFICIENTE');
 const [y,m,d]=localToday(now);
 let daysBack=0,last=Infinity;
 const rows=samples.map((item,i)=>{
  const [hh,mm]=item.clock.split(':').map(Number);
  let epoch=Math.floor(Date.UTC(y,m-1,d,hh+3,mm)/1000)-daysBack*86400;
  if(epoch>last||epoch>Math.floor(now/1000)+120){daysBack++;epoch-=86400;}
  if(Number.isFinite(last)&&(epoch>last||last-epoch>86400))throw Error('FORTUNE_ORDEM_INVALIDA: '+i);
  last=epoch;
  const {clock,...rest}=item;
  return {minute_epoch:epoch,...rest};
 });
 if(Math.floor(now/1000)-rows[0].minute_epoch>900)throw Error('FORTUNE_FONTE_DESATUALIZADA');
 return rows;
}
