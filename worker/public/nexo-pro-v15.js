/* NEXO PRO V15: dois acessos visuais ao link público configurado no ADM. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function init(){
 const history=$('n67-history'),top=document.querySelector('.n67-header-right'),grid=$('nx6-grid');
 const title=$('nx6-title'),preview=history?.querySelector('.n67-preview');
 if(!history||!top||!grid||!preview)return;
 const one=document.createElement('a'),two=document.createElement('a');
 for(const a of [one,two]){a.hidden=true;a.target='_blank';a.rel='noopener noreferrer external';a.referrerPolicy='no-referrer';a.setAttribute('aria-label','Abrir plataforma de jogo em outra aba');}
 one.className='npro-playtop';two.className='npro-playmiddle';
 top.insertBefore(one,top.querySelector('.n67-menu-trigger')||null);
 const listHead=history.querySelector('.n67-listhead');
 if(listHead)listHead.before(two);else grid.before(two);
 let data=null;
 function render(){
  const label=(title?.textContent||'').toLowerCase();
  const show=!!data?.enabled&&/^https:\/\//i.test(data?.url||'')&&!history.hidden&&/blitz/i.test(label);
  for(const a of [one,two]){a.hidden=!show;if(show){a.textContent=data.name||'Acessar plataforma';a.href=data.url;}else a.removeAttribute('href');}
 }
 fetch('/api/adm/nexo-pro-public',{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{data=d;render();}).catch(()=>{});
 new MutationObserver(render).observe(history,{attributes:true,attributeFilter:['hidden']});
 if(title)new MutationObserver(render).observe(title,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
