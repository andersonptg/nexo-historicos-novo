/* NEXO V7 - mensagens globais; preserva editor, coleta, bot e R2. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const evs = [
    ['entry_black','Entrada PRETO + BRANCO','🎯','entry'],
    ['entry_red','Entrada VERMELHO + BRANCO','🎯','entry'],
    ['green','GREEN (WIN)','✅','green'],
    ['white','BRANCO (WIN)','⚪','white'],
    ['red','RED (LOSS)','❌','red'],
    ['attention','ATENÇÃO · possível sinal','🚨','attention'],
    ['bot_on','BOT ATIVADO','🤖','bot']
  ];
  const defaultTemplates = {
    entry_black:{text:'🎯 ENTRAR PRETO ⚫ E BRANCO ⚪\n- - - - ATÉ GALE {limite_gale} - - - -\n🤖 NEXO DOUBLE PRO 🤖',type:'text',assetId:''},
    entry_red:{text:'🎯 ENTRAR VERMELHO 🔴 E BRANCO ⚪\n- - - - ATÉ GALE {limite_gale} - - - -\n🤖 NEXO DOUBLE PRO 🤖',type:'text',assetId:''},
    green:{text:'✅ WIN NO {pedra}',type:'text',assetId:''},
    white:{text:'✅ WIN NO BRANCO — ⚪ {numero}',type:'text',assetId:''},
    red:{text:'❌ RED — não bateu até o Gale {limite_gale}',type:'text',assetId:''},
    attention:{text:'🚨 ATENÇÃO — possível sinal\n🤖 NEXO DOUBLE PRO',type:'text',assetId:''},
    bot_on:{text:'🤖 NEXO DOUBLE PRO ATIVADO',type:'text',assetId:''},
    gale1:{text:'- - - - GALE 1 - - - -',type:'text',assetId:''},
    gale2:{text:'- - - - GALE 2 - - - -',type:'text',assetId:''}
  };
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  const button=(label,cls,cb)=>{const b=el('button',cls,label);b.type='button';b.addEventListener('click',cb);return b;};
  let loaded=false, loading=false, doc=null, timer, busy=false;
  const draft={}; const saved={};
  const schema = data=>({
    registration:{enabled:data?.registration?.enabled===true,url:data?.registration?.url||'',label:data?.registration?.label||'🔗 CADASTRE-SE'},
    templates:{...defaultTemplates,...data?.templates}
  });
  function previewText(template) {
    const s=model?.strategies?.find(x=>x.id===selected)||model?.strategies?.[0];
    const gale=String(s?.maxGale??2);
    return String(template||'').replace(/\{(pedra|quadrado|quadrado_espaco|numero|cor|gale|limite_gale|estrategia|hora|data)\}/g,(_,k)=>({pedra:'⚫8',quadrado:'⬛8',quadrado_espaco:'⬛ 8',numero:'11',cor:'PRETO',gale:'1',limite_gale:gale,estrategia:s?.name||'Estratégia 1',hora:'18:30',data:'14/11/2026'})[k]);
  }
  function makeImg(asset,cls='') {
    if(!asset)return el('div','v7-empty-preview','Nenhuma mídia selecionada');
    const wrap=el('div','v7-preview-media '+cls);
    const img=el('img');img.src='/api/adm/media/'+encodeURIComponent(asset.id);img.loading='lazy';img.alt='Prévia de '+asset.name;
    img.onerror=()=>{img.remove();wrap.textContent='Prévia indisponível';};wrap.append(img);
    return wrap;
  }
  function stateFor(key){return draft[key]||(draft[key]={...defaultTemplates[key]});}
  function panel(title,tag='section',cls=''){const e=el(tag,'v7-panel '+cls);e.append(el('h2','',title));return e;}
  function status(msg,bad=false){const out=$('v7-status');if(out){out.textContent=msg;out.classList.toggle('v7-error',bad);}if(typeof pop==='function')pop(msg,bad);}
  function setDirty(key,yes=true){const b=$('v7-save-'+key);if(b){b.textContent=yes?'Salvar '+labelFor(key)+' • alterações':'Salvar '+labelFor(key);b.classList.toggle('v7-dirty',yes)}}
  function labelFor(key){return ({entry_black:'PRETO',entry_red:'VERMELHO',green:'GREEN',white:'BRANCO',red:'RED',attention:'ATENÇÃO',bot_on:'BOT',gale1:'GALE 1',gale2:'GALE 2'})[key]||key;}
  function buildPage(){
    if($('v7-global-messages'))return;
    const pageEl=$('page-mensagens');if(!pageEl)return;
    pageEl.classList.add('v7-messages-page');
    const container=el('div','v7-shell');container.id='v7-global-messages';
    const head=el('div','v7-head');head.append(el('div','v7-icon','➤'));
    const words=el('div');words.append(el('span','v7-kicker','COMUNICAÇÃO TELEGRAM • PADRÃO GLOBAL'),el('h1','','Mensagens dos sinais'),el('p','','Configure uma vez para todas as estratégias atuais e futuras. Cada evento tem sua própria mídia, texto e botão Salvar.'));
    head.append(words,el('span','v7-head-badge','✓ TODAS AS ESTRATÉGIAS'));container.append(head);
    const link=panel('🔗 Link de cadastro — mensagem separada','section','v7-link');
    const linkgrid=el('div','v7-link-grid');
    const urlfield=el('label');urlfield.textContent='Endereço HTTPS';const url=el('input');url.type='url';url.id='v7-link-url';url.placeholder='https://seusite.com/cadastro';url.autocomplete='url';urlfield.append(url);
    const namefield=el('label');namefield.textContent='Texto do botão';const name=el('input');name.id='v7-link-label';name.placeholder='🔗 CADASTRE-SE';name.maxLength=80;namefield.append(name);
    const enabled=el('label','v7-toggle');const on=el('input');on.type='checkbox';on.id='v7-link-enabled';enabled.append(on,el('span','','Enviar após WIN/RED, em mensagem separada e nunca no texto da entrada.'));
    const saveLink=button('Salvar link global','v7-action v7-primary',()=>void saveRegistration());saveLink.id='v7-link-save';
    linkgrid.append(urlfield,namefield,enabled,saveLink);link.append(linkgrid);container.append(link);
    const nav=panel('Configuração individual por evento','section','v7-section-nav');
    const tags=el('div','v7-events');for(const [key,title,emoji] of evs){const b=button(emoji+' '+title,'v7-chip',()=>{$('v7-card-'+key)?.scrollIntoView({behavior:'smooth',block:'center'});document.querySelectorAll('.v7-chip').forEach(v=>v.classList.toggle('active',v===b))});b.dataset.event=key;tags.append(b)}nav.append(tags);container.append(nav);
    const list=el('div','v7-list');list.id='v7-list';for(const [key,title,emoji,kind] of evs)list.append(makeCard(key,title,emoji,kind));container.append(list);
    const gales=panel('↪️ GALE 1 e GALE 2 — sempre em texto','section','v7-gales');
    gales.append(el('p','v7-help','As mensagens dos gales são editáveis e independentes dos stickers/GIFs.'));
    for(const key of ['gale1','gale2']){
      const row=el('div','v7-gale-row');const label=el('label','',labelFor(key));
      const field=el('textarea');field.rows=2;field.maxLength=1500;field.id='v7-text-'+key;field.addEventListener('input',()=>{stateFor(key).text=field.value;setDirty(key)});
      const save=button('Salvar '+labelFor(key),'v7-action v7-primary',()=>void saveEvent(key));save.id='v7-save-'+key;
      row.append(label,field,save);gales.append(row);
    }
    container.append(gales);
    const preview=panel('➤ Prévia no Telegram','section','v7-preview-pane');
    preview.append(el('p','v7-help','Simulação local; não envia mensagens ao grupo ou ao bot.'));
    const feed=el('div','v7-chat');feed.id='v7-chat';preview.append(feed);
    container.append(preview);
    const notice=el('div','v7-footer');notice.id='v7-status';notice.textContent='Nenhum envio será ativado por esta atualização.';container.append(notice);
    pageEl.append(container);
    // O formulário antigo continua no DOM para preservar o painel V6, mas não duplica controles na tela.
    const oldHeader=pageEl.querySelector(':scope > .pagehead');if(oldHeader)oldHeader.hidden=true;
    const oldBody=pageEl.querySelector(':scope > .two');if(oldBody)oldBody.hidden=true;
  }
  function makeCard(key,title,emoji,kind){
    const card=el('article','v7-event-card '+kind);card.id='v7-card-'+key;
    const top=el('div','v7-card-head');top.append(el('span','v7-card-icon',emoji));
    const intro=el('div');intro.append(el('h3','',title),el('p','',key==='bot_on'?'Enviada somente ao ativar o robô manualmente.':key==='attention'?'Aviso antes de uma possível entrada.':key==='green'?'WIN PRETO ou VERMELHO; inclui pedra sorteada.':key==='white'?'Resultado branco separado do GREEN.':key==='red'?'Derrota após o Gale máximo.':key.startsWith('entry')?'Texto do alvo da estratégia, com Gale configurado.':'Configuração global.'));
    top.append(intro);const badge=el('span','v7-save-indicator','Não salvo');badge.id='v7-badge-'+key;top.append(badge);card.append(top);
    const row=el('div','v7-card-grid');
    const left=el('div','v7-edit');const selector=el('div','v7-type-tabs');selector.id='v7-types-'+key;
    for(const [type,label] of [['sticker','Sticker'],['text','Texto'],['gif','GIF']]){
      selector.append(button(label,'v7-type',()=>{stateFor(key).type=type;if(type==='text')stateFor(key).assetId='';else{const selectedAsset=model?.media?.find(x=>x.id===stateFor(key).assetId);if(selectedAsset?.kind!==type)stateFor(key).assetId='';}paintCard(key);setDirty(key);renderPreview();}));
    }
    left.append(el('label','v7-label','Formato exclusivo de envio'),selector);
    const textlabel=el('label','v7-label','Mensagem personalizada • editável');const txt=el('textarea');txt.id='v7-text-'+key;txt.rows=3;txt.maxLength=1500;txt.placeholder='Texto que será enviado no Telegram';
    txt.addEventListener('input',()=>{stateFor(key).text=txt.value;setDirty(key);renderPreview()});left.append(textlabel,txt);
    const right=el('div','v7-media-picker');
    const label=el('label','v7-label','Mídia vinculada ao evento');right.append(label);
    const show=el('div','v7-media-selected');show.id='v7-selected-'+key;right.append(show);
    const selectorBtn=button('Escolher na biblioteca','v7-action v7-secondary',()=>openPicker(key));selectorBtn.id='v7-choose-'+key;right.append(selectorBtn);
    const removeBtn=button('Retirar mídia','v7-action v7-subtle',()=>{stateFor(key).assetId='';paintCard(key);setDirty(key);renderPreview()});removeBtn.id='v7-remove-'+key;right.append(removeBtn);
     const attach=el('label','v11-control');const toggle=el('input');toggle.type='checkbox';toggle.id='v11-attach-'+key;toggle.checked=true;toggle.addEventListener('change',()=>{stateFor(key).sendWithMedia=toggle.checked;setDirty(key);renderPreview()});attach.append(toggle,el('span','','Enviar sticker/GIF junto com esta mensagem'));left.append(attach);
     row.append(left,right);card.append(row);
    const save=button('Salvar '+labelFor(key),'v7-action v7-primary v7-save',()=>void saveEvent(key));save.id='v7-save-'+key;card.append(save);
    return card;
  }
  function paintCard(key){
    const val=stateFor(key);const text=$('v7-text-'+key);if(text&&text.value!==val.text)text.value=val.text||'';
    document.querySelectorAll('#v7-types-'+key+' .v7-type').forEach((b,i)=>b.classList.toggle('active',['sticker','text','gif'][i]===val.type));
    const visual=$('v7-selected-'+key);if(visual){visual.replaceChildren();const asset=model?.media?.find(x=>x.id===val.assetId&&x.kind===val.type);visual.append(makeImg(asset));}
     const opt=$('v11-attach-'+key);if(opt){opt.checked=val.sendWithMedia!==false;opt.disabled=val.type==='text';}
     const choose=$('v7-choose-'+key);if(choose)choose.disabled=val.type==='text';
    const remove=$('v7-remove-'+key);if(remove)remove.disabled=!val.assetId;
    const badge=$('v7-badge-'+key);if(badge){badge.textContent=saved[key]?'✓ Salvo globalmente':'Não salvo';badge.classList.toggle('v7-saved',!!saved[key])}
  }
  function draw(){if(!doc)return;for(const k of Object.keys(defaultTemplates))paintCard(k);
    const link=doc.registration||{};$('v7-link-url').value=link.url||'';$('v7-link-label').value=link.label||'🔗 CADASTRE-SE';$('v7-link-enabled').checked=link.enabled===true;renderPreview();}
  function setDoc(config){doc=schema(config);for(const key of Object.keys(defaultTemplates)){
    const t=doc.templates[key];saved[key]=t?.saved===true;
    draft[key]={...defaultTemplates[key],...(t?.saved?t:{})};
    if(key==='gale1'||key==='gale2')draft[key].type='text';
  }draw();}
  function bubble(host,text,cls=''){if(!text)return;host.append(el('div','v7-chat-bubble '+cls,text))}
  function renderPreview(){
   const host=$('v7-chat');if(!host||!doc)return;host.replaceChildren();
   const s=model?.strategies?.find(x=>x.id===selected)||model?.strategies?.[0];
   const tone=s?.target==='red'?'🔴':'⚫';
   const step=(key)=>{
    const item=stateFor(key),asset=model?.media?.find(x=>x.id===item.assetId&&x.kind===item.type);
    if(item.type==='text')bubble(host,previewText(item.text),key.startsWith('entry')?'entry':key==='red'?'loss':'win');
    else if(asset)host.append(makeImg(asset,'v7-chat-sticker'));
    else bubble(host,'Selecione o '+(item.type==='gif'?'GIF':'sticker')+' para o evento.','attention');
   };
   step('attention');step('entry_'+(s?.target==='red'?'red':'black'));
   step('gale1');step('gale2');step('green');
   const enabled=$('v12-stone-enabled');
   if(!enabled||enabled.checked){
    const text=$('v12-stone-text')?.value||'🎲 Pedra sorteada: {quadrado_espaco}';
    const rendered=previewText(text).replace(/\{quadrado_espaco\}/g,'⬛ 8').replace(/\{quadrado\}/g,'⬛8').replace(/\{pedra\}/g,'⚫8');
    bubble(host,rendered,'stone');
   }
   if($('v7-link-enabled')?.checked&&$('v7-link-url')?.value){
    try{const u=new URL($('v7-link-url').value);if(u.protocol==='https:'){
      const link=el('a','v7-chat-link',$('v7-link-label').value||'🔗 CADASTRE-SE');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';host.append(link);
    }}catch{}
   }
   host.append(el('small','v7-preview-disclaimer','Prévia: cada evento utiliza TEXTO OU STICKER OU GIF. GALE 1/2 só aparece quando necessário.'));
  }
  window.NEXO_V12_PREVIEW=renderPreview;
  function openPicker(key){
    if($('v7-picker'))$('v7-picker').remove();
    const template=stateFor(key);if(template.type==='text')return;
    const overlay=el('div','v7-picker-overlay');overlay.id='v7-picker';overlay.setAttribute('role','presentation');
    const pane=el('div','v7-picker');pane.setAttribute('role','dialog');pane.setAttribute('aria-modal','true');pane.setAttribute('aria-label','Selecionar mídia');
    const top=el('div','v7-picker-head');top.append(el('h3','','Biblioteca • '+labelFor(key)),button('✕ Fechar','v7-action v7-secondary',()=>overlay.remove()));pane.append(top);
    pane.append(el('p','v7-help','Stickers e GIFs recebidos no privado do bot aparecem aqui sem duplicar os arquivos já conhecidos.'));
    const search=el('input');search.type='search';search.placeholder='Buscar mídia pelo nome';pane.append(search);
    const gallery=el('div','v7-library');
    const refresh=button('↻ Atualizar biblioteca','v7-action v7-secondary',async()=>{try{const ans=await api('media');if(model)model.media=ans.items||[];drawGallery();status('Biblioteca atualizada.')}catch(e){status(e.message,true)}});pane.append(refresh,gallery);
    function drawGallery(){gallery.replaceChildren();const assets=(model?.media||[]).filter(x=>x.kind===template.type&&(x.name||'').toLowerCase().includes(search.value.toLowerCase()));
      if(!assets.length){gallery.append(el('p','v7-help','Nenhuma mídia desse tipo. Envie um sticker ou GIF ao privado do robô vinculado.'));return}
      for(const asset of [...assets].reverse()){
        const b=button('','v7-library-item',()=>{stateFor(key).assetId=asset.id;overlay.remove();paintCard(key);setDirty(key);renderPreview();});
        b.append(makeImg(asset),el('small','',asset.name||asset.kind));gallery.append(b);
      }
    }
    search.addEventListener('input',drawGallery);drawGallery();overlay.append(pane);
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
    document.body.append(overlay);search.focus();
  }
  async function refreshGlobal(force=false){if(loading||!model||$('shell').hidden)return;
    if(loaded&&!force)return;
    loading=true;
    try{const data=await api('global-signals');setDoc(data.config);loaded=true;}
    catch(e){status('Erro carregando mensagens globais: '+e.message,true)}finally{loading=false;}
  }
  async function saveEvent(key){if(busy)return;
    const item=stateFor(key);
    if(item.type!=='text'&&!model?.media?.some(a=>a.id===item.assetId&&a.kind===item.type)){status('Escolha um '+item.type+' válido na biblioteca antes de salvar.',true);return;}
    busy=true;
    try{
      const data=await api('global-signals',payload('PUT',{mode:'event',key,template:{text:item.text||'',type:item.type,assetId:item.assetId||'',sendWithMedia:item.sendWithMedia!==false}}));
      doc=schema(data.config);saved[key]=true;draft[key]={...item};paintCard(key);setDirty(key,false);status(labelFor(key)+' salvo para todas as estratégias.');
    }catch(e){status('Falha ao salvar '+labelFor(key)+': '+e.message,true)}finally{busy=false;}
  }
  async function saveRegistration(){if(busy)return;
    const url=$('v7-link-url').value.trim(),label=$('v7-link-label').value.trim()||'🔗 CADASTRE-SE',enabled=$('v7-link-enabled').checked;
    if(enabled&&!/^https:\/\/\S+$/i.test(url)){status('O link precisa começar com https://',true);return;}
    busy=true;
    try{const x=await api('global-signals',payload('PUT',{mode:'link',registration:{url,label,enabled}}));doc=schema(x.config);status('Link salvo; será enviado em mensagem separada após o resultado.');renderPreview();}
    catch(e){status('Erro ao salvar link: '+e.message,true)}finally{busy=false;}
  }
  function initialize(){if($('v7-global-messages')||!$('page-mensagens'))return;
    buildPage();
    const oldPage=page;
    page=function(name){oldPage(name);if(name==='mensagens'){void refreshGlobal();}};
    const oldReload=reload;
    reload=async function(){await oldReload();if(model&&$('page-mensagens')&&!$('page-mensagens').hidden)void refreshGlobal();};
    for(const input of ['v7-link-url','v7-link-label','v7-link-enabled'])$(input).addEventListener('input',renderPreview);
    timer=window.setInterval(async()=>{if(!loaded||!model||$('page-mensagens').hidden||document.hidden)return;try{const r=await api('media');const incoming=r.items||[];if(JSON.stringify(incoming.map(x=>x.id))!==JSON.stringify(model.media.map(x=>x.id))){model.media=incoming;for(const [key] of evs)paintCard(key);renderPreview();}}catch{}},20000);
    if(model)void refreshGlobal();
    document.body.classList.add('v7-ready');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
