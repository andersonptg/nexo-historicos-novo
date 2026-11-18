/* NEXO V19 - Somente interface. Nao faz fetch, nao envia Telegram e nao modifica preferencias do servidor. */
'use strict';
(() => {
  const PREFIX = '/pedras-v19/';
  const ROOT = document.documentElement;
  const THEME_KEY = 'nexo-v19-theme';
  const TIME_KEY = 'nexo-v19-time';
  const numURL = n => PREFIX + String(n).padStart(2,'0') + '.png';
  const genericURL = color => PREFIX + 'cor_' + color + '.png';
  const numberColor = n => n===0 ? 'white' : n<=7 ? 'red' : 'black';
  const el = (tag,cls,txt) => {const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
  const safeGet = (key, defaultValue) => {try{return localStorage.getItem(key) || defaultValue}catch{return defaultValue}};
  const safeSet = (key, val) => {try{localStorage.setItem(key,val)}catch{}};
  let theme = safeGet(THEME_KEY,'dark') === 'light' ? 'light':'dark';
  let timeMode = safeGet(TIME_KEY,'minute') === 'observed' ? 'observed':'minute';
  ROOT.dataset.nexoTheme = theme;
  const changeTheme = () => {
    ROOT.dataset.nexoTheme = theme;
    document.querySelectorAll('.nexo-v19-theme-toggle').forEach(b=>{
      b.textContent = theme==='dark' ? '☀ Modo claro':'☾ Modo escuro';
      b.setAttribute('aria-label',theme==='dark'?'Ativar modo claro':'Ativar modo escuro');
      b.title='Aparência do NEXO';
      b.setAttribute('aria-pressed',theme==='light'?'true':'false');
    });
  };
  function addThemeButton(parent) {
    if(!parent || parent.querySelector('.nexo-v19-theme-toggle'))return;
    const b=el('button','nexo-v19-theme-toggle');b.type='button';
    b.addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';safeSet(THEME_KEY,theme);changeTheme()});
    parent.prepend(b);
  }
  // Blitz: 0-7 e cores sem numero desenhadas em CSS/DOM, sem PNG pesado.
  // O nome interno 'red' continua inalterado para preservar dados e estrategias.
  function blitzAsset(src){
    const assets={
      [PREFIX+'cor_red.png']:'blitz_cor_laranja_sem_numero.png',
      [PREFIX+'cor_black.png']:'blitz_cor_preto_sem_numero.png',
      [PREFIX+'cor_white.png']:'blitz_cor_branco_sem_numero.png',
      [numURL(0)]:'blitz_branco_raio.png'
    };
    for(let n=1;n<=7;n++)assets[numURL(n)]='blitz_numero_'+n+'.png';
    return assets[src]||null;
  }
  function blitzTile(filename){
    const tile=el('span','nexo-blitz-tile nexo-blitz-png');
    const img=el('img','nexo-blitz-png-img');img.src='/blitz-pedras-v4/'+filename;
    img.alt='';img.loading='lazy';img.decoding='async';img.draggable=false;
    tile.append(img);return tile;
  }
  function imageInto(host,src,description) {
    if(!host)return false;
    const asset=blitzAsset(src);
    if(asset){
      if(host.dataset.nexoBlitzAsset===src&&host.querySelector(':scope > .nexo-blitz-tile'))return false;
      host.replaceChildren(blitzTile(asset));
      host.dataset.nexoBlitzAsset=src;
      host.classList.add('nexo-v19-image-host','nexo-blitz-host');
      host.setAttribute('aria-label',description);
      return true;
    }
    if(host.querySelector(':scope > img.nexo-v19-stone-image')?.getAttribute('src')===src)return false;
    const image=el('img','nexo-v19-stone-image');
    image.src=src;image.alt=description;image.loading='lazy';image.decoding='async';image.draggable=false;
    host.replaceChildren(image);delete host.dataset.nexoBlitzAsset;
    host.classList.remove('nexo-blitz-host');host.classList.add('nexo-v19-image-host');
    return true;
  }
  function timeBR(seconds, includeSeconds=false){
    if(!Number.isFinite(Number(seconds)) || Number(seconds)<=0)return '—';
    return new Intl.DateTimeFormat('pt-BR',{
      timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',...(includeSeconds?{second:'2-digit'}:{})
    }).format(new Date(Number(seconds)*1000));
  }
  function paintHistory(){
    const root=document.getElementById('balls');if(!root)return;
    let missingSeconds=false;
    for(const cell of root.querySelectorAll(':scope > .stone')){
      const circle=cell.querySelector(':scope > .circle');if(!circle)continue;
      let n=Number(cell.dataset.nexoNumber);
      if(!Number.isInteger(n)||n<0||n>14){
        const found=cell.title.match(/N[úu]mero\s+(\d{1,2})/i);
        n=found?Number(found[1]):Number(circle.textContent.trim());
      }
      if(Number.isInteger(n)&&n>=0&&n<=14){
        cell.dataset.nexoNumber=String(n);
        // Se o ADM desligou numeros, manter o controle de privacidade visual.
        const numbersAllowed=typeof showStoneNumbers==='undefined' || showStoneNumbers!==false;
        const src=numbersAllowed?numURL(n):genericURL(numberColor(n));
        imageInto(circle,src,numbersAllowed?'Pedra '+n:'Pedra '+numberColor(n));
      }
      const label=cell.querySelector(':scope > small');if(!label)continue;
      const minute=Number(cell.dataset.nexoEpoch);
      const observed=Number(cell.dataset.nexoObserved);
      if(timeMode==='observed' && observed>1600000000){
        label.textContent=timeBR(observed,true);
        label.title='Horário da primeira detecção pelo NEXO, não o segundo oficial da rodada';
      }else{
        if(minute>0)label.textContent=timeBR(minute);
        label.title='Horário informado pela fonte (precisão de minuto)';
        if(timeMode==='observed')missingSeconds=true;
      }
    }
    const hint=document.getElementById('nexo-v19-time-hint');
    if(hint)hint.textContent=timeMode==='observed'
      ?(missingSeconds?'Segundos de detecção ainda não registrados nesses resultados; mantida a hora da fonte.':'Segundos = primeira detecção do NEXO, não da fonte.')
      :'Horário da fonte: hora e minuto. Os segundos oficiais não são fornecidos.';
  }
  function paintLatest(){
    const square=document.querySelector('#nexo-v11-now .v11-stone');if(!square)return;
    if(square.querySelector(':scope > img.nexo-v19-stone-image'))return;
    const n=Number(square.textContent.trim());
    if(Number.isInteger(n)&&n>=0&&n<=14)imageInto(square,numURL(n),'Última pedra confirmada: '+n);
  }
  function tokenFrom(node){
    const original=node.dataset.nexoToken || node.getAttribute('title') || node.textContent.trim();
    if(!original)return null;
    if(original==='*'||original==='★')return null;
    if(/^n:(\d{1,2})$/.test(original)){
      const n=Number(original.slice(2));return n>=0&&n<=14?{url:numURL(n),label:'Pedra '+n,raw:original}:null;
    }
    if(/^#(\d{1,2})$/.test(original)){const n=Number(original.slice(1));return n>=0&&n<=14?{url:numURL(n),label:'Pedra '+n,raw:original}:null;}
    if(/^\d{1,2}$/.test(original)){const n=Number(original);return n>=0&&n<=14?{url:numURL(n),label:'Pedra '+n,raw:original}:null;}
    const color=original==='🔴'?'red':original==='⚫'?'black':original==='⚪'?'white':original;
    if(['red','black','white'].includes(color))return {url:genericURL(color),label:'Cor '+color,raw:original};
    return null;
  }
  function paintTokens(){
    // Inclui regra salva, analisador, edicao da regra e vitrine antiga.
    const selector='.v17-stone,.v12-ball,#pattern-preview .pattern-pill';
    for(const node of document.querySelectorAll(selector)){
      if(node.querySelector(':scope > img.nexo-v19-stone-image')||node.querySelector(':scope > .nexo-blitz-tile'))continue;
      const token=tokenFrom(node);if(!token)continue;
      node.dataset.nexoToken=token.raw;
      node.setAttribute('aria-label',token.label);
      imageInto(node,token.url,token.label);
    }
  }
  function paintColorPalette(){
    const palette=document.getElementById('pattern-palette');if(!palette)return;
    for(const b of palette.querySelectorAll('[data-stone]')){
      const color=b.dataset.stone;
      if(color==='*'){
        const src='/blitz-pedras-v4/blitz_cor_coringa_azul_sem_numero.png';
        if(b.querySelector('img')?.getAttribute('src')===src)continue;
        const img=el('img','nexo-blitz-png-img');img.src=src;img.alt='Coringa';img.draggable=false;
        b.replaceChildren(img);b.classList.add('nexo-blitz-palette-host');
      }else if(['red','black','white'].includes(color)){
        imageInto(b,genericURL(color),'Cor '+color);
      }
    }
  }
  function paintAdminStones(){
    const root=document.getElementById('stones');if(!root)return;
    const children=Array.from(root.querySelectorAll(':scope > .stone'));
    children.forEach((node,n)=>{
      if(n>14)return;
      const numbersAllowed=document.getElementById('set-numbers')?.checked!==false;
      imageInto(node,numbersAllowed?numURL(n):genericURL(numberColor(n)),numbersAllowed?'Pedra '+n:'Cor '+numberColor(n));
    });
  }
  function addNumberPalette(){
    const palette=document.getElementById('pattern-palette');if(!palette||document.getElementById('nexo-v19-numbers'))return;
    const section=el('div','nexo-v19-numbers');section.id='nexo-v19-numbers';
    section.append(el('div','nexo-v19-numbers-caption','ADICIONAR PEDRA EXATA À SEQUÊNCIA'));
    const grid=el('div','nexo-v19-numbers-grid');
    for(let n=0;n<=14;n++){
      const b=el('button','nexo-v19-number');b.type='button';b.title='Adicionar número '+n;b.setAttribute('aria-label',b.title);
      imageInto(b,numURL(n),'Pedra '+n);
      b.addEventListener('click',()=>{
        if(typeof addPatternStone==='function')addPatternStone('n:'+n);
        else{
          const input=document.getElementById('st-pattern');if(!input)return;
          input.value=[input.value.trim(),'n:'+n].filter(Boolean).join(', ');
          input.dispatchEvent(new Event('input',{bubbles:true}));
        }
      });grid.append(b);
    }
    section.append(grid);palette.insertAdjacentElement('afterend',section);
  }
  function organizeEditor(){
    const page=document.getElementById('page-estrategias');if(!page)return;
    const rules=document.getElementById('v17-rules');const layout=page.querySelector('.strategies-layout');
    if(rules&&layout&&layout.nextElementSibling!==rules){rules.before(layout)}
    const newButton=document.getElementById('new-strategy');if(newButton)newButton.textContent='＋ Montar estratégia';
    const v17Button=rules?.querySelector('.v17-hero .v17-btn.primary');if(v17Button)v17Button.textContent='＋ Montar estratégia';
    if(newButton&&!newButton.dataset.nexoV19){newButton.dataset.nexoV19='yes';newButton.addEventListener('click',()=>{page.classList.add('v17-edit-open');layout?.scrollIntoView({behavior:'smooth',block:'start'});});}
    addNumberPalette();
  }
  function addTimeButton(){
    const host=document.querySelector('#resultados .results-head') || document.getElementById('balls')?.parentElement;
    if(!host||document.getElementById('nexo-v19-time-toggle'))return;
    const wrap=el('div','nexo-v19-time-options');
    const b=el('button','nexo-v19-time-toggle');b.id='nexo-v19-time-toggle';b.type='button';
    const show=()=>{b.textContent=timeMode==='observed'?'◷ Segundos: ligados':'◷ Segundos: desligados';b.setAttribute('aria-pressed',timeMode==='observed'?'true':'false')};
    b.addEventListener('click',()=>{timeMode=timeMode==='minute'?'observed':'minute';safeSet(TIME_KEY,timeMode);show();paintHistory()});show();
    const hint=el('small','nexo-v19-time-hint');hint.id='nexo-v19-time-hint';
    wrap.append(b,hint);host.append(wrap);
  }
  let scheduled=false;
  const paint=()=>{
    scheduled=false;
    paintHistory();paintLatest();paintTokens();paintAdminStones();paintColorPalette();
  };
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(paint)};
  function init(){
    addThemeButton(document.querySelector('.top-right'));
    addThemeButton(document.querySelector('.top .right'));
    addThemeButton(document.querySelector('#login .login-card'));
    changeTheme();
    addTimeButton();organizeEditor();paint();
    const history=document.getElementById('balls');
    if(history)new MutationObserver(schedule).observe(history,{childList:true});
    const latest=document.querySelector('#nexo-v11-now .v11-stone');
    if(latest)new MutationObserver(schedule).observe(latest,{childList:true});
    for(const id of ['page-estrategias','page-padroes','stones']){
      const root=document.getElementById(id);
      if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:id!=='stones'});
    }
    const ck=document.getElementById('set-numbers');if(ck)ck.addEventListener('change',()=>setTimeout(paintAdminStones,0));
    // Sem consultas adicionais; usa os mesmos resultados que o site ja recebeu.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
