/* NEXO V6.3 - monitoramento sob demanda das fontes. Sem automacao no navegador. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const root=$('page-cloud');
if(!root)return;
const panel=root.querySelector('#nexo-cloud-adm')||root;
const section=document.createElement('section');section.className='nx63-panel';section.innerHTML=`
<h2>🔎 Auditoria de coleta de todas as plataformas</h2>
<p class="nx63-muted">50 jogos catalogados. As fontes sem adaptador não são anunciadas como ativas. Os testes fazem requisições reais à Cloudflare e à fonte externa, e podem gerar consumo.</p>
<div class="nx63-controls">
 <button type="button" id="nx63-refresh">↻ Consultar estados</button>
 <button type="button" id="nx63-start">▶ Testar fontes elegíveis, uma por vez</button>
 <button type="button" id="nx63-stop" disabled>■ Cancelar auditoria</button>
</div>
<p id="nx63-summary" role="status" aria-live="polite">Carregando diagnóstico autenticado...</p>
<details class="nx63-details" open><summary>Diagnóstico de cada jogo</summary>
 <div class="nx63-scroll"><table><thead><tr><th>Plataforma</th><th>Jogo</th><th>Coleta</th><th>Última confirmação</th><th>Diagnóstico</th></tr></thead><tbody id="nx63-rows"></tbody></table></div>
</details>`;
panel.prepend(section);
let testing=false,stop=false,last={games:[],statuses:{}};
const human=code=>{
 const s=String(code||'').slice(0,130);
 if(!s)return 'Nenhum erro registrado';
 if(s.startsWith('FONTE_HTTP_403'))return 'HTTP 403: fonte não autorizou a consulta pela Cloudflare';
 if(s.startsWith('FONTE_HTTP_429'))return 'HTTP 429: limite de requisições da fonte';
 if(s.startsWith('FORMATO_NAO_RECONHECIDO'))return 'Layout não reconhecido pelo leitor atual';
 if(s.startsWith('JANELA_INSUFICIENTE'))return 'Amostra insuficiente para confirmar rodadas';
 if(s.startsWith('FONTE_DESATUALIZADA'))return 'Fonte sem rodadas recentes';
 if(s.startsWith('SEM_SOBREPOSICAO'))return 'Janela sem sobreposição: histórico anterior protegido';
 if(s.startsWith('SEM_ADAPTADOR'))return 'Este jogo precisa de um leitor específico';
 return s;
};
const when=ms=>{
 if(!ms)return '—';
 try {return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));}catch{return '—';}
};
async function json(url,opt){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt});
 let d;try{d=await r.json()}catch{throw Error('Resposta não JSON (HTTP '+r.status+')')}
 if(!r.ok||d?.ok===false)throw Error(String(d?.error||'HTTP '+r.status));
 return d;
}
function render(){
 const rows=$('nx63-rows');rows.replaceChildren();
 const stats={ok:0,blocked:0,erro:0,pending:0,untested:0};
 const games=[...last.games].sort((a,b)=>(a.platform+' '+a.game).localeCompare(b.platform+' '+b.game,'pt-BR'));
 for(const g of games){
  const st=last.statuses?.[g.id]||{};
  const state=!g.eligible?'sem_adaptador':st.status||g.status||'aguardando_validacao';
  if(state==='atualizado')stats.ok++;
  else if(state==='bloqueado')stats.blocked++;
  else if(state==='erro')stats.erro++;
  else if(state==='sem_adaptador')stats.pending++;
  else stats.untested++;
  const tr=document.createElement('tr');
  const cells=[g.platform,g.game,state,when(st.last_success||g.last_success),!g.eligible?'Sem adaptador compatível':st.last_error?human(st.last_error):state==='atualizado'?'Histórico confirmado na coleta':'Ainda não validado'];
  for(const v of cells){const td=document.createElement('td');td.textContent=v;tr.append(td)}
  tr.dataset.state=state;rows.append(tr);
 }
 const total=games.length;
 $('nx63-summary').textContent=`${total} jogos · ${stats.ok} confirmados · ${stats.blocked} bloqueados · ${stats.erro} com erro · ${stats.untested} aguardando teste · ${stats.pending} sem adaptador`;
}
async function load(){
 const [cfg,cat]=await Promise.all([json('/api/adm/cloud/status'),json('/api/cloud/catalog')]);
 last={games:cat.games||[],statuses:cfg.statuses||{}};
 render();
 return last;
}
function error(err){$('nx63-summary').textContent='Falha no diagnóstico: '+String(err.message||err).slice(0,160);}
$('nx63-refresh').onclick=()=>void load().catch(error);
$('nx63-stop').onclick=()=>{stop=true;$('nx63-summary').textContent='Cancelamento solicitado: a requisição atual terminará normalmente.'};
$('nx63-start').onclick=async()=>{
 if(testing)return;
 if(!confirm('Testar as fontes elegíveis, uma de cada vez? Isso fará consultas reais e pode gerar uso de Cloudflare/R2. Jogos sem adaptador serão apenas classificados. O Telegram não será acionado.'))return;
 testing=true;stop=false;
 $('nx63-start').disabled=true;$('nx63-stop').disabled=false;
 try{
  await load();
  const candidates=last.games.filter(g=>g.eligible);
  let done=0;
  for(const g of candidates){
   if(stop)break;
   $('nx63-summary').textContent=`Testando fonte ${done+1}/${candidates.length}: ${g.platform} · ${g.game}...`;
   try{
    const r=await json('/api/adm/cloud/run-once',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game_id:g.id})});
    if(r.status)last.statuses[g.id]=r.status;
   }catch(e){last.statuses[g.id]={status:'erro',last_error:'TESTE_HTTP: '+String(e.message||e).slice(0,90)};}
   done++;
   render();
   // Uma requisição por vez. Evita rajada contra as fontes externas.
   if(!stop)await new Promise(resolve=>setTimeout(resolve,1200));
  }
  await load();
  const doneMsg=stop?'Auditoria interrompida após '+done+' fonte(s).':'Auditoria concluída: '+done+' fonte(s) testadas.';
  $('nx63-summary').textContent=doneMsg+' '+$('nx63-summary').textContent;
 }catch(e){error(e)}
 finally{testing=false;$('nx63-start').disabled=false;$('nx63-stop').disabled=true;}
};
const cloudTab=document.querySelector('#nav button[data-page="cloud"]');
cloudTab?.addEventListener('click',()=>setTimeout(()=>void load().catch(error),100));
void load().catch(error);
})();
