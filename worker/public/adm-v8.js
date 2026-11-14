/* NEXO V8 - Central de Robô e Grupos. Sem tokens em localStorage ou URL. */
'use strict';
(() => {
  const el=(tag,cls='',txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
  const $=id=>document.getElementById(id);
  const btn=(txt,cls,fn)=>{const b=el('button',cls,txt);b.type='button';b.onclick=fn;return b};
  let ready=false,working=false,loading=false,changes=false,ownerDirty=false;
  let state={configured:false,webhook:'inactive',ownerPaired:false,botEnabled:false};
  let groups=[];
  const errorText=e=>String(e?.message||e||'Erro desconhecido');
  function say(message,failed=false){
    const status=$('v8-notice');if(status){status.textContent=message;status.classList.toggle('error',!!failed)}
    if(typeof pop==='function')pop(message,failed);
  }
  function lamp(id,status,text){const x=$(id);if(!x)return;x.textContent=text;x.dataset.state=status;}
  const getName=()=>state.botName||(typeof model!=='undefined'?model?.botName:'')||'';
  const withLock=async(fn)=>{
    if(working)return;working=true;document.querySelectorAll('#v8-control button').forEach(b=>b.disabled=true);
    try{await fn()}catch(e){say(errorText(e),true)}finally{
      working=false;document.querySelectorAll('#v8-control button').forEach(b=>b.disabled=false);
      // O botão de salvar é seguro somente com ID validado; verificado no servidor.
    }
  };
  function field(label,control,note=''){
    const box=el('label','v8-field');box.append(el('span','v8-field-label',label),control);
    if(note)box.append(el('small','v8-note',note));return box;
  }
  function make(){
    const page=$('page-telegram');if(!page||$('v8-control'))return;
    const shell=el('div','v8-shell');shell.id='v8-control';
    const head=el('header','v8-head');const leading=el('div');leading.append(el('span','v8-kicker','NEXO CONTROL V8 • CONEXÃO TELEGRAM'),el('h1','','Robô e Grupos'),el('p','','Cadastre uma vez, confirme seu ID, escolha os grupos e controle os envios em um só lugar.'));
    head.append(leading,el('span','v8-head-tag','Envios desligados por padrão'));shell.append(head);
    const dashboard=el('div','v8-status-grid');
    for(const [id,name] of [['v8-bot-state','🤖 Robô'],['v8-webhook-state','🔗 Telegram'],['v8-owner-state','🔐 Meu ID'],['v8-groups-state','👥 Grupos'],['v8-send-state','📨 Envio']]){
      const x=el('div','v8-state');x.id=id;x.dataset.state='wait';x.append(el('small','',name),el('strong','','Verificando...'));dashboard.append(x);
    }
    shell.append(dashboard);
    const setup=el('section','v8-card');setup.append(el('h2','','1 · Cadastro e vinculação'),el('p','v8-sub','O NEXO verifica o token e seu ID separadamente. O Telegram só permite confirmar sua conta quando você mandar uma mensagem ao robô.'));
    const fields=el('div','v8-form-grid');
    const token=el('input','v8-input');token.type='password';token.id='v8-token';token.autocomplete='off';token.spellcheck=false;token.placeholder='Cole o token do BotFather';
    const tokenBox=el('div','v8-field-box');tokenBox.append(field('Token do robô',token,'Salvo criptografado no R2. Não será mostrado novamente.'),btn('✓ Salvar token','v8-btn v8-main',()=>withLock(async()=>{
      const value=token.value.trim();if(!value)throw Error('Cole o token antes de salvar.');
      if(state.configured&&!confirm('Já existe um robô cadastrado. Deseja substituir o token existente? Os envios precisam estar desligados.'))return;
      const ans=await api('bot/save',payload('POST',{token:value}));token.value='';say('Robô @'+(ans.bot?.username||'Telegram')+' cadastrado. Agora confirme seu ID.');await refresh(true);
    })));
    const idInput=el('input','v8-input');idInput.id='v8-owner-id';idInput.type='text';idInput.inputMode='numeric';idInput.maxLength=20;idInput.autocomplete='off';idInput.placeholder='Seu ID numérico do Telegram';idInput.addEventListener('input',()=>{ownerDirty=true});
    const idBox=el('div','v8-field-box');idBox.append(field('Meu ID do Telegram',idInput,'A identidade é validada pela mensagem privada enviada por essa conta.'),btn('✓ Salvar ID','v8-btn v8-main',()=>withLock(async()=>{
      const id=idInput.value.trim();const d=await api('telegram/owner-id',payload('PUT',{id}));say(d.verified?'ID já verificado.':'ID salvo. Abra o bot e envie /start no privado.');ownerDirty=false;await refresh(true);
    })));
    fields.append(tokenBox,idBox);setup.append(fields);
    const steps=el('div','v8-actions');
    const open=el('a','v8-btn v8-soft','➤ Abrir meu bot');open.id='v8-open-bot';open.rel='noopener noreferrer';open.target='_blank';open.hidden=true;
    steps.append(open,btn('↻ Conferir conexão','v8-btn v8-soft',()=>withLock(async()=>{await refresh(true);say('Estado da conexão atualizado.')})),btn('🔗 Conectar Telegram','v8-btn v8-soft',()=>withLock(async()=>{
      if(!confirm('Conectar o webhook do robô a este NEXO? Um webhook de outro sistema NÃO será substituído.'))return;
      const r=await api('webhook/register',{method:'POST'});say('Webhook confirmado em '+new URL(r.webhook).hostname);await refresh(true);
    })));
    setup.append(steps);
    const hint=el('div','v8-hint');hint.id='v8-connect-help';hint.textContent='Para finalizar: cadastre o token, salve seu ID e envie /start ao robô no privado.';setup.append(hint);shell.append(setup);
    const list=el('section','v8-card');list.append(el('div','v8-row-head'));const listHead=list.firstChild;
    const groupsTitle=el('div');groupsTitle.append(el('h2','','2 · Selecionar grupos e canais'),el('p','v8-sub','O Telegram envia os grupos conforme chegam eventos. O robô precisa ser ADM para publicar.'));listHead.append(groupsTitle,btn('↻ Atualizar','v8-btn v8-soft',()=>withLock(async()=>{
      await api('groups/refresh',{method:'POST'});await refresh(true);say('Permissões e grupos existentes verificados.');
    })));
    list.append(el('div','v8-group-list'));list.lastChild.id='v8-group-list';
    const bottom=el('div','v8-group-bottom');bottom.append(el('small','','Marque os destinos (até 5) e confirme. A seleção não ativa o envio.'),btn('💾 Salvar grupos selecionados','v8-btn v8-main',()=>withLock(async()=>{
      const ids=[...document.querySelectorAll('#v8-group-list input[type="checkbox"]:checked')].map(x=>x.dataset.id);
      await api('groups/selection',payload('PUT',{ids}));changes=false;await refresh(true);say('Destinos salvos: '+ids.length+' grupo(s).');
    })));
    list.append(bottom);shell.append(list);
    const control=el('section','v8-card');control.append(el('h2','','3 · Controle de envio'),el('p','v8-sub','Ligue e desligue sem editar chaves. Seu privado verificado recebe os sinais primeiro. Grupos salvos também recebem, depois da confirmação.'));
    const toggle=el('div','v8-control-actions');toggle.append(btn('▶ Ligar robô + privado','v8-btn v8-main',()=>withLock(async()=>{
      if(!state.ownerPaired){say('Primeiro confirme seu ID: abra o privado do robô e envie /start. Depois ligue os sinais.',true);return;}
      if(!confirm('ATIVAR o robô? Primeiro ele avisará no seu privado do Telegram. Depois enviará sinais novos para seu privado e para os grupos que você selecionou. É necessário ter uma estratégia ativa.'))return;
      const x=await api('telegram/activate',payload('POST',{confirm:true}));await refresh(true);say(x.privateFirst?'Robô ligado: confira a confirmação no seu privado do Telegram.':'Robô ligado. Vincule seu ID para receber no privado.');
    })),btn('⏸ Desligar envios','v8-btn v8-stop',()=>withLock(async()=>{
      await api('telegram/deactivate',{method:'POST'});await refresh(true);say('Envios do Telegram desligados.');
    })));
    control.append(toggle,el('p','v8-warning','A biblioteca e a coleta do Termux continuam funcionando quando os sinais estão desligados.'));
    shell.append(control);
    const library=el('section','v8-card');library.append(el('h2','','4 · Stickers e GIFs automáticos'),el('p','v8-sub','Envie um sticker ou GIF no privado do bot verificado. A biblioteca identifica arquivos repetidos e deixa as mídias disponíveis nas mensagens globais.'));
    const row=el('div','v8-actions');row.append(btn('↻ Atualizar biblioteca','v8-btn v8-soft',()=>withLock(async()=>{
      const a=await api('media');if(typeof model!=='undefined'&&model)model.media=a.items||[];setLibrary(a.items||[]);say('Biblioteca atualizada.');
    })),btn('📁 Abrir mídias','v8-btn v8-soft',()=>page('midias')),btn('✉ Configurar mensagens','v8-btn v8-soft',()=>page('mensagens')));
    const mediaNote=el('div','v8-media-count','0 arquivos');mediaNote.id='v8-library-count';library.append(row,mediaNote);shell.append(library);
    const manage=el('section','v8-card v8-danger-card');manage.append(el('h2','','5 · Gerenciar ou retirar robô'),el('p','v8-sub','Desvincular seu ID não apaga o token. Remover o bot desconecta o webhook deste NEXO e desmarca os grupos; os históricos, estratégias e mídias ficam guardados.'));
    const actions=el('div','v8-actions');actions.append(btn('Desvincular meu ID','v8-btn v8-soft',()=>withLock(async()=>{
      if(!confirm('Desvincular seu ID do Telegram? Depois, será necessário confirmar um novo ID enviando /start.'))return;
      await api('telegram/owner/unlink',payload('POST',{confirm:true}));await refresh(true);say('ID desvinculado. Token preservado.');
    })),btn('✕ Remover robô do cadastro','v8-btn v8-stop',()=>withLock(async()=>{
      if(!confirm('Remover o bot cadastrado? Isso irá desconectar o webhook deste NEXO e desmarcar os grupos, mantendo históricos e mídias.'))return;
      if(!confirm('Confirma a remoção do robô? O envio deve estar desligado.'))return;
      await api('telegram/bot/remove',payload('POST',{confirm:true}));await refresh(true);say('Robô removido; dados e históricos preservados.');
    })));
    manage.append(actions);shell.append(manage);
    const notice=el('div','v8-notice','Tudo será salvo no R2; nenhum sinal será ativado sem confirmação.');notice.id='v8-notice';shell.append(notice);
    page.append(shell);
    page.classList.add('v8-enhanced');ready=true;
  }
  function setLibrary(items){$('v8-library-count').textContent=items.length+' mídia(s) no catálogo · recebidas do bot ou enviadas pelo painel';}
  function renderStatus(){
    const bot=state.configured,hook=state.webhook==='connected',owner=state.ownerPaired,sends=state.botEnabled;
    lamp('v8-bot-state',bot?'good':'bad',bot?'@'+getName():'Não cadastrado');
    lamp('v8-webhook-state',hook?'good':'bad',hook?'Webhook conectado':state.webhook==='foreign'?'Outro webhook':state.keyState==='missing'?'Segredo ausente':state.keyState==='mismatch'?'Chave incorreta':state.webhook==='error'?'Falha de conexão':'Aguardando conexão');
    lamp('v8-owner-state',owner?'good':'wait',owner?'Privado verificado · recebe primeiro':'Privado ainda não verificado');
    lamp('v8-groups-state',groups.length?'good':'wait',`${state.groupsSelected||0} salvos • ${groups.length} detectados`);
    lamp('v8-send-state',sends?'good':'wait',sends?'ENVIOS LIGADOS':'ENVIOS DESLIGADOS');
    if(!ownerDirty)$('v8-owner-id').value=state.requestedId||state.ownerId||'';
    const legacyBadge=$('badge-engine');if(legacyBadge)legacyBadge.textContent='NEXO V8 • '+(hook?'Telegram conectado':'Telegram pendente');
    const link=$('v8-open-bot'),name=getName();link.hidden=!name;
    if(name)link.href='https://t.me/'+encodeURIComponent(name);
    $('v8-connect-help').textContent=state.keyState==='missing'
       ?'O Secret NEXO_BOT_ENCRYPTION_KEY está ausente no Worker. Cadastre o segredo em Produção, sem gerar outro token.'
       :state.keyState==='mismatch'
       ?'A chave de criptografia do Worker é diferente da que protegeu o token. Restaure o Secret ORIGINAL NEXO_BOT_ENCRYPTION_KEY; não substitua o token às cegas.'
       :state.webhook==='foreign'
       ?'Este robô já está ligado a outro webhook. O NEXO não troca automaticamente para não interromper o sistema anterior.'
       :!bot?'Cadastre o token do BotFather uma vez.':!hook?'Clique em Conectar Telegram para verificar/registrar o webhook.':!owner?'Salve seu ID numérico e envie /start no privado do bot.':
         'Privado conectado! Ao ligar, a confirmação e os sinais novos chegam primeiro aqui. Selecione grupos apenas se quiser envios adicionais.';
  }
  function renderGroups(){
    const box=$('v8-group-list');if(!box)return;
    box.replaceChildren();
    if(!groups.length){box.append(el('div','v8-empty','Nenhum grupo chegou ao NEXO ainda. Coloque o bot como ADM em um grupo e envie uma mensagem ou atualização nele.'));return}
    for(const g of groups){
      const row=el('label','v8-group');const input=el('input');input.type='checkbox';input.dataset.id=g.id;
      input.checked=g.selected===true&&g.admin===true;input.disabled=!g.admin;
      input.onchange=()=>{if(box.querySelectorAll('input:checked').length>5){input.checked=false;say('Máximo de 5 grupos por enquanto.',true);return}changes=true;};
      const title=el('span','v8-group-name');title.append(el('strong','',g.name||'Grupo sem nome'),el('small','',g.type==='channel'?'Canal do Telegram':'Grupo do Telegram'));
      const state=el('span','v8-group-check '+(g.admin?'can-post':'no-post'),g.admin?'✓ Bot ADM':'Sem permissão ADM');
      row.append(input,title,state);box.append(row);
    }
  }
  async function refresh(force=false){
    if(!ready||working&&loading||loading||(!force&&document.hidden))return;
    if(!force&&$('page-telegram')?.hidden)return;
    loading=true;
    try{
      const [st,g,media]=await Promise.all([api('telegram/status'),api('groups'),api('media')]);
      state=st;groups=g.groups||[];if(typeof model!=='undefined'&&model)model.media=media.items||[];
      renderStatus();if(!changes)renderGroups();setLibrary(media.items||[]);
    }catch(e){say('Falha ao consultar o NEXO: '+errorText(e),true)}finally{loading=false}
  }
  function init(){if(ready||!$('page-telegram')||typeof api!=='function')return;make();document.title='NEXO Control • V8';
    const previous=page;
    page=function(name){previous(name);if(name==='telegram')void refresh(true)};
    const previousReload=reload;
    reload=async function(){await previousReload();if(!$('page-telegram').hidden)void refresh(true)};
    window.setInterval(()=>{if(ready&&!$('page-telegram').hidden&&!document.hidden&&!changes)void refresh()},17000);
    if(typeof model!=='undefined'&&model&&!$('page-telegram').hidden)void refresh(true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
