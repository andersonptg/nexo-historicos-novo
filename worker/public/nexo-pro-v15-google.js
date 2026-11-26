/* Login Google GSI opcional: servidor valida assinatura, emissor, audiência e email. */
(()=>{'use strict';
function init(){const form=document.getElementById('login-form');if(!form||document.getElementById('npro-google-login'))return;
 const box=document.createElement('div');box.id='npro-google-login';box.className='npro-g-login';box.hidden=true;
 const label=document.createElement('p');label.textContent='Ou entre com sua Conta Google autorizada';
 const target=document.createElement('div');const status=document.createElement('div');status.setAttribute('role','status');
 box.append(label,target,status);form.after(box);
 fetch('/api/adm/google-config',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(cfg=>{
  if(!cfg?.enabled||!cfg?.clientId)return;
  box.hidden=false;
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{if(!window.google?.accounts?.id){status.textContent='Google indisponível';return;}
    window.google.accounts.id.initialize({client_id:cfg.clientId,auto_select:false,callback:async result=>{
     status.textContent='Validando acesso Google...';
     try{const res=await fetch('/api/adm/google-login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:result.credential})});const json=await res.json();if(!res.ok||!json.ok)throw Error(json.error||'Não autorizado');status.textContent='Acesso autorizado';location.replace('/adm.html#geral');}
     catch(e){status.textContent='Não foi possível entrar: '+String(e.message||e).slice(0,140);}
    }});
    window.google.accounts.id.renderButton(target,{type:'standard',theme:'outline',size:'large',text:'signin_with',shape:'pill',width:260});
  };
  script.onerror=()=>{status.textContent='Não foi possível carregar o Google.';};document.head.append(script);
 }).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
