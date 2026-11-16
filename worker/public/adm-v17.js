/* NEXO V17 premium admin: no automatic Telegram delivery from this script.
   Older editors stay in DOM for compatibility; storage is NOT deleted. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
 const btn=(txt,act,cls='')=>{const b=el('button','v17-btn '+cls,txt);b.type='button';b.addEventListener('click',act);return b};
 const tokenColor=t=>t==='red'||t==='black'||t==='white'?t:t==='*'?'any':t.startsWith('n:')?(+t.slice(2)===0?'white':+t.slice(2)<=7?'red':'black'):'any';
 const label=t=>t==='red'?'🔴':t==='black'?'⚫':t==='white'?'⚪':t==='*'?'★':t.startsWith('n:')?t.slice(2):'?';
 let analysis=null,searching=false,pageIndex=0,visibleTarget='all',selectedScore='__all__',touched=false;
 function stoneRow(tokens){const row=el('div','v17-stones');for(const t of tokens){const x=el('span','v17-stone '+tokenColor(t),label(t));x.title=t;x.setAttribute('aria-label',t);row.append(x)}return row}
 function notice(text,bad=false){const x=$('v17-status');if(x){x.textContent=text;x.style.color=bad?'#ffb0bf':'#83dfc2'}if(typeof pop==='function')pop(text,bad)}
 const wrapper=(title,desc)=>{const root=el('section','v17-section');root.append(el('h3','',title));if(desc)root.append(el('p','v17-muted',desc));return root};
 function header(title,subtitle){const node=el('header','v17-hero');const left=el('div');left.append(el('h2','',title),el('p','v17-muted',subtitle));node.append(left);return node}
 function labelButtons(node){const a=el('div','v17-actions');node.append(a);return a}
 function showEditor(s){if(s){selected=s.id;renderStrategies();renderMessage();}else{$('new-strategy')?.click();}
  $('page-estrategias')?.classList.add('v17-edit-open');$('strategy-form')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function hideEditor(){$('page-estrategias')?.classList.remove('v17-edit-open')}
 function buildRules(){const page=$('page-estrategias');if(!page||$('v17-rules'))return;
  const root=el('div','v17-wrap');root.id='v17-rules';const h=header('Estratégias salvas','Padrões em ordem, placares por regra e controle individual. Apenas o administrador pode alterar.');const a=labelButtons(h);
  const startAll=btn('▶ Ativar todas',()=>void toggleAll(true),'primary');startAll.id='v21-activate-all';
  const stopAll=btn('Ⅱ Desativar todas',()=>void toggleAll(false),'danger');stopAll.id='v21-disable-all';
  a.append(btn('＋ Nova estratégia',()=>showEditor(null),'primary'),startAll,stopAll,btn('↻ Atualizar',()=>void safeReload()));root.append(h);
  const wrap=wrapper('Regras disponíveis','Toque em Editar apenas quando quiser alterar o padrão ou as mensagens. Os sinais são executados somente após ativar o robô.');const cards=el('div','v17-strategies');cards.id='v17-cards';wrap.append(cards);root.append(wrap);
  root.append(el('p','v17-muted','A cor e os números de cada pedra são exibidos como cadastrados. Se a fonte atrasar, o NEXO não pode antecipar resultados.'));
  page.querySelector('.pagehead')?.insertAdjacentElement('afterend',root);
  const legacy=page.querySelector('.strategies-layout');if(legacy){const x=el('div','v17-actions');x.append(btn('✕ Fechar editor',hideEditor));legacy.prepend(x)}
 }
 function scoreTotals(scores){const x={entries:0,green:0,white:0,red:0,gale1:0,gale2:0};for(const row of scores||[])for(const k of Object.keys(x))x[k]+=Number(row[k]||0);return x}
 function fillScoreCard(host,title,value,cls=''){const a=el('div','v17-score '+cls);a.append(el('small','',title),el('strong','',value));host.append(a)}
 function showScore(s){selectedScore=s?.id||'__all__';page('placares');renderPremiumScores();$('v17-scoreboard')?.scrollIntoView({behavior:'smooth',block:'start'})}
 function paintRules(){const host=$('v17-cards');if(!host||!model)return;host.replaceChildren();const items=model.strategies||[];
  if(!items.length){host.append(el('p','v17-blank','Nenhuma regra cadastrada. Utilize Nova estratégia ou exporte um padrão da análise histórica.'));return}
  for(const [index,s] of items.entries()){
   const card=el('article','v17-rule');const top=el('div','v17-rule-top');const left=el('div');left.append(el('span','v17-idx','ESTRATÉGIA '+String(index+1).padStart(2,'0')),el('div','v17-rule-title',s.name||'Regra sem nome'));
   top.append(left,el('span','v17-pill '+(s.enabled?'on':'off'),s.enabled?'● ATIVA':'○ PAUSADA'));card.append(top,stoneRow(s.pattern||[]));
   card.append(el('small','v17-muted',(s.target==='white'?'⚪ SOMENTE BRANCO':s.target==='red'?'🔴 VERMELHO + BRANCO':'⚫ PRETO + BRANCO')+' • até Gale '+(s.maxGale||0)));
   const actions=labelButtons(card);
   actions.append(btn('✎ Editar',()=>showEditor(s)),btn('▥ Placar',()=>showScore(s)),btn(s.enabled?'Ⅱ Pausar':'▶ Ativar',()=>void toggle(s),s.enabled?'danger':'primary'));
   host.append(card);
  }
 }
 async function toggle(s){if(!s.enabled&&!confirm('Ativar a regra '+s.name+' para as próximas rodadas?'))return;
  const payloadData={...s,enabled:!s.enabled};await api('strategies/'+s.id,payload('PUT',payloadData));await safeReload();notice(s.enabled?'Regra pausada.':'Regra ativada.');}
 let v21ToggleBusy=false;
 async function toggleAll(desired){
  if(v21ToggleBusy||!model)return;
  const changed=(model.strategies||[]).filter(s=>s.enabled!==desired);
  if(!changed.length){notice(desired?'Todas já estão ativas.':'Todas já estão desativadas.');return;}
  const count=changed.length;
  const message=desired
   ?'Ativar '+count+' estratégia(s) pausada(s)? As já ativas NÃO serão reiniciadas. Todas poderão disputar o mesmo ciclo, e muitas regras podem aumentar a latência dos sinais. O robô global não será ligado por esta ação.'
   :'Desativar '+count+' estratégia(s) ativa(s)? As já desativadas NÃO serão alteradas.';
  if(!confirm(message))return;
  v21ToggleBusy=true;let done=0,warnings=0;
  const buttons=[$('v21-activate-all'),$('v21-disable-all')];
  for(const b of buttons)if(b)b.disabled=true;
  try{
   for(let i=0;i<changed.length;i+=10){
    const group=changed.slice(i,i+10);
    const result=await api('strategies/toggle-batch',payload('POST',{ids:group.map(s=>s.id),enabled:desired,confirm:true}));
    done+=Number(result.changed||0);warnings+=Number(result.cleanupWarnings||0);
    notice((desired?'Ativando':'Desativando')+' '+Math.min(i+10,count)+'/'+count+'…');
   }
   await safeReload();
   notice(done+' estratégia(s) '+(desired?'ativadas':'desativadas')+'. As demais mantidas.'+(warnings?' '+warnings+' limpeza(s) de aviso pendente(s).':''),warnings>0);
  }catch(e){await safeReload();notice('Operação parcial: '+done+' alteradas. '+e.message+'; confira o estado antes de repetir.',true)}
  finally{v21ToggleBusy=false;for(const b of buttons)if(b)b.disabled=false;}
 }
 async function safeReload(){try{await reload()}catch(e){notice('Falha ao carregar: '+e.message,true)}}
 function buildScores(){const page=$('page-placares');if(!page||$('v17-scoreboard'))return;const root=el('div','v17-wrap');root.id='v17-scoreboard';const top=header('Placar geral · NEXO','Somatório dos resultados registrados por todas as estratégias ativas ou pausadas.');const actions=labelButtons(top);actions.append(btn('↻ Atualizar',()=>void safeReload()));root.append(top);
  const section=wrapper('Resultados somados');const grid=el('div','v17-score-grid');grid.id='v17-score-values';section.append(grid);root.append(section);
  const indi=wrapper('Placar por estratégia','Selecione uma estratégia na área de Regras para conferir somente seus resultados.');const select=el('select','v17-input');select.id='v17-score-choice';select.addEventListener('change',()=>{selectedScore=select.value;renderPremiumScores()});indi.append(select);const details=el('div','v17-score-grid');details.id='v17-score-detail';indi.append(details);root.append(indi);
  const groups=wrapper('Enviar placar','O envio somente ocorre ao tocar no botão e confirmar. Selecione os grupos cadastrados e autorizados.');const rows=el('div');rows.id='v17-group-rows';groups.append(rows);const send=labelButtons(groups);send.append(btn('➤ Enviar ao privado do bot',()=>void deliver('__private__'),'primary'),btn('➤ Enviar aos grupos marcados',()=>void deliverSelected()),btn('Zerar placar exibido',()=>void resetScore(),'danger'));root.append(groups);page.querySelector('.pagehead')?.insertAdjacentElement('afterend',root);
 }
 function renderPremiumScores(){if(!$('v17-score-values')||!model)return;const scores=model.scores||[],all=scoreTotals(scores),primary=$('v17-score-values'),sel=$('v17-score-choice');
  primary.replaceChildren();fillScoreCard(primary,'WIN',all.green,'green');fillScoreCard(primary,'BRANCOS',all.white,'white');fillScoreCard(primary,'RED',all.red,'red');fillScoreCard(primary,'ENTRADAS',all.entries);
  const desired=sel.value||selectedScore;sel.replaceChildren();const def=el('option','','Todas as estratégias');def.value='__all__';sel.append(def);for(const s of model.strategies||[]){const opt=el('option','',s.name);opt.value=s.id;sel.append(opt)}sel.value=desired;if(!sel.value)sel.value='__all__';selectedScore=sel.value;
  const selectedData=selectedScore==='__all__'?all:scoreTotals(scores.filter(x=>x.id===selectedScore));const detail=$('v17-score-detail');detail.replaceChildren();const closed=selectedData.green+selectedData.white+selectedData.red;
  fillScoreCard(detail,'GREEN',selectedData.green,'green');fillScoreCard(detail,'BRANCO',selectedData.white,'white');fillScoreCard(detail,'RED',selectedData.red,'red');fillScoreCard(detail,'ACERTO HISTÓRICO',closed?((selectedData.green+selectedData.white)/closed*100).toFixed(1)+'%':'—');
  const rows=$('v17-group-rows');rows.replaceChildren();const eligible=(model.groups||[]).filter(x=>x.selected&&x.admin);if(!eligible.length)rows.append(el('p','v17-muted','Nenhum grupo habilitado. Cadastre em Telegram / Grupos.'));
  for(const g of eligible){const row=el('div','v17-group-row'),label=el('label');const cb=el('input');cb.type='checkbox';cb.value=g.id;cb.dataset.v17Group=g.id;label.append(cb,el('span','',g.name||'Grupo'));row.append(label,btn('Enviar',()=>void deliver(g.id)));rows.append(row)}
 }
 async function deliver(id){const name=id==='__private__'?'privado do bot':(model.groups||[]).find(g=>g.id===id)?.name||'grupo';if(!confirm('Enviar o placar '+(selectedScore==='__all__'?'geral':'desta estratégia')+' para '+name+'?'))return;
  try{await api('telegram/scoreboard',payload('POST',{strategyId:selectedScore,groupId:id}));notice('Placar enviado para '+name+'.')}catch(e){notice('Erro no envio: '+e.message,true)} }
 async function deliverSelected(){const ids=[...document.querySelectorAll('#v17-group-rows [data-v17-group]:checked')].map(e=>e.value);if(!ids.length){notice('Marque ao menos um grupo.',true);return}if(!confirm('Enviar este placar aos '+ids.length+' grupos marcados?'))return;
  let ok=0;for(const id of ids){try{await api('telegram/scoreboard',payload('POST',{strategyId:selectedScore,groupId:id}));ok++}catch(e){notice('Falhou em '+(ids.length-ok)+' grupo(s): '+e.message,true)}}if(ok)notice('Enviado para '+ok+' grupo(s).')}
 async function resetScore(){if(!confirm('Zerar '+(selectedScore==='__all__'?'os placares de TODAS as estratégias':'somente este placar')+'? Esta ação não apaga o histórico de rodadas.'))return;
  try{await api('scores/reset',payload('POST',{id:selectedScore==='__all__'?null:selectedScore,confirm:true}));await safeReload();notice('Placar zerado com confirmação.')}catch(e){notice('Erro: '+e.message,true)}}
 function buildPatterns(){const page=$('page-padroes');if(!page||$('v17-pattern-panel'))return;const root=el('div','v17-wrap');root.id='v17-pattern-panel';root.append(header('Analisador de padrões reais','Busca todas as datas disponíveis no histórico R2, sem cadastrar ou ativar sinais automaticamente.'));
  const c=wrapper('Buscar padrões repetidos','Números exatos, cores ou uma pedra exata no meio de cores. Exibe apenas padrões que tiveram 100% histórico e no mínimo 5 acertos.');const fields=el('div','v17-form-row');const lab=el('label');lab.append(el('small','','Mínimo de acertos'));const min=el('select','v17-input');min.id='v17-min-hits';for(const n of [5,6,8,10,15,20]){const op=el('option','',String(n));op.value=n;min.append(op)}lab.append(min);const other=el('label');other.append(el('small','','Tamanho do padrão'));const sel=el('select','v17-input');sel.id='v17-pattern-length';for(const n of [3,4,5,6,7]){const op=el('option','',`Até ${n} pedras`);op.value=n;sel.append(op)}sel.value='7';other.append(sel);fields.append(lab,other);c.append(fields);
  const buttons=labelButtons(c);buttons.append(btn('⌕ Procurar em todos os dias',()=>void loadPatterns(),'primary'));const status=el('p','v17-muted','Nenhuma busca executada.');status.id='v17-pattern-status';c.append(status);
  c.append(el('p','v17-alert','Uma sequência com 5/5 ou 6/6 acertos no passado não tem 100% de probabilidade futura. A seleção dos melhores padrões após observar resultados aumenta o risco de coincidências.'));
  root.append(c);const out=wrapper('Padrões encontrados','A lista é ordenada por quantidade de ocorrências, com cada padrão em uma linha.');const filter=el('div','v17-actions');const choose=el('select','v17-input');choose.style.maxWidth='210px';choose.id='v17-target-filter';for(const [v,t] of [['all','Todas as cores'],['red','🔴 Vermelho'],['black','⚫ Preto'],['white','⚪ Branco']]){const o=el('option','',t);o.value=v;choose.append(o)}choose.addEventListener('change',()=>{visibleTarget=choose.value;pageIndex=0;drawPatterns()});filter.append(choose);out.append(filter);
   const bulk=el('div','v20-bulk-actions');
   const galeLabel=el('label','v20-bulk-gale');galeLabel.append(el('span','','GALE PADRÃO'));
   const galeSelect=el('select','v17-input');galeSelect.id='v20-gale-import';
   for(const n of [0,1,2]){const op=el('option','',n===0?'Sem Gale':'Gale '+n);op.value=String(n);galeSelect.append(op)}galeSelect.value='2';galeLabel.append(galeSelect);bulk.append(galeLabel);
   const actionsBulk=el('div','v17-actions');const all=btn('⇩ Exportar TODOS os padrões novos',()=>void exportAllPatterns(),'primary');all.id='v20-export-all';
   actionsBulk.append(all,btn('Aplicar Gale escolhido em TODAS as regras cadastradas',()=>void setGaleAll()));bulk.append(actionsBulk);
   const qty=el('div','v17-muted','Busque padrões para calcular quantos ainda não foram cadastrados.');qty.id='v20-available-count';bulk.append(qty);
   const progress=el('div','v17-muted');progress.id='v20-bulk-status';bulk.append(progress);out.append(bulk);
   const list=el('div','v17-pattern-list');list.id='v17-pattern-results';out.append(list);out.append(btn('Mostrar mais resultados',()=>{pageIndex++;drawPatterns()},''));out.lastChild.id='v17-pattern-more';root.append(out);page.querySelector('.pagehead')?.insertAdjacentElement('afterend',root)}
 async function retrieveArchive(){const days=[];let cursor=null;for(let batch=0;batch<12;batch++){
  const res=await fetch('/api/days?game_id=brabet-double'+(cursor?'&cursor='+encodeURIComponent(cursor):''),{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error('Não foi possível listar dias do R2 (HTTP '+res.status+')');const d=await res.json();days.push(...(d.days||[]));cursor=d.cursor;if(!cursor)break;if(batch===11)throw Error('Há mais datas do que o limite de paginação desta consulta');}
  const all=[],unique=[...new Set(days)].sort();let count=0;for(const day of unique){let offset=0;while(true){const r=await fetch('/api/history?game_id=brabet-double&day='+day+'&limit=500&offset='+offset,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Erro ao ler '+day+' (HTTP '+r.status+')');const data=await r.json();const rows=data.items||[];all.push(...rows);offset+=rows.length;if(all.length>120000)throw Error('O histórico ultrapassou 120 mil linhas; use análise por intervalo para evitar travar o celular. Nenhuma regra foi criada.');if(!data.has_more||!rows.length)break;}
   count++;$('v17-pattern-status').textContent='Lendo arquivos R2: '+count+'/'+unique.length+' dias · '+all.length+' rodadas.';
   await new Promise(r=>setTimeout(r,0));}
  return {rows:all,days:unique.length};}
 async function loadPatterns(){if(searching)return;searching=true;const stat=$('v17-pattern-status');stat.textContent='Lendo os históricos do R2...';try{
  const {rows,days}=await retrieveArchive();stat.textContent='Analisando '+rows.length+' registros de '+days+' dias...';await new Promise(r=>setTimeout(r,30));
  const core=window.NEXO_V17_PATTERN;if(!core)throw Error('Motor de padrões não carregado');analysis=core.mine(rows,{minHits:Number($('v17-min-hits').value),maxLength:Number($('v17-pattern-length').value)});pageIndex=0;drawPatterns();syncNewCount();stat.textContent=`${allNewPatterns().length} padrões NOVOS encontrados em ${days} dias · ${analysis.records} rodadas consideradas · apenas histórico.`;
 }catch(e){stat.textContent='Falha: '+e.message;notice(e.message,true)}finally{searching=false}}
 function drawPatterns(){const host=$('v17-pattern-results');if(!host)return;host.replaceChildren();let rows=(analysis?.items||[]).filter(x=>(visibleTarget==='all'||x.target===visibleTarget)&&!alreadySaved(x));const available=rows.length;syncNewCount();const shown=rows.slice(0,(pageIndex+1)*15);if(!rows.length)host.append(el('p','v17-blank',analysis?'Nenhum padrão passou no filtro.':'Clique em procurar padrões para iniciar.'));
  for(const p of shown){const box=el('article','v17-pattern');box.append(stoneRow(p.tokens));const footer=el('footer');const lab=el('div');const target=p.target==='red'?'🔴 VERMELHO':p.target==='black'?'⚫ PRETO':'⚪ BRANCO';lab.append(el('b','',`Depois: ${target}`),el('div','v17-muted',`${p.hits}/${p.total} acertos · 100% histórico · 1ª ${p.first} · 2ª ${p.second} · falhas ${p.fail}`));footer.append(lab);
   footer.append(btn('Exportar individualmente',()=>void exportPattern(p),'primary'));box.append(footer);
   const d=el('details');d.append(el('summary','','Ver sequência completa'));d.append(el('p','',p.pattern),el('p','',`Total ${p.total}; primeira casa ${p.first}; segunda casa ${p.second}; falhas ${p.fail}.`));box.append(d);host.append(box)}
  $('v17-pattern-more').hidden=shown.length>=available;
 }
 // V20: mesmos tokens e alvo identificam uma regra ja cadastrada.
 function alreadySaved(p){return (model?.strategies||[]).some(s=>s.target===p.target&&JSON.stringify(s.pattern)===JSON.stringify(p.tokens));}
 function galeChoice(){const n=Number($('v20-gale-import')?.value??2);return [0,1,2].includes(n)?n:2;}
 function allNewPatterns(){return (analysis?.items||[]).filter(p=>!alreadySaved(p));}
 function syncNewCount(){const node=$('v20-available-count');if(node)node.textContent=allNewPatterns().length+' padrões ainda não cadastrados';}
 async function importChunk(patterns){return api('strategies/import-batch',payload('POST',{maxGale:galeChoice(),items:patterns.map(p=>({target:p.target,tokens:p.tokens}))}));}
 async function exportPattern(p){
  if(alreadySaved(p)){notice('Esta regra ja esta cadastrada.',true);drawPatterns();return;}
  if(!confirm('Exportar como PAUSADA com Gale '+galeChoice()+'? Ela NÃO será ativada automaticamente.'))return;
  try{const d=await importChunk([p]);await safeReload();drawPatterns();syncNewCount();notice(d.added?'Estratégia exportada. Gale '+galeChoice()+'. Continua PAUSADA.':'Estratégia já existia.');}
  catch(e){notice('Erro ao exportar: '+e.message,true);}
 }
 async function exportAllPatterns(){
  if(searching){notice('Aguarde a busca terminar.',true);return;}
  const rows=allNewPatterns();if(!analysis||!rows.length){notice('Não há padrões novos para exportar.',true);return;}
  if(!confirm('Exportar '+rows.length+' padrões novos com GALE '+galeChoice()+'? Todos ficarão PAUSADOS. A importação pode demorar e usa cotas do R2.'))return;
  const button=$('v20-export-all');let added=0,skipped=0,done=0;
  if(button)button.disabled=true;
  try{
   for(let i=0;i<rows.length;i+=10){
    const batch=rows.slice(i,i+10),result=await importChunk(batch);
    added+=Number(result.added||0);skipped+=Number(result.skipped||0);done+=batch.length;
    if($('v20-bulk-status'))$('v20-bulk-status').textContent='Exportando '+done+'/'+rows.length+' · '+added+' novas';
    if(i%50===0)await new Promise(r=>setTimeout(r,0));
   }
   await safeReload();drawPatterns();syncNewCount();
   notice('Importação concluída: '+added+' novas, '+skipped+' já existentes. Todas PAUSADAS e Gale '+galeChoice()+'.');
  }catch(e){await safeReload();drawPatterns();syncNewCount();notice('Importação parcial ('+added+' regras). Erro: '+e.message+'. Clique novamente para importar apenas as faltantes.',true);}
  finally{if(button)button.disabled=false;}
 }
 async function setGaleAll(){
  if(!model?.strategies?.length){notice('Nenhuma regra para atualizar.',true);return;}
  const g=galeChoice();
  if(!confirm('Definir Gale '+g+' em TODAS as '+model.strategies.length+' regras existentes? Isso pode afetar ciclos ativos no Telegram.'))return;
  try{const d=await api('strategies/gale-all',payload('POST',{maxGale:g,confirm:true}));await safeReload();notice('Gale '+g+' atualizado nas '+d.count+' estratégias.');}
  catch(e){notice('Erro ao definir Gale global: '+e.message,true);}
 }
 function addExamples(){const list=[['v12-stone-text','Exemplo: 🎲 Pedra sorteada: {pedra}'],['v12-2-after-text','Exemplo: 🎲 Após pedra: {pedra}'],['message-body','Exemplo: 🎯 Entrada confirmada · Estratégia {estrategia} · após pedra {numero}']];for(const [id,text] of list){const field=$(id);if(!field||field.nextElementSibling?.classList.contains('v17-example'))continue;field.insertAdjacentElement('afterend',el('p','v17-example',text+' · Copie o texto se desejar restaurar.'))}
  for(const field of document.querySelectorAll('#v7-global-messages textarea'))if(!field.nextElementSibling?.classList.contains('v17-example'))field.insertAdjacentElement('afterend',el('p','v17-example','Exemplo: 🎲 Após pedra: {pedra} · {numero}, {cor}, {hora} e {estrategia} são preenchidos automaticamente.'));
 }
 function paint(){if(!model)return;paintRules();renderPremiumScores();addExamples()}
 function init(){buildRules();buildScores();buildPatterns();addExamples();
  if(typeof reload==='function'){const old=reload;reload=async function(...args){const ret=await old(...args);paint();return ret}}
  if(typeof page==='function'){const old=page;page=function(name){old(name==='branco-minuto'?'estrategias':name);if(name==='estrategias'||name==='placares')paint()}}
  paint();document.addEventListener('click',ev=>{if(ev.target?.closest?.('[data-page="estrategias"],[data-page="placares"]'))setTimeout(paint,20)});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
