/* NEXO PRO V13 - somente interface publica; nenhuma chave de ADM no cliente */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const state={sound:false,alerts:false,lastKey:null,audio:null,install:null};
function saved(k,v){try{if(v===undefined)return localStorage.getItem('npro:'+k);localStorage.setItem('npro:'+k,v);}catch{}return null;}
function button(label,title){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title||label;return b;}
function ensureNode(){
 const history=$('n67-history'),board=history?.querySelector('.n67-board'),preview=history?.querySelector('.n67-preview');if(!board||!preview)return;
 // A ultima rodada aparece depois da grade de pedras (sem duplicacao).
 const listHead=board.querySelector('.n67-listhead');
 if(!listHead)throw Error('NEXO V14: cabecalho da grade de historico ausente');
 listHead.before(preview);
 const toolbar=document.createElement('div');toolbar.className='npro-toolbar';toolbar.id='npro-toolbar';
 const direction=button('↔ Reverter direção','Inverter o lado de chegada dos resultados');
 const theme=button('☀️ Modo claro','Alternar tema');
 const alert=button('🔔 Alerta de branco','Ativar notificacao quando uma rodada branca for confirmada');
 const sound=button('🔊 Fogos com som','Ativar o som de fogos com toque');
 const link=document.createElement('a');link.className='npro-play-badge npro-platform';link.hidden=true;link.target='_blank';link.rel='noopener noreferrer external';link.textContent='Abrir plataforma ↗';
 toolbar.append(direction,theme,alert,sound,link);
 toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Opções do histórico, deslize lateralmente');
 board.insertBefore(toolbar,board.querySelector('.n67-controls')||board.firstChild);
 const grid=$('nx6-grid');const refresh=()=>{const rev=saved('reverse')==='1';grid?.classList.toggle('npro-reverse',rev);direction.textContent='↔ Reverter direção';direction.title=rev?'Direita → esquerda':'Esquerda → direita';direction.setAttribute('aria-pressed',rev?'true':'false');const light=saved('light')==='1';document.body.classList.toggle('npro-light',light);theme.textContent=light?'🌙 Modo escuro':'☀️ Modo claro';theme.setAttribute('aria-pressed',light?'true':'false');alert.textContent='🔔 Alerta de branco';alert.setAttribute('aria-pressed',state.alerts?'true':'false');sound.textContent='🔊 Fogos com som';sound.setAttribute('aria-pressed',state.sound?'true':'false');};
 direction.onclick=()=>{saved('reverse',saved('reverse')==='1'?'0':'1');refresh();};
 theme.onclick=()=>{saved('light',saved('light')==='1'?'0':'1');refresh();};
 alert.onclick=async()=>{state.alerts=!state.alerts;saved('alerts',state.alerts?'1':'0');if(state.alerts){unlock();if('Notification' in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}}refresh();};
 sound.onclick=()=>{state.sound=!state.sound;saved('sound',state.sound?'1':'0');if(state.sound)unlock();refresh();};
 state.alerts=saved('alerts')==='1';state.sound=saved('sound')==='1';refresh();
 fetch('/api/adm/nexo-pro-public',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(x=>{if(!x?.enabled||!/^https:\/\//i.test(x.url||''))return;link.textContent='↗ '+(x.name||'Abrir plataforma');link.href=x.url;
 const title=$('nx6-title');const update=()=>{link.hidden=!/blitz/i.test(title?.textContent||'')};if(title)new MutationObserver(update).observe(title,{childList:true,subtree:true});update();}).catch(()=>{});
 // O link configurado vale para as paginas de cada jogo; evitando redirects forcados.
}
function unlock(){try{const A=window.AudioContext||window.webkitAudioContext;if(A){state.audio??=new A();state.audio.resume().catch(()=>{});}}catch{}}
function fireworkSound(){if(!state.sound||!state.audio||state.audio.state!=='running')return;try{
 const ctx=state.audio,when=ctx.currentTime;const length=Math.floor(ctx.sampleRate*.26),buf=ctx.createBuffer(1,length,ctx.sampleRate),samples=buf.getChannelData(0);for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/length,1.3);
 for(let k=0;k<3;k++){const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=buf;filter.type='bandpass';filter.frequency.value=700+k*600;gain.gain.setValueAtTime(.001,when+.07*k);gain.gain.exponentialRampToValueAtTime(.07,when+.07*k+.012);gain.gain.exponentialRampToValueAtTime(.001,when+.07*k+.3);src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);src.start(when+.07*k);src.stop(when+.07*k+.32);}
 }catch{}}
