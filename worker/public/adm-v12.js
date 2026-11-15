/* NEXO V12 - configuração da pedra, biblioteca de estratégias e placar visual.
   Os controles só salvam depois de clique; nunca ativam Telegram. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node;};
 const mkbtn=(text,action)=>{const b=el('button','',text);b.type='button';b.onclick=action;return b;};
 const cls=t=>t==='red'?'red':t==='black'?'black':t==='white'?'white':t==='*'?'joker':t?.startsWith('n:')?(Number(t.slice(2))===0?'white':Number(t.slice(2))<=7?'red':'black'):'joker';
 const ball=t=>{const b=el('span','v12-ball '+cls(t),t?.startsWith('n:')?t.slice(2):t==='*'?'★':t==='white'?'0':'●');b.title=t;b.setAttribute('aria-label',t);return b;};
 let refreshing=false,stoneDirty=false,stoneInit=false;
 function stoneControls(){
  const root=$('v7-global-messages');if(!root||$('v12-stone-settings'))return;
  const section=el('section','v12-stone-settings');section.id='v12-stone-settings';
  section.append(el('h2','','🎲 Pedra sorteada — campo independente'),el('p','v12-sub','Marque para enviar a pedra após WIN ou RED. Desmarque para não enviar esse resultado separado. Use {quadrado_espaco}, {quadrado}, {pedra}, {numero}, {cor}, {hora} e {estrategia}.'));
  const label=el('label','v12-toggle'),check=el('input');check.type='checkbox';check.id='v12-stone-enabled';label.append(check,el('span','','Enviar resultado da pedra sorteada após o encerramento'));section.append(label);
  const text=el('textarea');text.id='v12-stone-text';text.maxLength=400;text.rows=3;text.placeholder='🎲 Pedra sorteada: {quadrado}';text.setAttribute('aria-label','Mensagem da pedra sorteada');section.append(text);
  const actions=el('div','v12-row'),state=el('span','v12-status','Carregando configurações…');state.id='v12-stone-status';const button=mkbtn('💾 Salvar campo da pedra',saveStone);actions.append(button,state);section.append(actions);
  for(const input of [check,text])input.addEventListener('input',()=>{stoneDirty=true;state.textContent='Alterações não salvas';window.NEXO_V12_PREVIEW?.();});
  root.insertBefore(section,root.querySelector('.v7-link')||root.firstChild);
  void loadStone();
 }
 async function loadStone(force=false){
  if(refreshing||stoneDirty&&!force)return;refreshing=true;
  try{
   const data=await api('global-signals'),stone=data.config?.stone||{};
   $('v12-stone-enabled').checked=stone.enabled!==false;
   $('v12-stone-text').value=stone.text||'🎲 Pedra sorteada: {quadrado_espaco}';
   $('v12-stone-status').textContent='Configuração atual carregada';stoneDirty=false;stoneInit=true;window.NEXO_V12_PREVIEW?.();
  }catch(e){$('v12-stone-status').textContent='Erro ao carregar: '+e.message;}finally{refreshing=false;}
 }
 async function saveStone(){
  const enabled=$('v12-stone-enabled').checked,text=$('v12-stone-text').value.trim();
  if(enabled&&!text){$('v12-stone-status').textContent='Informe o texto do resultado.';return;}
  if(!confirm('Salvar a configuração da pedra sorteada para as estratégias?'))return;
  const btn=$('v12-stone-settings').querySelector('button');btn.disabled=true;
  try{await api('global-signals',payload('PUT',{mode:'stone',stone:{enabled,text}}));stoneDirty=false;$('v12-stone-status').textContent='✓ Campo da pedra salvo com sucesso';window.NEXO_V12_PREVIEW?.();}
  catch(e){$('v12-stone-status').textContent='Erro: '+e.message;}finally{btn.disabled=false;}
 }
 function strategyUI(){
  const page=$('page-estrategias');if(!page||$('v12-showcase'))return;
  const showcase=el('section','v12-showcase');showcase.id='v12-showcase';
  showcase.append(el('h2','','▣ Vitrine das estratégias'),el('p','v12-sub','Visualize cada padrão salvo antes de editar. Apenas uma estratégia poderá ocupar o ciclo ativo de cada jogo.'));
  const list=el('div','v12-strategy-list');list.id='v12-strategy-list';showcase.append(list);
  const inspect=el('div','v12-inspector');inspect.id='v12-inspector';inspect.hidden=true;showcase.append(inspect);
  page.querySelector('.strategies-layout')?.insertAdjacentElement('beforebegin',showcase);
  const oldStoneControl=$('st-stone')?.closest('label');if(oldStoneControl)oldStoneControl.hidden=true;
  const checks=$('strategy-form')?.querySelector('.checks');
  if(checks&&!$('v12-stone-strategy')){
   const label=el('label','v12-toggle'),check=el('input');check.type='checkbox';check.id='v12-stone-strategy';check.checked=true;
   label.append(check,el('span','','Permitir pedra sorteada no WIN/RED desta estratégia (respeita a configuração global)'));checks.append(label);
  }
  paintStrategies();
 }
 function paintStrategies(){
  const host=$('v12-strategy-list');if(!host||typeof model==='undefined'||!model)return;host.replaceChildren();
  if(!model.strategies?.length){host.append(el('p','v12-sub','Nenhuma estratégia criada. Utilize o editor abaixo.'));return;}
  for(const s of model.strategies){
   const card=el('article','v12-strategy-card');card.append(el('strong','',s.name||'Estratégia'));
   const meta=el('div','v12-strategy-meta',(s.enabled?'● ATIVA':'○ PAUSADA')+' · '+(s.target==='red'?'🔴 Vermelho':'⚫ Preto')+' + Branco · '+(s.maxGale||0)+' Gale(s)');card.append(meta);
   const chips=el('div','v12-chips');for(const token of (s.pattern||[]).slice(0,32))chips.append(ball(token));if((s.pattern||[]).length>32)chips.append(el('small','','+'+(s.pattern.length-32)));
   card.append(chips);
   const actions=el('div','v12-row');actions.append(mkbtn('👁 Visualizar',()=>inspectStrategy(s)),mkbtn('✎ Editar',()=>{selected=s.id;renderStrategies();renderMessage();$('st-name')?.scrollIntoView({behavior:'smooth',block:'center'});}));card.append(actions);host.append(card);
  }
 }
 function inspectStrategy(s){
  const pane=$('v12-inspector');pane.replaceChildren();pane.hidden=false;
  const head=el('div','v12-row');head.append(el('h3','','Visualização · '+s.name),mkbtn('✕ Fechar',()=>{pane.hidden=true}));pane.append(head);
  pane.append(el('p','v12-strategy-meta','Alvo '+(s.target==='red'?'VERMELHO':'PRETO')+' + BRANCO · Gale máximo '+s.maxGale+' · '+(s.enabled?'ATIVA':'PAUSADA')));
  const chips=el('div','v12-chips');for(const p of s.pattern||[])chips.append(ball(p));pane.append(chips);
  pane.append(el('p','v12-sub','Pedra após resultado: '+(s.showStoneAfter===false?'DESLIGADA':'PERMITIDA')+' (também depende da configuração global). A visualização não envia sinais nem modifica regras.'));
  pane.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function scoreboard(){
  const page=$('page-placares');if(!page||$('v12-scoreboard'))return;
  const section=el('section','v12-scoreboard');section.id='v12-scoreboard';section.append(el('h2','','📊 Placar de resultados do dia'),el('p','v12-sub','Contagens registradas por estratégia. A taxa considera apenas WINs e REDs já encerrados; não prevê rodadas futuras.'));
  const grid=el('div','v12-score-grid');grid.id='v12-score-grid';section.append(grid);
  const details=el('div');details.id='v12-score-details';section.append(details);
  page.querySelector('#score-cards')?.insertAdjacentElement('beforebegin',section);paintScores();
 }
 function paintScores(){
  const grid=$('v12-score-grid'),details=$('v12-score-details');if(!grid||!details||!model)return;grid.replaceChildren();details.replaceChildren();
  const scores=model.scores||[],stats={entries:0,green:0,white:0,red:0,gale1:0,gale2:0};
  for(const s of scores)for(const key of Object.keys(stats))stats[key]+=Number(s[key]||0);
  const ended=stats.green+stats.white+stats.red,rate=ended?(100*(stats.green+stats.white)/ended).toFixed(1)+'%':'—';
  for(const [lab,val] of [['ENTRADAS',stats.entries],['WIN',stats.green],['BRANCO',stats.white],['RED',stats.red],['GALE 1',stats.gale1],['GALE 2',stats.gale2],['TAXA CONCLUÍDA',rate]]){
   const cell=el('div','v12-score-stat');cell.append(el('small','',lab),el('strong','',String(val)));grid.append(cell);
  }
  for(const s of scores){const done=(s.green||0)+(s.white||0)+(s.red||0),wins=(s.green||0)+(s.white||0);
   const row=el('div','v12-score-line');row.append(el('strong','',s.name),el('b','',`${wins} WIN · ${s.red||0} RED · ${done?(100*wins/done).toFixed(0)+'%':'—'}`));
   const progress=el('div','v12-progress'),fill=el('span');fill.style.width=(done?Math.min(100,100*wins/done):0)+'%';progress.append(fill);details.append(row,progress);
  }
 }
 function init(){stoneControls();strategyUI();scoreboard();
  if(typeof reload==='function'){
   const old=reload;
   reload=async function(...args){const result=await old(...args);paintStrategies();paintScores();return result;};
  }
  if(typeof page==='function'){
   const prev=page;
   page=function(name){prev(name);if(name==='mensagens'&&!stoneInit)void loadStone();if(name==='placares')paintScores();if(name==='estrategias')paintStrategies();};
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
