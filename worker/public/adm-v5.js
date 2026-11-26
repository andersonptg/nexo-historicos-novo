// NEXO_BRANCO_V11_UNIFICADO
/* NEXO V5 | interface administrativa renovada, sem tokens no navegador. */
'use strict';
(() => {
  const UI_VERSION = '5.0';
  const emoji = {
    attention: '🚨', entry_black: '⚫', entry_red: '🔴',
    gale1: '↪️', gale2: '↪️', win_black: '✅',
    win_red: '✅', win_white: '⚪', red: '❌'
  };
  const mediaLabel = {sticker: 'Sticker', gif: 'GIF'};
  const get = id => document.getElementById(id);
  let mediaFilter = 'all', mediaQuery = '', refreshing = false, selectingGroups = false;
  let status = null, lastSnapshot = '';
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  let videoObserver;
  function safeMediaImage(a) {
    const url = '/api/adm/media/' + encodeURIComponent(a.id);
    const movie = a.kind === 'gif' && (a.origin === 'telegram' || a.mime === 'video/mp4' || a.mime === 'video/webm');
    if (movie) {
      const video = el('video','v5-media-video');
      video.muted = true;video.loop = true;video.autoplay = true;video.playsInline = true;
      video.preload = 'none';video.setAttribute('aria-label',a.name);
      video.dataset.src = url + '?motion=1';
      video.onerror = () => {
        const fallback=el('img','v5-media-img');fallback.alt=a.name;fallback.loading='lazy';fallback.src=url;
        fallback.onerror=()=>fallback.replaceWith(el('div','v5-empty-visual','▣ GIF'));
        video.replaceWith(fallback);
      };
      if(videoObserver)videoObserver.observe(video);
      else video.src=video.dataset.src;
      return video;
    }
    const img=el('img','v5-media-img');img.alt=`${mediaLabel[a.kind]||'Mídia'}: ${a.name}`;
    img.loading='lazy';img.src=url+(a.kind==='gif'?'?motion=1':'');
    img.onerror=()=>img.replaceWith(el('div','v5-empty-visual',a.kind==='gif'?'▣ GIF':'◇ STICKER'));
    return img;
  }
  function empty(title, subtitle) {
    const x = el('div','v5-empty');
    x.append(el('strong','',title),el('p','',subtitle));
    return x;
  }
  function createMobileNav() {
    if (get('v5-dock')) return;
    const dock = el('nav','v5-dock');
    dock.id = 'v5-dock';
    for (const [id,icon,label] of [
      ['geral','⌂','Início'], ['branco','⚪','Branco VIP'], ['estrategias','◇','Regras'],
      ['midias','▣','Mídias'],
      ['telegram','➤','Robô']
    ]) {
      if (id==='branco') { const a=el('a','v5-dock-item');a.href='/branco-vip.html';a.append(el('span','v5-dock-icon',icon),el('span','',label));dock.append(a);continue; }
      const b = el('button','v5-dock-item');
      b.type = 'button';b.dataset.v5Page = id;
      b.append(el('span','v5-dock-icon',icon),el('span','',label));
      b.addEventListener('click', () => page(id));
      dock.append(b);
    }
    get('shell').append(dock);
    const overlay = el('button','v5-backdrop');
    overlay.id='v5-backdrop';overlay.type='button';overlay.ariaLabel='Fechar menu';
    overlay.addEventListener('click', () => get('sidebar')?.classList.remove('open'));
    get('shell').append(overlay);
    const eye = get('menu');
    if(eye)eye.onclick=()=>{
      const open=get('sidebar').classList.toggle('open');
      document.body.classList.toggle('v5-menu-open',open);
    };
    overlay.addEventListener('click',()=>document.body.classList.remove('v5-menu-open'));
  }
  function createHeaders() {
    document.title = 'NEXO Control • ADM V5';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#090d19');
    document.querySelectorAll('.brand small').forEach(x => x.textContent='CONTROL CENTER V5');
    const head = get('page-geral')?.querySelector('.pagehead');
    if (head && !get('v5-hero')) {
      const hero = el('div','v5-hero');hero.id='v5-hero';
      hero.append(el('div','v5-kicker','◉ CENTRAL OPERACIONAL'),el('h2','','Tudo sob seu controle.'),
        el('p','','Regras, sinais, mídias e grupos em um único lugar. A automação só envia sinais após sua autorização.'));
      head.before(hero);
    }
    const info = get('page-mensagens')?.querySelector('.pagehead p:not(.eyebrow)');
    if(info)info.textContent='Escolha a estratégia e o evento. Visualize o GIF ou sticker e salve o que será enviado.';
    const title = get('page-midias')?.querySelector('.pagehead h1');
    if(title)title.textContent='Biblioteca visual';
    const detail = get('page-midias')?.querySelector('.pagehead p:not(.eyebrow)');
    if(detail)detail.textContent='Envie ao privado do seu bot vinculado. Os stickers e GIFs aparecem aqui automaticamente.';
    const telegramText = get('page-telegram')?.querySelector('.pagehead p:not(.eyebrow)');
    if(telegramText)telegramText.textContent='Cadastre seu token uma vez. O NEXO detecta grupos pelos eventos recebidos e atualiza a lista automaticamente.';
    const hint = get('page-telegram')?.querySelector('#group-list')?.previousElementSibling;
    // The status box below explains the webhook limitation without false promises.
    if(hint?.tagName === 'DIV' && hint.classList.contains('actions')){};
    const top = get('top-title');if(top)top.textContent='CONTROLE';
  }
  function createMediaTools() {
    const list = get('media-list');if(!list || get('v5-media-toolbar'))return;
    const box = el('div','v5-media-toolbar');box.id='v5-media-toolbar';
    const count = el('span','v5-media-total','0 arquivos');count.id='v5-media-total';
    const input = el('input','v5-search');input.type='search';input.placeholder='Buscar mídia...';input.setAttribute('aria-label','Buscar mídia');
    input.addEventListener('input',()=>{mediaQuery=input.value.toLowerCase().trim();renderMedia()});
    const buttons = el('div','v5-filter-tabs');
    for(const [key,label] of [['all','Todas'],['sticker','Stickers'],['gif','GIFs']]){
      const b=el('button','v5-filter',label);b.type='button';b.dataset.v5Filter=key;
      b.addEventListener('click',()=>{mediaFilter=key;renderMedia()});buttons.append(b);
    }
    box.append(count,buttons,input);list.before(box);
    const panels = get('page-midias')?.querySelectorAll(':scope > .two > .panel');
    if(panels?.length===2){panels[0].classList.add('v5-optional-upload');panels[1].classList.add('v5-primary-library');
      panels[0].querySelector('h2').textContent='Upload manual (opcional)';}
    get('refresh-media').textContent='↻ Sincronizar biblioteca';
  }
  function createSignals() {
    const pageEl=get('page-mensagens');if(!pageEl || get('v5-signal-events'))return;
    const select=get('message-event');const quick=el('div','v5-event-tabs');quick.id='v5-signal-events';
    select.closest('.panel').insertBefore(quick,select);
    const mediaSelect=get('message-asset');const gallery=el('div','v5-signal-gallery');gallery.id='v5-signal-gallery';
    mediaSelect.after(gallery);
    const legend = el('p','v5-gallery-help','Toque em uma mídia para vinculá-la ao sinal selecionado. Depois pressione SALVAR MENSAGEM.');
    gallery.after(legend);
  }
  function createTelegramStatus() {
    const pageEl=get('page-telegram');const wizard=pageEl?.querySelector('.bot-wizard');
    if(!wizard || get('v5-tg-status'))return;
    const outer=el('div','v5-tg-status');outer.id='v5-tg-status';
    outer.append(el('h2','','Conexão com o robô'),el('p','', 'Verificando token, webhook e sincronização...'));
    wizard.before(outer);
    const oldHint=get('group-list')?.parentElement?.querySelector('.hint');
    if(oldHint)oldHint.textContent='Os grupos aparecem aqui após o robô receber uma atualização deles. O Telegram não fornece lista retroativa de todos os grupos. Nenhum sinal será enviado sem sua seleção e ativação.';
    const actionButtons=get('group-list')?.parentElement?.querySelector('.actions');
    const badge=el('span','v5-auto-note','◉ Atualização automática ativada');badge.id='v5-auto-note';
    actionButtons?.after(badge);
    const tokenForm=get('bot-form');
    if(tokenForm)tokenForm.before(el('div','v5-token-help','Token do BotFather: cadastrado uma única vez. O Telegram não permite recuperar o token automaticamente.'));
    const code=get('pair-code');
    if(code && !get('v5-telegram-deeplink')){
      const link=el('a','primary inline-link v5-pair-link','➤ Vincular meu Telegram');
      link.id='v5-telegram-deeplink';link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;
      code.append(link);
    }
  }
  function signalButtons() {
    const root=get('v5-signal-events'),select=get('message-event');
    if(!root || !select)return;
    root.replaceChildren();
    for(const [code,label] of Object.entries(names)) {
      const b=el('button','v5-event-pill'+(code===select.value?' is-active':''),`${emoji[code] || '●'} ${label}`);
      b.type='button';b.title=label;
      b.addEventListener('click',()=>{select.value=code;renderMessage()});root.append(b);
    }
  }
  function mediaGallery() {
    const root=get('v5-signal-gallery');if(!root || !model)return;
    root.querySelectorAll('video.v5-media-video').forEach(v=>{videoObserver?.unobserve(v);v.pause()});
    root.replaceChildren();
    const selectedID=get('message-asset').value;
    const none=el('button','v5-select-media'+(!selectedID?' is-active':''));none.type='button';
    none.append(el('div','v5-select-media-icon','∅'),el('small','','Sem mídia'));
    none.addEventListener('click',()=>selectMedia(null));root.append(none);
    if(!model.media.length){root.append(empty('Nenhuma mídia recebida','Envie um sticker ou GIF ao privado do robô vinculado.'));return}
    for(const a of [...model.media].reverse()) {
      const card=el('button','v5-select-media'+(a.id===selectedID?' is-active':''));card.type='button';
      card.append(safeMediaImage(a),el('span','v5-media-mini',a.kind.toUpperCase()),el('small','',a.name));
      card.addEventListener('click',()=>selectMedia(a));root.append(card);
    }
  }
  function selectMedia(asset){
    const type=get('message-type'),options=get('message-asset');
    type.value=asset?.kind||'text';
    options.replaceChildren();option(options,'','Sem mídia');
    for (const a of model.media.filter(x=>x.kind===type.value))option(options,a.id,a.name);
    options.value=asset?.id||'';
    updatePreview();mediaGallery();
  }
  function assignMediaToEvent(asset){
    const overlay=el('div','v5-dialog-overlay');overlay.id='v5-media-dialog';
    const dialog=el('div','v5-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    dialog.append(el('div','v5-section-tag','▣ BIBLIOTECA → SINAIS'),el('h2','','Onde usar esta mídia?'),
      el('p','','Selecione o tipo de evento. Depois confira a prévia e salve a mensagem.'));
    const grid=el('div','v5-dialog-events');
    for(const [id,label] of Object.entries(names)){
      const b=el('button','v5-event-pill',`${emoji[id]||'●'} ${label}`);b.type='button';
      b.addEventListener('click',()=>{
        overlay.remove();page('mensagens');get('message-event').value=id;renderMessage();selectMedia(asset);
        pop('Mídia escolhida para '+label+'. Pressione SALVAR MENSAGEM.');
      });grid.append(b);
    }
    dialog.append(grid);
    const close=el('button','outline','Cancelar');close.type='button';close.addEventListener('click',()=>overlay.remove());dialog.append(close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
    overlay.append(dialog);document.body.append(overlay);
    close.focus();
  }
  function bindOverrides() {
    const renderMediaOriginal=renderMedia;
    renderMedia=function() {
      if(!model)return;
      const root=get('media-list');
      root.querySelectorAll('video.v5-media-video').forEach(v=>{videoObserver?.unobserve(v);v.pause()});
      root.replaceChildren();
      const count=get('v5-media-total');if(count)count.textContent=`${model.media.length} ${model.media.length===1?'arquivo':'arquivos'} • Telegram + R2`;
      document.querySelectorAll('.v5-filter').forEach(b=>b.classList.toggle('is-active',b.dataset.v5Filter===mediaFilter));
      const items=[...model.media].reverse().filter(a=>(mediaFilter==='all'||a.kind===mediaFilter)&&(!mediaQuery||a.name.toLowerCase().includes(mediaQuery)));
      if(!items.length){root.append(empty('Nada por aqui',model.media.length?'Nenhuma mídia corresponde ao filtro.':'Envie uma mídia para seu bot no privado e aguarde a sincronização.'));return}
      for(const a of items){
        const card=el('article','v5-media-card');const visual=el('div','v5-card-visual');visual.append(safeMediaImage(a));
        const type=el('span','v5-kind '+(a.kind==='gif'?'is-gif':''),a.kind==='gif'?'GIF':'STICKER');visual.append(type);
        const body=el('div','v5-media-card-body');
        body.append(el('strong','',a.name),el('small','',a.origin==='telegram'?'Recebido do Telegram':'Arquivo salvo no R2'));
        const btn=el('button','v5-assign','Usar em um sinal');btn.type='button';
        btn.addEventListener('click',()=>assignMediaToEvent(a));
        body.append(btn);card.append(visual,body);root.append(card);
      }
    };
    const renderMessageOriginal=renderMessage;
    renderMessage=function(){renderMessageOriginal();signalButtons();mediaGallery()};
    const previewOriginal=updatePreview;
    updatePreview=function(){
      previewOriginal();const box=get('chat-preview-media');
      if(!box || box.hidden || !model)return;
      const a=model.media.find(x=>x.id===get('message-asset').value);
      box.querySelectorAll('video.v5-media-video').forEach(v=>{videoObserver?.unobserve(v);v.pause()});
      box.replaceChildren();
      if(a){box.append(safeMediaImage(a),el('span','',a.name))}
      else box.append(el('span','','Escolha um sticker ou GIF na galeria.'));
    };
    const groupsOriginal=renderGroups;
    renderGroups=function(){groupsOriginal();
      const root=get('group-list');if(!model.groups.length){root.replaceChildren(empty('Nenhum grupo detectado ainda','Depois de conectar o bot, novas atividades dos grupos aparecerão aqui automaticamente.'))}
      for(const row of root.querySelectorAll('.entry'))row.classList.add('v5-group-row');
    };
    const pageOriginal=page;
    page=function(id){pageOriginal(id);syncDock();if(id==='midias'||id==='telegram')void refreshLive()};
    const reloadOriginal=reload;
    reload=async function(){await reloadOriginal();syncDock();void refreshStatus()};
    const countersOriginal=counters;
    counters=function(){countersOriginal();const label=get('badge-engine');if(label)label.textContent='R2 conectado • NEXO V24'};
  }
  function syncDock(){
    const active=location.hash.slice(1)||'geral';
    document.querySelectorAll('[data-v5-page]').forEach(b=>b.classList.toggle('is-active',b.dataset.v5Page===active));
    document.body.classList.remove('v5-menu-open');
    get('sidebar')?.classList.remove('open');
  }
  function renderStatus() {
    const box=get('v5-tg-status');if(!box)return;
    box.replaceChildren();
    const name=status?.configured?('@'+(status.botName||'Robô cadastrado')):'Robô não cadastrado';
    const connected=status?.webhook==='connected';
    const pills=el('div','v5-status-grid');
    const states=[
      ['🤖','Robô',name,status?.configured?'ok':'warn'],
      ['🔗','Telegram',connected?'Webhook conectado':status?.webhook==='foreign'?'Ligado a outro sistema':status?.webhook==='error'?'Não foi possível verificar':status?.configured?'Aguardando conexão':'Aguardando token',connected?'ok':'warn'],
      ['🖼','Biblioteca',String(model?.media?.length||0)+' mídias',model?.media?.length?'ok':'muted'],
      ['👥','Grupos',String(model?.groups?.length||0)+' detectados',model?.groups?.length?'ok':'muted']
    ];
    for(const [icon,title,value,state] of states){const item=el('div','v5-status-item '+state);item.append(el('span','v5-status-icon',icon),el('small','',title),el('strong','',value));pills.append(item)}
    box.append(el('div','v5-section-tag','◉ SINCRONIZAÇÃO TELEGRAM'),pills);
    const note=el('p','v5-status-note');
    if(!status?.configured)note.textContent='Cadastre seu token uma única vez para começar. Depois vincule seu privado para receber e importar mídias.';
    else if(status.webhook==='foreign')note.textContent='Este robô usa o webhook de outro sistema. O NEXO não vai tomar seu lugar automaticamente. Para importar mídias e grupos aqui, será necessário transferir o webhook de forma planejada ou usar outro bot.';
    else if(status.webhook==='connected')note.textContent='Eventos do bot chegando pelo webhook. Stickers e GIFs enviados pelo administrador vinculado serão incorporados automaticamente; grupos surgem quando o Telegram envia atualizações deles.';
    else note.textContent='Bot cadastrado, mas o recebimento automático ainda depende de um webhook ativo e da vinculação do administrador.';
    box.append(note);
  }
  async function refreshStatus(){
    if(!model)return;
    try{status=await api('telegram/status');renderStatus()}
    catch(e){status={configured:!!model.telegramConfigured,botName:model.botName||'',webhook:'error'};renderStatus()}
  }
  function syncMessageOptions(){
    if(!model)return;const sel=get('message-asset'),type=get('message-type');
    if(!sel||!type)return;
    const previous=sel.value;
    sel.replaceChildren();option(sel,'','Sem mídia');
    model.media.filter(x=>x.kind===type.value).forEach(a=>option(sel,a.id,a.name));
    if([...sel.options].some(x=>x.value===previous))sel.value=previous;
    mediaGallery();
  }
  async function refreshLive(){
    if(refreshing||!model||document.hidden||get('shell').hidden)return;
    refreshing=true;
    try {
      const result=await Promise.allSettled([api('media'),api('groups')]);
      let changed=false;
      if(result[0].status==='fulfilled'){
        const items=result[0].value.items||[];
        if(JSON.stringify(items.map(x=>x.id))!==JSON.stringify(model.media.map(x=>x.id))){model.media=items;changed=true;renderMedia();syncMessageOptions();}
      }
      if(result[1].status==='fulfilled'&&!selectingGroups){
        const groups=result[1].value.groups||[];
        if(JSON.stringify(groups)!==JSON.stringify(model.groups)){model.groups=groups;changed=true;renderGroups();}
      }
      if(changed){counters();renderStatus();}
    }catch(_){/* API unavailable; keep last known state */}
    finally{refreshing=false}
  }
  function attachAutoRefresh(){
    const pairButton=get('generate-pair');
    if(pairButton)pairButton.onclick=()=>call(async()=>{
      const x=await api('bot/pair',{method:'POST'});
      get('pair-code').hidden=false;
      get('pair-command').textContent=x.command;
      const direct=get('v5-telegram-deeplink');
      const username=model?.botName;
      const code=x.command.split(' ')[1];
      if(direct&&username&&code){direct.href='https://t.me/'+encodeURIComponent(username)+'?start=vincular_'+encodeURIComponent(code);direct.hidden=false}
      else if(direct)direct.hidden=true;
      pop('Abra seu robô pelo botão de vinculação. O Telegram pedirá para iniciar a conversa.');
    });
    get('message-type')?.addEventListener('change',()=>mediaGallery());
    get('message-asset')?.addEventListener('change',()=>mediaGallery());
    get('message-event')?.addEventListener('change',()=>signalButtons());
    get('group-list')?.addEventListener('change',async event=>{
      const target=event.target;
      if(!(target instanceof HTMLInputElement)||!target.matches('[data-group-id]'))return;
      if(selectingGroups)return;
      selectingGroups=true;
      const ids=[...get('group-list').querySelectorAll('input[data-group-id]:checked')].map(x=>x.dataset.groupId);
      try{
        const data=await api('groups/selection',payload('PUT',{ids}));
        model.groups=data.groups;renderGroups();counters();pop('Destino salvo automaticamente.');
      }catch(e){pop(e.message,true);try{const x=await api('groups');model.groups=x.groups;renderGroups()}catch(_){}}
      finally{selectingGroups=false}
    });
    get('refresh-media')?.addEventListener('click',()=>void refreshLive());
    get('refresh-groups')?.addEventListener('click',()=>void refreshLive());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refreshLive();void refreshStatus()}});
    setInterval(()=>{if(!document.hidden&&model&&!get('shell').hidden)void refreshLive()},16000);
    setInterval(()=>{if(!document.hidden&&model&&!get('shell').hidden)void refreshStatus()},60000);
  }
  function initV5(){
    if(!get('shell')||typeof renderMessage!=='function')return;
    if('IntersectionObserver' in window)videoObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){const video=entry.target;
        if(entry.isIntersecting){if(!video.src)video.src=video.dataset.src;video.play().catch(()=>{});}
        else video.pause();
      }
    },{rootMargin:'80px'});
    createMobileNav();createHeaders();createMediaTools();createSignals();createTelegramStatus();
    bindOverrides();attachAutoRefresh();syncDock();
    // Existing V4 init() runs in the previous deferred script. V5 only extends UI.
    const mediaPage=get('page-midias');mediaPage?.classList.add('v5-media-page');
    document.body.classList.add('v5-ready');
    if(model){renderMedia();renderMessage();renderGroups();void refreshStatus();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initV5,{once:true});
  else initV5();
})();
