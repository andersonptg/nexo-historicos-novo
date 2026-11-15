/* NEXO V14 — Editor oficial das duas estratégias fixas de Branco por Minuto.
   Todo conteúdo dinâmico é inserido com textContent; alteração só salva via API autenticada. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const e=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
 const apiW=(path,method='GET',body)=>api('white/'+path,method==='GET'?{}:payload(method,body||{}));
 const icons={red:'🔴',black:'⚫',white:'⚪',any:'🟦',none:''};
 const names={red:'Vermelho',black:'Preto',any:'Coringa azul — vermelho ou preto',none:'Sem terceira pedra'};
 const ruleIcon=side=>side.color==='none'?'—':(icons[side.color]||'●')+(side.number==null?' ★':String(side.number));
 const fixedPreview=[
  {name:'FIXA 01 · 🔴4 → ⚪0',stones:'🔴4 → ⚪0',example:'17:30 → 17:40 · proteção 17:44',house:'Segunda casa (estimada)'},
  {name:'FIXA 02 · 🟦 → ⚪0 → ⚫11',stones:'🟦★ → ⚪0 → ⚫11',example:'17:57 / 17:58 → 18:07 · proteção 18:11',house:'Primeira casa (estimada)'}
 ];
 let state=null,editing='',busy=false,lastRefresh=0;
 function btn(text,fn,cls=''){const n=e('button','wh14-btn '+cls,text);n.type='button';n.addEventListener('click',fn);return n;}
 function status(msg,bad=false){const n=$('wh14-status');if(n){n.textContent=msg;n.classList.toggle('bad',bad)}}
 async function safe(fn){if(busy)return;busy=true;try{await fn()}catch(err){status(err?.message||String(err),true)}finally{busy=false}}
 function field(label,id,type='text',opts={}){const wrap=e('label','wh14-field'),cap=e('span','',label);let n;
  if(type==='select'){n=e('select');for(const [v,t] of opts.choices||[]){const o=e('option','',t);o.value=v;n.append(o)}}
  else{n=e('input');n.type=type;if(opts.placeholder)n.placeholder=opts.placeholder;if(opts.min!=null)n.min=opts.min;if(opts.max!=null)n.max=opts.max;if(opts.maxLength)n.maxLength=opts.maxLength;}
  n.id=id;wrap.append(cap,n);return wrap;
 }
 function formBlock(){
  const box=e('section','wh14-panel wh14-editor');box.id='wh14-editor';
  box.append(e('div','wh14-eyebrow','01 / MONTADOR PROFISSIONAL'),e('h3','','Editar estratégias fixas'),e('p','wh14-muted','Toque em Editar em uma das regras já montadas ou crie outra. Os horários são calculados pelas rodadas observadas, sem digitar minutos manualmente.'));
  const form=e('form');form.id='wh14-form';
  form.append(field('Nome da estratégia','wh14-name','text',{maxLength:75,placeholder:'Ex.: Coringa + branco + 11'}));
  const stones=e('div','wh14-stones');
  const before=e('div','wh14-stone-edit');before.append(e('strong','','01 · PEDRA ANTES'),field('Cor ou coringa','wh14-before-color','select',{choices:[['red','🔴 Vermelho'],['black','⚫ Preto'],['any','🟦 Curinga · vermelho ou preto']]}),field('Número da pedra','wh14-before-number','select',{choices:[]}));
  const center=e('div','wh14-center');center.append(e('strong','','02 · BRANCO'),e('div','wh14-whiteball','⚪0'),e('small','','Minuto calculado automaticamente'));
  const after=e('div','wh14-stone-edit');after.append(e('strong','','03 · PEDRA DEPOIS'),field('Cor ou ausência','wh14-after-color','select',{choices:[['none','Sem terceira pedra'],['red','🔴 Vermelho'],['black','⚫ Preto'],['any','🟦 Coringa · vermelho ou preto']]}),field('Número da pedra','wh14-after-number','select',{choices:[]}));
  stones.append(before,center,after);form.append(stones);
  const timing=e('div','wh14-field-grid');timing.append(
   field('Tipo de cálculo','wh14-mode','select',{choices:[['relative','+ minutos após o branco'],['sum','Soma dos números + minuto (V13)']]}),
   field('Minutos após o branco','wh14-offset','number',{min:1,max:120}),
   field('Proteção (+ minutos)','wh14-increment','number',{min:3,max:30}),
   field('Tolerância (± minutos)','wh14-tolerance','select',{choices:[['0','Minuto exato'],['1','± 1 minuto'],['2','± 2 minutos']]}),
   field('Casa de entrada (referência)','wh14-house','select',{choices:[['auto','Detectar 1ª / 2ª pelo minuto'],['second','Segunda casa'],['first','Primeira casa'],['any','Qualquer casa']]}),
   field('Atraso após atenção (segundos)','wh14-delay','select',{choices:[['0','Sem atraso'],['15','15 s · depende do cron'],['30','30 s · depende do cron'],['60','60 s · depende do cron']]})
  );form.append(timing);
  const enable=e('label','wh14-switch'),check=e('input');check.type='checkbox';check.id='wh14-enabled';check.checked=true;enable.append(check,e('span','','Estratégia ATIVA ao salvar — detecção automática; Telegram continua independente'));form.append(enable);
  const preview=e('div','wh14-preview');preview.id='wh14-preview';form.append(preview);
  const controls=e('div','wh14-actions'),save=e('button','wh14-btn primary','💾 Salvar estratégia');save.type='submit';save.id='wh14-save';controls.append(save,btn('+ Nova estratégia',resetForm));form.append(controls);
  const note=e('p','wh14-warning','⚠️ A fonte atual informa o MINUTO, não confirma a primeira/segunda casa de cada giro. A casa é uma referência configurável; o WIN é conferido pelo minuto até existir informação mais precisa.');form.append(note);
  form.addEventListener('submit',ev=>{ev.preventDefault();void safe(saveRule)});
  box.append(form);
  return box;
 }
 function numbers(side,current){const select=$('wh14-'+side+'-number'),color=$('wh14-'+side+'-color').value;select.replaceChildren();
  const empty=e('option','','Qualquer número');empty.value='';select.append(empty);
  if(color==='red'||color==='black')for(let n=color==='red'?1:8;n<=(color==='red'?7:14);n++){const opt=e('option','',n);opt.value=String(n);select.append(opt)}
  if(['any','none'].includes(color)){select.value='';select.disabled=true;return}
  select.disabled=false;const ok=[...select.options].some(x=>x.value===String(current??''));select.value=ok?String(current??''):'';
 }
 function readRule(){const part=side=>({color:$('wh14-'+side+'-color').value,number:$('wh14-'+side+'-number').value===''?null:Number($('wh14-'+side+'-number').value)});
  return {name:$('wh14-name').value.trim(),before:part('before'),after:part('after'),mode:$('wh14-mode').value,offset:Number($('wh14-offset').value),increment:Number($('wh14-increment').value),tolerance:Number($('wh14-tolerance').value),house:$('wh14-house').value,alertDelaySeconds:Number($('wh14-delay').value),enabled:$('wh14-enabled').checked};
 }
 function resetForm(){if(!$('wh14-form'))return;editing='';$('wh14-form').reset();$('wh14-name').value='';$('wh14-before-color').value='red';$('wh14-after-color').value='none';numbers('before',4);numbers('after');$('wh14-mode').value='relative';$('wh14-offset').value='10';$('wh14-increment').value='4';$('wh14-tolerance').value='1';$('wh14-house').value='auto';$('wh14-delay').value='30';$('wh14-enabled').checked=true;$('wh14-save').textContent='💾 Salvar nova estratégia';paintPreview()}
 function paintPreview(){const preview=$('wh14-preview');if(!preview)return;const r=readRule();const left=ruleIcon(r.before)+' → ⚪0'+(r.after.color==='none'?'':' → '+ruleIcon(r.after));preview.replaceChildren();preview.append(e('strong','','PRÉVIA DA ESTRATÉGIA'),e('div','wh14-preview-stones',left));
  const example=r.mode==='relative'?`Se ⚪0 sair 17:30, entrada ${minClock(17,30+r.offset)} e proteção ${minClock(17,30+r.offset+r.increment)}`:'Soma dos números e do minuto, conforme modelo V13';
  preview.append(e('small','',example+' · '+({first:'1ª casa',second:'2ª casa',any:'qualquer casa',auto:'casa estimada conforme minuto'}[r.house]||'')+' (não verificável pela fonte atual)'));
  $('wh14-offset').disabled=r.mode==='sum';
 }
 function minClock(h,m){const n=(h*60+m)%(24*60);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 function editRule(r){editing=r.id;for(const [id,value] of [['name',r.name],['before-color',r.before.color],['after-color',r.after.color],['mode',r.mode||'sum'],['offset',r.offset||10],['increment',r.increment],['tolerance',r.tolerance],['house',r.house||'any'],['delay',r.alertDelaySeconds||0]])$('wh14-'+id).value=String(value);
  numbers('before',r.before.number);numbers('after',r.after.number);$('wh14-enabled').checked=r.enabled===true;$('wh14-save').textContent='💾 Salvar alterações';paintPreview();$('wh14-editor').scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function saveRule(){const r=readRule();if(!r.name||r.name.length<3)throw Error('Digite um nome com pelo menos 3 caracteres.');if(r.mode==='sum'&&r.after.color==='none')throw Error('O modo Soma precisa de pedra depois do branco.');
  const out=await apiW(editing?'rules/'+editing:'rules',editing?'PUT':'POST',r);await refresh();status('✓ Estratégia salva: '+out.rule.name+'. '+(out.rule.enabled?'Monitoramento ativo; bot depende de sua configuração.':'Monitoramento pausado.'));resetForm();
 }
 async function toggleRule(r){await safe(async()=>{await apiW('rules/'+r.id,'PUT',{...r,enabled:!r.enabled});await refresh();status('Estratégia '+(r.enabled?'pausada':'ativada')+' com sucesso')})}
 async function deleteRule(r){if(!confirm('Excluir definitivamente “'+r.name+'”? A exclusão não afeta as outras regras nem os históricos gerais.'))return;await safe(async()=>{await apiW('rules/'+r.id,'DELETE',{confirm:true});if(editing===r.id)resetForm();await refresh();status('Estratégia excluída.')})}
 function ruleList(){const host=$('wh14-rule-list');host.replaceChildren();const all=state?.rules||[];
  if(!all.length){host.append(e('p','wh14-muted','Nenhuma regra. Use o editor para criar uma.'));return}
  for(const r of all){const item=e('article','wh14-rule'),head=e('div','wh14-rule-head');head.append(e('strong','',r.name),e('span',r.enabled?'wh14-on':'wh14-off',r.enabled?'● ATIVA':'○ PAUSADA'));item.append(head);
   const stones=e('div','wh14-rule-stones');stones.append(chip(r.before),e('span','','→'),chip({color:'white',number:0}));if(r.after.color!=='none')stones.append(e('span','','→'),chip(r.after));item.append(stones);
   const mode=r.mode==='relative'?`+${r.offset||10} minutos após branco`:'Soma das pedras + minuto';
   item.append(e('p','wh14-muted',mode+' · proteção +'+r.increment+' min · ±'+r.tolerance+' min · '+(r.house==='first'?'1ª casa':r.house==='second'?'2ª casa':r.house==='auto'?'detecção automática da casa':'casa livre')));
   const sc=(state.scores||[]).find(x=>x.id===r.id)||{};item.append(e('div','wh14-score',`🎯 ${sc.signals||0} sinais   ✅ ${sc.wins||0} WIN   🚫 ${sc.losses||0} LOSS   ⏸ ${sc.cancelled||0} cancelados`));
   const actions=e('div','wh14-rule-actions');actions.append(btn('✎ Editar',()=>editRule(r)),btn(r.enabled?'⏸ Pausar':'▶ Ativar',()=>void toggleRule(r),r.enabled?'pause':'success'),btn('Excluir',()=>void deleteRule(r),'danger'));item.append(actions);host.append(item)
  }
 }
 function chip(part){const cls=part.color||'any';return e('span','wh14-chip '+cls,ruleIcon(part))}
 function statusPanel(){const host=$('wh14-running');host.replaceChildren();const a=state.runtime?.active;host.append(e('strong','',a?'⏱ Estratégia em andamento':'⌛ Aguardando sequência'));if(a)host.append(e('p','',`${a.name} — ${a.label1} / ${a.label2} · ${a.sequence}`));
  else host.append(e('p','wh14-muted','Uma regra por vez. Quando uma sequência nova for identificada, o bot agendado respeitará a regra escolhida.'));
  $('wh14-live').textContent=state.config.botEnabled?'BOT BRANCO LIGADO':'BOT BRANCO DESLIGADO';
  $('wh14-config').textContent=state.botConfigured?'✓ Secret do bot de branco configurado':'⚠️ Token do segundo bot ausente';
 }
 function chatPanel(){const host=$('wh14-chats');host.replaceChildren();for(const ch of state.chats||[]){const line=e('label','wh14-chat'),input=e('input');input.type='checkbox';input.value=String(ch.id);input.checked=(state.config.chats||[]).includes(String(ch.id));input.disabled=!ch.permitted;line.append(input,e('span','',ch.name+(ch.permitted?'':' · sem permissão')));line.append(btn('Testar',()=>void safe(async()=>{await apiW('bot/test','POST',{chatId:String(ch.id)});status('Mensagem de teste enviada.')})));host.append(line)}
  if(!state.chats.length)host.append(e('p','wh14-muted','Adicione o novo bot a um grupo, envie /nexo_branco e clique em Buscar grupos. No privado, envie /start.'));
  $('wh14-bot-enabled').checked=state.config.botEnabled===true;
  const blocked=$('wh14-blocked');blocked.replaceChildren();for(const row of state.blocked||[]){const cell=e('div','wh14-danger-row');cell.append(e('strong','','Entrega incerta · chat ••'+String(row.chatId).slice(-4)),e('small','',row.error||''),btn('Já conferi — desbloquear',()=>{if(!confirm('Conferiu o destino? A mensagem incerta não será reenviada.'))return;void safe(async()=>{await apiW('deliveries/clear','POST',{chatId:row.chatId,confirm:true});await refresh()})}));blocked.append(cell)}
 }
 const templates={attention:'⚠️ Atenção — sticker ou texto',signal:'🤍 BRANCO BRABET PRO',win:'✅ WIN (horário confirmado)',loss:'🚫 LOSS'};
 function messagePanel(){const host=$('wh14-templates');host.replaceChildren();for(const key of ['attention','signal','win','loss']){
  const template=state.config.templates?.[key]||{},wrap=e('article','wh14-template');wrap.append(e('h4','',templates[key]));
  const format=e('select'),types=[['text','Texto'],['sticker','Sticker'],['gif','GIF']];for(const [v,title] of types){const option=e('option','',title);option.value=v;format.append(option)}format.value=template.type||'text';
  const input=e('textarea');input.rows=3;input.value=template.text||'';input.maxLength=1000;
  const media=e('select');const update=()=>{media.replaceChildren();const empty=e('option','','Selecione a mídia importada');empty.value='';media.append(empty);for(const item of state.media||[]){if(item.type!==format.value)continue;const opt=e('option','',item.name||item.type);opt.value=item.id;media.append(opt)}media.value=template.mediaId||'';input.hidden=format.value!=='text';media.hidden=format.value==='text'};format.addEventListener('change',update);update();
  wrap.append(format,input,media,e('p','wh14-muted','Campos: {hora1}, {hora2}, {casa}, {sequencia}, {resultado}, {estrategia}'));
  wrap.append(btn('💾 Salvar '+templates[key],()=>void safe(async()=>{await apiW('config','PUT',{kind:'template',event:key,template:{type:format.value,text:input.value,mediaId:media.value}});await refresh();status('Mensagem '+templates[key]+' salva.')}),'primary'));host.append(wrap);
 }}
 async function refresh(){if(!$('wh14-dashboard'))return;state=await apiW('overview');ruleList();statusPanel();chatPanel();messagePanel();$('wh14-summary').textContent=(state.rules||[]).filter(x=>x.enabled).length+' estratégias ativas · fonte com precisão de minuto';lastRefresh=Date.now()}
 async function saveBot(){await safe(async()=>{const chats=[...document.querySelectorAll('#wh14-chats input:checked')].map(x=>x.value);await apiW('config','PUT',{kind:'bot',botEnabled:$('wh14-bot-enabled').checked,chats});await refresh();status('Novo bot configurado; robô antigo preservado.')})}
 function build(){const root=$('white-dashboard');if(!root||$('wh14-dashboard'))return;root.replaceChildren();const dashboard=e('div','wh14-dashboard');dashboard.id='wh14-dashboard';
  const hero=e('header','wh14-hero');hero.append(e('span','wh14-eyebrow','NEXO · ESTRATÉGIAS FIXAS'),e('h2','','Branco por Minuto'),e('p','wh14-muted','Duas estratégias pré-montadas, prontas para editar números, coringa, horários e mensagens. Reconhecimento das pedras automático.'));const head=e('div','wh14-headline');head.id='wh14-summary';hero.append(head,btn('↻ Adicionar modelos fixos que estiverem faltando',()=>{if(!confirm('Adicionar somente os modelos fixos ausentes, sem mudar suas regras atuais?'))return;void safe(async()=>{const r=await apiW('presets','POST',{confirm:true});await refresh();status(r.added+' modelo(s) fixo(s) adicionado(s).')})},'primary'));dashboard.append(hero);
  const presets=e('section','wh14-presets');for(const p of fixedPreview){const item=e('article','wh14-preset');item.append(e('strong','',p.name),e('div','wh14-big-stones',p.stones),e('p','',p.example),e('small','',p.house));presets.append(item)}dashboard.append(presets);
  const grid=e('div','wh14-main-grid');const roster=e('section','wh14-panel');roster.append(e('div','wh14-eyebrow','ESTRATÉGIAS SALVAS'),e('h3','','Suas estratégias'),e('p','wh14-muted','Edite qualquer regra. A exclusão exige uma confirmação, sem digitar nome.'));const rules=e('div');rules.id='wh14-rule-list';roster.append(rules);grid.append(roster);grid.append(formBlock());dashboard.append(grid);
  const monitor=e('section','wh14-panel');monitor.append(e('div','wh14-eyebrow','MONITORAMENTO'),e('h3','','Status da estratégia e do robô'));const box=e('div');box.id='wh14-running';monitor.append(box,e('span','wh14-live','BOT BRANCO DESLIGADO'));const live=monitor.querySelector('.wh14-live');live.id='wh14-live';dashboard.append(monitor);
  const msg=e('section','wh14-panel');msg.append(e('div','wh14-eyebrow','MENSAGENS AUTOMÁTICAS'),e('h3','','Editar atenção, sinal, WIN e LOSS'),e('p','wh14-muted','Atenção primeiro. Sinal personalizado depois do atraso configurado. WIN ou LOSS por resultado confirmado. Sticker e GIF importados do segundo bot.'));const msggrid=e('div','wh14-template-grid');msggrid.id='wh14-templates';msg.append(msggrid);dashboard.append(msg);
  const bot=e('section','wh14-panel');bot.append(e('div','wh14-eyebrow','TELEGRAM INDEPENDENTE'),e('h3','','Segundo bot · Branco BRABET PRO'),e('p','wh14-muted','Secret Cloudflare: NEXO_WHITE_BOT_TOKEN. Não digite token no navegador. O bot de cores não será alterado.'));const configured=e('div','wh14-config','Verificando token...');configured.id='wh14-config';bot.append(configured);
  const actions=e('div','wh14-actions');actions.append(btn('↻ Buscar grupos',()=>void safe(async()=>{await apiW('chats/discover','POST',{});await refresh()})),btn('🎞 Importar stickers',()=>void safe(async()=>{const r=await apiW('media/import','POST',{});await refresh();status(r.imported+' mídias importadas')})));bot.append(actions);const chats=e('div');chats.id='wh14-chats';bot.append(chats);const switcher=e('label','wh14-switch'),enabled=e('input');enabled.id='wh14-bot-enabled';enabled.type='checkbox';switcher.append(enabled,e('span','','Autorizar envios do segundo bot somente após configurar grupos e stickers'));bot.append(switcher,btn('💾 Salvar novo bot',()=>void saveBot(),'primary'));const blocked=e('div');blocked.id='wh14-blocked';bot.append(blocked);dashboard.append(bot);
  const foot=e('p','wh14-status','Aguardando autenticação...');foot.id='wh14-status';dashboard.append(foot);root.append(dashboard);resetForm();
  for(const id of ['wh14-before-color','wh14-after-color'])$(id).addEventListener('change',()=>{numbers(id==='wh14-before-color'?'before':'after');paintPreview()});
  for(const id of ['wh14-before-number','wh14-after-number','wh14-mode','wh14-offset','wh14-increment','wh14-tolerance','wh14-house','wh14-delay'])$(id).addEventListener('input',paintPreview);
 }
 function start(){build();if(typeof page==='function'){const orig=page;page=function(name){orig(name);if(name==='branco-minuto')void safe(refresh)}}
  if(location.hash==='#branco-minuto'&&!$('shell')?.hidden)void safe(refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash==='#branco-minuto')void safe(refresh)});
  setInterval(()=>{if(location.hash==='#branco-minuto'&&!document.hidden&&!busy&&Date.now()-lastRefresh>20000&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))void safe(refresh)},5000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
