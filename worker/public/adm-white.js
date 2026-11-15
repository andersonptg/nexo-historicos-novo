/* NEXO V13 - Branco por Minuto: painel independente, só ações explícitas salvam. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
 const apiWhite=(p,method='GET',body)=>api('white/'+p,method==='GET'?{}:payload(method,body||{}));
 let data=null,editing='',busy=false,lastOpen=0;
 const icon=c=>c==='red'?'🔴':c==='black'?'⚫':'⚪';
 function make(label,action,style=''){const b=el('button','white-btn '+style,label);b.type='button';b.addEventListener('click',action);return b;}
 function line(title,content){const b=el('div','white-line');b.append(el('span','',title),el('strong','',String(content)));return b;}
 function setStatus(text,bad=false){const e=$('white-status');if(e){e.textContent=text;e.classList.toggle('bad',bad)}}
 function panels(){const root=$('white-dashboard');if(!root||$('white-editor'))return;
  const hero=el('section','white-hero');hero.append(el('span','white-tag','NEXO · MÓDULO INDEPENDENTE'),el('h2','','Branco por minuto'),el('p','','Padrão detectado → soma dos números + minuto do branco → duas janelas de horário. O cálculo indica uma hipótese, não uma probabilidade comprovada de acerto.'));
  hero.append(el('div','white-hero-values','⚫8   +   ⚪ 05:20   +   🔴7   =   35   →   05:35 / 05:39'));
  const info=el('div','white-info');info.id='white-info';hero.append(info);root.append(hero);
  const layout=el('div','white-layout');const editor=el('section','white-panel');editor.id='white-editor';editor.append(el('div','white-panel-kicker','01 / REGRAS'),el('h3','','Montador de sequência'));
  const form=el('form');form.id='white-rule-form';form.innerHTML=`
   <label class="white-label">Nome da estratégia <input id="white-name" maxlength="75" required placeholder="Ex.: Branco de Soma 8 + 20 + 7"></label>
   <div class="white-builder"><div class="white-step"><strong>01 · ANTES</strong><select id="white-before-color"><option value="black">⚫ Preto</option><option value="red">🔴 Vermelho</option></select><select id="white-before-number"></select></div>
   <div class="white-step white-white"><strong>02 · BRANCO</strong><span class="white-zero">⚪ 0</span><small>Minuto identificado automaticamente</small></div>
   <div class="white-step"><strong>03 · DEPOIS</strong><select id="white-after-color"><option value="red">🔴 Vermelho</option><option value="black">⚫ Preto</option></select><select id="white-after-number"></select></div></div>
   <div class="white-two"><label class="white-label">Somar minutos à segunda janela<select id="white-increment"><option value="3">+3 minutos</option><option value="4" selected>+4 minutos</option><option value="5">+5 minutos</option><option value="6">+6 minutos</option><option value="10">+10 minutos</option></select></label>
   <label class="white-label">Tolerância<select id="white-tolerance"><option value="0">Somente minuto exato</option><option value="1" selected>±1 minuto</option><option value="2">±2 minutos</option></select></label></div>
   <div class="white-preview" id="white-rule-preview"></div><div class="white-buttons"><button type="submit" class="white-btn primary">💾 Salvar estratégia</button><button type="button" class="white-btn" id="white-clear">+ Nova regra</button></div>`;
  editor.append(form);layout.append(editor);
  const roster=el('section','white-panel');roster.append(el('div','white-panel-kicker','02 / CADASTROS'),el('h3','','Estratégias e placares'));const saved=el('div');saved.id='white-saved';roster.append(saved);layout.append(roster);root.append(layout);
  const runtime=el('section','white-panel');runtime.append(el('div','white-panel-kicker','03 / MONITORAMENTO'),el('h3','','Tendência ativa e eventos'));const state=el('div');state.id='white-runtime';const log=el('div');log.id='white-events';runtime.append(state,log);root.append(runtime);
  const bot=el('section','white-panel');bot.append(el('div','white-panel-kicker','04 / BOT EXCLUSIVO'),el('h3','','Telegram — Branco por Minuto'),el('p','white-sub','Crie outro bot no @BotFather. Configure o token como Secret NEXO_WHITE_BOT_TOKEN na Cloudflare. O bot atual continua independente; nenhum webhook antigo será alterado.'));
  const boot=el('div','white-bot-head');boot.id='white-bot-head';bot.append(boot);
  const action=el('div','white-buttons');action.append(make('↻ Buscar grupos do novo bot',()=>void run(async()=>{await apiWhite('chats/discover','POST',{});await refresh();setStatus('Grupos atualizados.')})),make('🎞 Importar stickers/GIFs',()=>void run(async()=>{const r=await apiWhite('media/import','POST',{});await refresh();setStatus('Mídias importadas: '+r.imported)})));
  bot.append(action);const chat=el('div');chat.id='white-chat-list';bot.append(chat);const blocked=el('div');blocked.id='white-blocked';bot.append(blocked);
  const control=el('div','white-buttons');const label=el('label','white-check');const toggle=el('input');toggle.type='checkbox';toggle.id='white-bot-enabled';label.append(toggle,el('span','','Autorizar envios do NOVO robô'));control.append(label,make('💾 Salvar destinos e estado',()=>void saveBot()));bot.append(control);
  root.append(bot);
  const events=el('section','white-panel');events.append(el('div','white-panel-kicker','05 / MENSAGENS'),el('h3','','Mensagens e mídias por evento'),el('p','white-sub','Cada evento escolhe UM formato: texto, sticker ou GIF. A nova biblioteca é exclusiva desse bot.'));
  const list=el('div','white-template-list');list.id='white-template-list';events.append(list);root.append(events);
  const notice=el('p','white-status');notice.id='white-status';notice.textContent='O módulo inicia pausado. Nenhum envio automático antes de ativar uma regra e o novo bot.';root.append(notice);
  $('white-rule-form').addEventListener('submit',e=>{e.preventDefault();void saveRule()});$('white-clear').addEventListener('click',()=>clearEditor());
  for(const id of ['white-before-color','white-after-color'])$(id).addEventListener('change',()=>{populateNum(id==='white-before-color'?'before':'after');paintPreview()});
  for(const id of ['white-before-number','white-after-number','white-increment','white-tolerance'])$(id).addEventListener('change',paintPreview);
  populateNum('before');populateNum('after');paintPreview();
 }
 function populateNum(side,selectValue){const color=$('white-'+side+'-color').value,select=$('white-'+side+'-number'),old=selectValue===undefined?select.value:selectValue;select.replaceChildren();let opt=el('option','','Qualquer número');opt.value='';select.append(opt);
  for(let n=color==='red'?1:8;n<=(color==='red'?7:14);n++){opt=el('option','',String(n));opt.value=String(n);select.append(opt)}select.value=old||'';
 }
 function previewCalc(before,after,min,increment){const a=Number(before)+Number(min)+Number(after);const minutes=(h,m)=>{let total=h*60+m;return String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0')};const base=5;let first=base*60+a;while(first<=base*60+21)first+=60;return {sum:a,t1:minutes(0,first),t2:minutes(0,first+increment)}}
 function paintPreview(){const host=$('white-rule-preview');if(!host)return;const b=$('white-before-number').value||'8',c=$('white-after-number').value||'7',calc=previewCalc(b,c,20,Number($('white-increment').value));host.textContent=`EXEMPLO • ${icon($('white-before-color').value)}${b} → ⚪0 às 05:20 → ${icon($('white-after-color').value)}${c}  |  Soma ${calc.sum}  |  ${calc.t1} e ${calc.t2}  |  Tolerância ±${$('white-tolerance').value} min`;}
 function readRule(){return {name:$('white-name').value.trim(),before:{color:$('white-before-color').value,number:$('white-before-number').value===''?null:Number($('white-before-number').value)},after:{color:$('white-after-color').value,number:$('white-after-number').value===''?null:Number($('white-after-number').value)},increment:Number($('white-increment').value),tolerance:Number($('white-tolerance').value),enabled:editing?data.rules.find(x=>x.id===editing)?.enabled===true:false}}
 function clearEditor(){$('white-rule-form').reset();editing='';populateNum('before');populateNum('after');paintPreview();$('white-rule-form button[type=submit]').textContent='💾 Salvar estratégia'}
 async function run(fn){if(busy)return;busy=true;try{await fn()}catch(e){setStatus(String(e.message||e),true)}finally{busy=false}}
 function saveRule(){void run(async()=>{const body=readRule(),method=editing?'PUT':'POST',path=editing?'rules/'+editing:'rules';const r=await apiWhite(path,method,body);await refresh();setStatus('✓ Estratégia salva: '+r.rule.name);clearEditor()})}
 function editRule(rule){editing=rule.id;$('white-name').value=rule.name;$('white-before-color').value=rule.before.color;$('white-after-color').value=rule.after.color;populateNum('before',rule.before.number===null?'':String(rule.before.number));populateNum('after',rule.after.number===null?'':String(rule.after.number));$('white-increment').value=String(rule.increment);$('white-tolerance').value=String(rule.tolerance);$('white-rule-form button[type=submit]').textContent='💾 Salvar alterações';paintPreview();$('white-editor').scrollIntoView({behavior:'smooth',block:'center'})}
 function toggleRule(rule){void run(async()=>{await apiWhite('rules/'+rule.id,'PUT',{...rule,enabled:!rule.enabled});await refresh();setStatus(rule.enabled?'Estratégia pausada':'Estratégia ativada somente para novas rodadas')})}
 function deleteRule(rule){if(!confirm('Excluir definitivamente a estratégia “'+rule.name+'” e o placar dela? Não altera o histórico geral nem as outras regras.'))return;void run(async()=>{await apiWhite('rules/'+rule.id,'DELETE',{confirm:true});if(editing===rule.id)clearEditor();await refresh();setStatus('Estratégia excluída com sucesso.')})}
 function paintRules(){const host=$('white-saved');host.replaceChildren();const rules=data.rules||[];
  if(!rules.length){host.append(el('p','white-sub','Nenhuma regra cadastrada. Monte a primeira sequência ao lado.'));return;}
  for(const r of rules){const card=el('article','white-rule-card'),title=el('div','white-title');title.append(el('strong','',r.name),el('span',r.enabled?'white-active':'white-paused',r.enabled?'ATIVA':'PAUSADA'));card.append(title);
   const code=el('div','white-stones');code.append(el('span','white-stone '+r.before.color,`${icon(r.before.color)}${r.before.number??'•'}`),el('span','white-stone white','⚪0'),el('span','white-stone '+r.after.color,`${icon(r.after.color)}${r.after.number??'•'}`));card.append(code);
   card.append(el('p','white-sub',`+${r.increment} min · tolerância ±${r.tolerance} min · leitura automática`));
   const sc=data.scores.find(x=>x.id===r.id)||{};card.append(el('div','white-mini-score',`📍 ${sc.signals||0} sinais   ✅ ${sc.wins||0} WIN   🚫 ${sc.losses||0} LOSS   ↻ ${sc.cancelled||0} cancelados`));
   const actions=el('div','white-buttons');actions.append(make('✎ Editar',()=>editRule(r)),make(r.enabled?'⏸ Pausar':'▶ Ativar',()=>toggleRule(r),r.enabled?'pause':'activate'),make('Excluir',()=>deleteRule(r),'danger'));card.append(actions);host.append(card);
  }
 }
 function paintRuntime(){const root=$('white-runtime');root.replaceChildren();const a=data.runtime?.active;root.append(el('span','white-label',a?'TENDÊNCIA EM MONITORAMENTO':'SEM TENDÊNCIA ATIVA'));
  if(a)root.append(line(a.name,`${a.label1} ▫️ / ${a.label2} ▫️ · ±${a.tolerance} min`),el('p','white-sub',a.sequence+' · soma '+a.sum));
  else root.append(el('p','white-sub','Nova regra só será acionada quando nenhuma outra estratégia estiver ocupando o ciclo.'));
  const list=$('white-events');list.replaceChildren();const scores=data.scores||[];for(const s of scores)list.append(line(s.name,`✅ ${s.wins}   🚫 ${s.losses}   📍 ${s.signals}`));
 }
 function paintChats(){const root=$('white-chat-list');root.replaceChildren();for(const chat of data.chats||[]){const line=el('label','white-chat'),check=el('input');check.type='checkbox';check.value=String(chat.id);check.checked=data.config.chats.includes(String(chat.id));check.disabled=!chat.permitted;line.append(check,el('span','',chat.name+' · '+chat.type+(chat.permitted?'':' · sem permissão')),make('Testar',()=>void run(async()=>{await apiWhite('bot/test','POST',{chatId:String(chat.id)});setStatus('Teste enviado ao Telegram.')})));root.append(line)}
  if(!data.chats.length)root.append(el('p','white-sub','Para descobrir um chat: adicione o bot como administrador no grupo, envie /nexo_branco e toque em “Buscar grupos”. Para privado, envie /start.'));
  $('white-bot-head').textContent=data.botConfigured?'✓ Secret do bot branco configurado':'⚠️ Secret NEXO_WHITE_BOT_TOKEN ainda não configurado';$('white-bot-enabled').checked=data.config.botEnabled===true;
 }
 function paintBlocked(){const host=$('white-blocked');if(!host)return;host.replaceChildren();
  for(const b of data.blocked||[]){const row=el('div','white-blocked-item');row.append(el('strong','','⚠️ Entrega incerta · chat ••'+String(b.chatId).slice(-4)),el('small','',b.type+' · '+b.error));
   row.append(make('✓ Já conferi: desbloquear',()=>{if(!confirm('Você conferiu o Telegram? O sistema NÃO repetirá a mensagem incerta. Desbloquear apenas futuros sinais?'))return;void run(async()=>{await apiWhite('deliveries/clear','POST',{chatId:b.chatId,confirm:true});await refresh();setStatus('Chat desbloqueado sem repetir mensagens antigas.')})}));host.append(row);
  }
 }
 async function saveBot(){await run(async()=>{const chats=[...document.querySelectorAll('#white-chat-list input:checked')].map(x=>x.value);await apiWhite('config','PUT',{kind:'bot',chats,botEnabled:$('white-bot-enabled').checked});await refresh();setStatus('✓ Configuração do bot branco salva')})}
 const label={signal:'🎯 SINAL LOCALIZADO',attention:'⚠️ ATENTOS',win:'✅ WIN BRANCO',loss:'🚫 LOSS'};
 function paintTemplates(){const root=$('white-template-list');root.replaceChildren();for(const key of ['signal','attention','win','loss']){
  const conf=data.config.templates[key]||{},card=el('div','white-template-card');card.append(el('h4','',label[key]));const select=el('select','white-select');for(const [id,name] of [['text','Texto'],['sticker','Sticker'],['gif','GIF']]){const option=el('option','',name);option.value=id;select.append(option)}select.value=conf.type||'text';
  const txt=el('textarea','white-textarea');txt.rows=3;txt.value=conf.text||'';const media=el('select','white-select');const fillMedia=()=>{media.replaceChildren();const empty=el('option','','Selecione a mídia');empty.value='';media.append(empty);for(const asset of data.media.filter(x=>x.type===select.value)){const opt=el('option','',asset.name+' · '+asset.id.slice(0,6));opt.value=asset.id;media.append(opt)}media.value=conf.mediaId||'';txt.hidden=select.value!=='text';media.hidden=select.value==='text';};select.addEventListener('change',fillMedia);fillMedia();
  const row=el('div','white-buttons');row.append(select,make('💾 Salvar '+label[key],()=>void run(async()=>{await apiWhite('config','PUT',{kind:'template',event:key,template:{type:select.value,text:txt.value,mediaId:media.value}});await refresh();setStatus('Modelo salvo: '+label[key])})));card.append(row,txt,media);root.append(card);
 }}
 async function refresh(){if(!$('white-dashboard'))return;const res=await apiWhite('overview');data=res;paintRules();paintRuntime();paintChats();paintBlocked();paintTemplates();$('white-info').textContent=`${data.rules.filter(x=>x.enabled).length} regra(s) ativa(s) · ${data.config.botEnabled?'BOT LIGADO':'BOT DESLIGADO'} · fonte com precisão de minuto`;
  lastOpen=Date.now();
 }
 function init(){panels();
  if(typeof page==='function'){const previous=page;page=function(name){previous(name);if(name==='branco-minuto')void run(refresh)}}
  if(location.hash==='#branco-minuto'&&!$('shell')?.hidden)void run(refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash==='#branco-minuto')void run(refresh)});
  setInterval(()=>{if(!document.hidden&&location.hash==='#branco-minuto'&&!busy&&Date.now()-lastOpen>15000&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))void run(refresh)},5000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
