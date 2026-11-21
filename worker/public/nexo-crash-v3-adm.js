(()=>{'use strict';
const T=[2,5,10,25,50,100];
const $=s=>document.querySelector(s);
const mount=$('#nx-crash-adm');if(!mount)return;
const style=document.createElement('style');style.textContent=`
#nxv3{border:1px solid #35657c;border-radius:14px;padding:14px;margin:0 0 16px;background:linear-gradient(160deg,#101d2d,#0b151f);color:#e8f4fb}
#nxv3 h2{color:#eff9ff;margin:8px 0;font-size:20px}#nxv3 h3{color:#bfe7ff;margin:8px 0;font-size:16px}
#nxv3 .v3row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0}
#nxv3 button{background:#186895;color:#fff;border:0;border-radius:8px;padding:9px 13px;cursor:pointer}
#nxv3 button.secondary{background:#264455}#nxv3 input,#nxv3 textarea,#nxv3 select{background:#122e40;color:#f7fcff;border:1px solid #416279;border-radius:7px;padding:8px;box-sizing:border-box;max-width:100%}
#nxv3 label{display:block;color:#cfe3ed;font-size:13px;margin:8px 0}
#nxv3 textarea{width:100%;min-height:58px;resize:vertical}
#nxv3 .v3targets{display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:12px}
#nxv3 .v3card{background:#0a1926;border:1px solid #294c60;border-radius:12px;padding:12px;min-width:0}
#nxv3 .v3asset{width:100%}#nxv3 .v3line{display:grid;grid-template-columns:115px 1fr;gap:8px}
#nxv3 .v3info{color:#9ebdcc;font-size:12px;line-height:1.45}
#nxv3 .v3table{overflow-x:auto}#nxv3 table{min-width:550px;width:100%;border-collapse:collapse;font-size:12px}
#nxv3 th,#nxv3 td{padding:8px;border-bottom:1px solid #304757;text-align:left}
#nxv3 .v3preview img{max-width:90px;max-height:80px;margin:5px 0}
#nxv3 .v3preview video{max-width:120px;max-height:90px;margin:5px 0}
@media(max-width:600px){#nxv3 .v3targets{grid-template-columns:1fr}#nxv3 .v3line{grid-template-columns:1fr}}
`;
document.head.append(style);
const shell=document.createElement('section');shell.id='nxv3';shell.innerHTML=`
<h2>🚀 CRASH V3 · Biblioteca do Telegram + 6 alvos</h2>
<p class="v3info">Utiliza o MESMO ID privado vinculado ao Double, mas um bot e uma biblioteca de stickers/GIFs EXCLUSIVOS do Crash. Cadastre somente o token novo. Nunca coloque token no código do site.</p>
<div class="v3card"><h3>🤖 Bot exclusivo do Crash</h3>
<p class="v3info" id="nxv3-bot-status">Consultando conexão...</p>
<div class="v3row"><label>Token do bot Crash (BotFather) <input type="password" id="nxv3-token" autocomplete="new-password" spellcheck="false" placeholder="Cole aqui o token, só para cadastrar" style="min-width:230px;width:100%"></label><button type="button" id="nxv3-connect">🔐 Conectar bot Crash</button></div>
<p class="v3info">O ID privado é recuperado automaticamente da configuração do Telegram existente. Após conectar, abra o NOVO bot Crash no Telegram e envie /start; então envie seus stickers ou GIFs no privado dele. O token é enviado somente ao Worker autenticado e armazenado criptografado.</p></div>
<div class="v3row"><button type="button" id="nxv3-load">↻ Atualizar stickers e GIFs do bot Crash</button><span class="v3info" id="nxv3-library">Aguardando biblioteca</span></div>
<div class="v3targets" id="nxv3-targets"></div>
<div class="v3card" id="nxv3-red"></div>
<div class="v3row"><button type="button" id="nxv3-save">💾 Salvar 6 alvos + RED único</button><span class="v3info" id="nxv3-status" role="status"></span></div>
<div class="v3card"><h3>🧪 Teste privado (não envia aos grupos)</h3>
<div class="v3row"><label>Alvo <select id="nxv3-test-target">${T.map(t=>`<option value="${t}">${t}x</option>`).join('')}</select></label>
<label>Evento <select id="nxv3-test-event"><option value="entry">ENTRADA</option><option value="green">GREEN</option><option value="red">RED comum</option></select></label>
<label>Estratégia <select id="nxv3-test-strategy"><option value="">Mensagem geral do alvo</option></select></label>
<button type="button" id="nxv3-test" class="secondary">Enviar teste no meu privado</button></div><p class="v3info" id="nxv3-test-status">O teste usa SOMENTE o bot Crash. Texto primeiro, mídia depois. Não envia aos grupos.</p></div>
<div class="v3card"><h3>🔎 Busca automática de padrões · todos os alvos</h3>
<p class="v3info">Analisa as rodadas já recebidas pelo site, respeitando lacunas registradas. Taxas históricas não garantem o próximo resultado.</p>
<div class="v3row"><label>Sequência anterior <select id="nxv3-length">${[0,...Array.from({length:10},(_,i)=>i+3)].map(n=>`<option value="${n}" ${n===0?'selected':''}>${n===0?'Automático · 3 a 12 velas':n+' velas'}</option>`).join('')}</select></label>
<label>Ocorrências mínimas <input id="nxv3-min" type="number" min="1" max="100" value="3" style="width:72px"></label>
<button type="button" id="nxv3-search" class="secondary">↻ Analisar 2x a 100x</button></div>
<p class="v3info" id="nxv3-search-status"></p><div class="v3table"><table><thead><tr><th>Alvo</th><th>Sequência anterior</th><th>Ocorrências</th><th>Acertos</th><th>Taxa histórica</th><th></th></tr></thead><tbody id="nxv3-results"></tbody></table></div></div>`;
mount.prepend(shell);
const info=$('#nxv3-library'),status=$('#nxv3-status');
let media=[],fields=new Map(),opened=false;
async function api(path,opt={}){const r=await fetch(path,{cache:'no-store',credentials:'same-origin',...opt});let d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Erro HTTP '+r.status);return d}
const put=(x)=>({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)});
function field(key,label){
 const root=document.createElement('div');root.className='v3card';
 const title=document.createElement('h3');title.textContent=label;root.append(title);
 const ta=document.createElement('textarea');ta.placeholder='Texto personalizado do sinal';ta.maxLength=900;
 const ll=document.createElement('label');ll.textContent='Mensagem';ll.append(ta);root.append(ll);
 const line=document.createElement('div');line.className='v3line';
 const lk=document.createElement('label');lk.textContent='Tipo';const kind=document.createElement('select');
 for(const [k,n] of [['text','Só texto'],['sticker','Sticker'],['gif','GIF']]){const o=document.createElement('option');o.value=k;o.textContent=n;kind.append(o)}lk.append(kind);
 const lm=document.createElement('label');lm.textContent='Mídia da biblioteca';const asset=document.createElement('select');asset.className='v3asset';lm.append(asset);line.append(lk,lm);root.append(line);
 const preview=document.createElement('div');preview.className='v3preview';root.append(preview);
 const f={key,root,ta,kind,asset,preview};fields.set(key,f);
 kind.addEventListener('change',()=>populate(f));asset.addEventListener('change',()=>previewAsset(f));
 return root;
}
for(const t of T){const card=document.createElement('div');card.className='v3card';const h=document.createElement('h3');h.textContent='🎯 Alvo '+t+'x';card.append(h);card.append(field(t+':entry','Mensagem de ENTRADA '+t+'x'),field(t+':green','✅ GREEN '+t+'x'));$('#nxv3-targets').append(card)}
$('#nxv3-red').append(field('red','❌ RED único para todos os alvos'));
function previewAsset(f){f.preview.replaceChildren();const id=f.asset.value,asset=media.find(x=>x.id===id);if(!asset)return;
 const url='/api/adm/crash/v3/media/'+encodeURIComponent(id);
 const elm=asset.kind==='gif'?document.createElement('video'):document.createElement('img');
 if(asset.kind==='gif'){elm.autoplay=true;elm.loop=true;elm.muted=true;elm.playsInline=true;elm.src=url+'?motion=1'}else elm.src=url;
 elm.loading='lazy';elm.alt=asset.name;f.preview.append(elm);
}
function populate(f,desired){const saved=desired===undefined?f.asset.value:desired;
 f.asset.replaceChildren();const no=document.createElement('option');no.value='';no.textContent=f.kind.value==='text'?'Sem mídia':'Escolher arquivo recebido';f.asset.append(no);
 for(const a of media.filter(x=>x.kind===f.kind.value)){const o=document.createElement('option');o.value=a.id;o.textContent=a.name||a.kind;f.asset.append(o)}
 f.asset.disabled=f.kind.value==='text';if([...f.asset.options].some(x=>x.value===saved))f.asset.value=saved;previewAsset(f);
}
function configure(cfg){for(const t of T){for(const kind of ['entry','green']){const f=fields.get(t+':'+kind),d=cfg.targets?.[String(t)]?.[kind]||{};f.ta.value=d.text||'';f.kind.value=d.kind||'text';populate(f,d.assetId||'')}}
 const f=fields.get('red'),d=cfg.red||{};f.ta.value=d.text||'';f.kind.value=d.kind||'text';populate(f,d.assetId||'');}
function fromField(f){return {text:f.ta.value,kind:f.kind.value,assetId:f.kind.value==='text'?'':f.asset.value}}
function botStatus(b){const e=$('#nxv3-bot-status');if(!b){e.textContent='Bot não cadastrado.';return}e.textContent=(b.connected?'✅ Conectado: @'+(b.username||'bot Crash'):'⚠ Bot Crash ainda não cadastrado')+' | ID privado do Double: '+(b.ownerPaired?'vinculado':'pendente. Vincule no painel Telegram antes.');}
function renderStrategies(xs){const sel=$('#nxv3-test-strategy'),old=sel.value;sel.replaceChildren();let first=document.createElement('option');first.value='';first.textContent='Mensagem geral do alvo';sel.append(first);for(const s of xs){const opt=document.createElement('option');opt.value=s.id;opt.dataset.target=String(s.target);opt.textContent=s.name+' · '+s.target+'x';sel.append(opt)}if([...sel.options].some(o=>o.value===old))sel.value=old;}
$('#nxv3-test-strategy').addEventListener('change',e=>{const opt=e.target.selectedOptions[0];if(opt?.dataset.target)$('#nxv3-test-target').value=opt.dataset.target});
$('#nxv3-connect').onclick=async()=>{const field=$('#nxv3-token'),token=field.value.trim(),el=$('#nxv3-bot-status');if(!token){el.textContent='Cole o token do NOVO bot Crash.';return}if(!confirm('Conectar bot EXCLUSIVO Crash, preservando o bot Double?'))return;el.textContent='Validando bot Crash...';try{const b=await api('/api/adm/crash/v3/bot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});field.value='';botStatus(b);status.textContent='✅ Conectado. Abra @'+b.username+' no Telegram, envie /start e depois os stickers/GIFs.';await reload();}catch(e){field.value='';el.textContent='Erro ao conectar: '+e.message}};
async function reload(){status.textContent='Consultando biblioteca protegida...';try{const d=await api('/api/adm/crash/v3/signals');media=d.media||[];configure(d.config);info.textContent=media.length+' arquivos cadastrados no bot Crash';botStatus(d.bot);renderStrategies(d.strategies||[]);status.textContent='Biblioteca Crash pronta. Escolha suas mídias e salve.'}catch(e){status.textContent=e.message}}
$('#nxv3-load').onclick=()=>void reload();
$('#nxv3-save').onclick=async()=>{const body={version:3,targets:{},red:fromField(fields.get('red'))};for(const t of T)body.targets[String(t)]={entry:fromField(fields.get(t+':entry')),green:fromField(fields.get(t+':green'))};
 status.textContent='Salvando...';try{await api('/api/adm/crash/v3/signals',put(body));status.textContent='✅ Configurações de Crash salvas. Envio automático permanece desligado.'}catch(e){status.textContent='Erro: '+e.message}};
$('#nxv3-test').onclick=async()=>{if(!confirm('Enviar apenas para o seu Telegram privado?'))return;const el=$('#nxv3-test-status');el.textContent='Enviando teste...';
 try{const x=await api('/api/adm/crash/v3/test-private',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:Number($('#nxv3-test-target').value),event:$('#nxv3-test-event').value,strategyId:$('#nxv3-test-strategy').value||undefined})});el.textContent='✅ Teste privado confirmado · ID '+(x.telegram_message_id||'não disponível');}catch(e){el.textContent='Erro: '+e.message}};
async function search(){const el=$('#nxv3-search-status'),root=$('#nxv3-results');el.textContent='Analisando seis alvos no histórico R2...';root.replaceChildren();
 try{const length=Number($('#nxv3-length').value),minimum=Number($('#nxv3-min').value);const d=await api('/api/crash/analysis-all?length='+length+'&minimum='+minimum);
  const sum=d.analyses.reduce((n,x)=>n+x.patterns.length,0);el.textContent=sum+' padrões encontrados nas seis categorias · histórico de precisão por minuto';
  for(const r of d.analyses){const patterns=r.patterns.slice(0,20);if(!patterns.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;td.textContent=r.target+'x · nenhuma sequência com a amostra mínima';tr.append(td);root.append(tr);continue;}
   for(const p of patterns){const tr=document.createElement('tr');for(const v of [r.target+'x',p.pattern.join(' → ')+' ('+p.length+' velas)',String(p.count),String(p.hits),(p.rate*100).toFixed(1)+'%']){const td=document.createElement('td');td.textContent=v;tr.append(td)}
    const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Usar padrão';b.onclick=()=>{const name=$('#nx-strat-name'),target=$('#nx-strat-target'),pattern=$('#nx-strat-pattern'),enabled=$('#nx-strat-enabled');
     if(!name||!target||!pattern)return;name.value='Crash '+r.target+'x · '+p.pattern.join(' / ');target.value=String(r.target);pattern.value=p.pattern.join(', ');enabled.checked=false;
     const st=$('#nx-strat-status');if(st)st.textContent='Padrão transferido: revise e salve uma NOVA estratégia (sem ativar sinais).';$('#nx-strat-form')?.scrollIntoView({behavior:'smooth',block:'center'});};td.append(b);tr.append(td);root.append(tr)}}
 }catch(e){el.textContent='Erro: '+e.message}
}
$('#nxv3-search').onclick=()=>void search();
// Campos por estratégia (sobrescrevem os textos gerais no teste privado).
const strat=$('#nx-strat-form');if(strat){const wrapper=document.createElement('div');wrapper.className='nx-module';const h=document.createElement('h3');h.textContent='Mensagens particulares desta estratégia';wrapper.append(h);
 for(const [id,label] of [['nx-strat-entry-text','Entrada (opcional)'],['nx-strat-green-text','GREEN (opcional)']]){const l=document.createElement('label');l.textContent=label;const ta=document.createElement('textarea');ta.id=id;ta.maxLength=900;ta.rows=2;ta.placeholder='Vazio: usar mensagem do alvo selecionado';ta.style.width='100%';l.append(ta);wrapper.append(l)}
 const actions=strat.querySelector('.actions');if(actions)strat.insertBefore(wrapper,actions);else strat.append(wrapper);
}
// Quando abrir a página Crash do ADM, atualiza catálogo e executa a busca.
const nav=$('#nav');nav?.addEventListener('click',e=>{const b=e.target.closest('button[data-page="crash"]');if(b){void reload();if(!opened){opened=true;void search()}}});
})();