function fireworks(card,enabled){let holder=card?.querySelector('.npro-fireworks');if(!card)return;if(!enabled){holder?.remove();return;}if(holder)return;
 holder=document.createElement('div');holder.className='npro-fireworks';holder.setAttribute('aria-hidden','true');const positions=[[18,32,'#e2ac2d'],[49,55,'#2eafaa'],[78,27,'#dc528e'],[67,78,'#5586cd'],[31,79,'#dba439']];for(let j=0;j<positions.length;j++){const [x,y,color]=positions[j];const f=document.createElement('span');f.className='npro-firework';f.style.setProperty('--x',x+'%');f.style.setProperty('--y',y+'%');f.style.setProperty('--delay',(-j*.47)+'s');f.style.color=color;for(let i=0;i<12;i++){let part=document.createElement('i');part.style.setProperty('--n',i);f.append(part);}holder.append(f);}card.prepend(holder);
}
function watchWhite(){const tile=$('n67-latest-tile'),card=document.querySelector('#n67-history .n67-preview');if(!tile||!card)return;
 let initialized=false;const inspect=(changes)=>{const isWhite=tile.classList.contains('n67-stone-white')&&!!$('n67-history')&&!$('n67-history').hidden;fireworks(card,isWhite);const valid=changes.some(x=>x.type==='childList');if(!valid)return;
 const latest=$('n67-latest-when')?.textContent||'';const key=tile.textContent+'|'+latest;const shouldSound=initialized&&isWhite;initialized=true;state.lastKey=key;
 if(!shouldSound)return;if(state.alerts&&'Notification' in window&&Notification.permission==='granted'&&!document.hidden){try{new Notification('⚪ Branco confirmado no NEXO',{body:latest,icon:'/nexo-pro-192.png',tag:'npro-white-'+Date.now()});}catch{}}fireworkSound();};
 new MutationObserver(inspect).observe(tile,{attributes:true,attributeFilter:['class'],childList:true});inspect([]);
}
function installPWA(){if('serviceWorker' in navigator)navigator.serviceWorker.register('/nexo-pro-sw.js',{scope:'/'}).catch(()=>{});
 window.addEventListener('beforeinstallprompt',ev=>{ev.preventDefault();state.install=ev;document.querySelectorAll('[data-npro-install]').forEach(b=>b.hidden=false);});
 document.querySelectorAll('[data-npro-install]').forEach(btn=>btn.onclick=async()=>{if(state.install){await state.install.prompt();state.install=null;}else{alert('No Chrome, abra ⋮ → Adicionar à tela inicial → Instalar aplicativo.');}});
}
function privateAdmin(){fetch('/api/adm/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(!j?.ok)return;const b=document.createElement('a');b.className='n12-float-nav';b.textContent='⚙ ADM';b.href='/adm.html';b.setAttribute('aria-label','Painel administrativo');document.body.append(b);}).catch(()=>{});
 document.querySelectorAll('a[href="/adm.html"],a[href="/adm.html#estrategias"]').forEach(x=>{if(x.closest('.n67-drawer')||x.closest('.n67-footer')||x.closest('.n67-header-right'))x.hidden=true;});
}
function logos(){const brand=document.querySelector('.n67-brand .n67-mark');if(brand){let img=document.createElement('img');img.src='/nexo-pro-192.png';img.alt='NEXO PRO';img.className='npro-icon';brand.replaceWith(img);}const splash=document.querySelector('.n67-splash-emblem');if(splash){let img=document.createElement('img');img.src='/nexo-pro-logo.png';img.className='npro-splash-logo';img.alt='NEXO HISTÓRICO PRO';splash.replaceWith(img);}
}
function illustratedPlatforms(){const root=$('n67-platform-cards');if(!root)return;const draw=()=>{for(const c of root.querySelectorAll('.n67-platform-card')){if(c.dataset.nproDecorated)return;const title=(c.querySelector('strong')?.textContent||'').toLowerCase();const platform=title.includes('blitz')?'blitz':title.includes('brabet')?'brabet':title.includes('813bet')?'813bet':'other';const art=platform==='blitz'?'⚡':platform==='brabet'?'◇':platform==='813bet'?'◉':'✧';c.dataset.nproPlatform=platform;c.dataset.nproDecorated='1';const deco=document.createElement('span');deco.className='npro-platform-illustration';deco.textContent=art;deco.setAttribute('aria-hidden','true');c.append(deco);}};
 new MutationObserver(draw).observe(root,{childList:true});draw();}
function init(){ensureNode();watchWhite();logos();illustratedPlatforms();installPWA();privateAdmin();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
