/* NEXO V12: realce do resultado CONFIRMADO; sem inventar giros em tempo real.
   Atualiza com o mesmo GET do site, sem polling adicional e sem imagens pesadas. */
(()=>{
 'use strict';
 const card=document.getElementById('nexo-v11-now');
 if(!card||typeof window.NEXO_V11_LIVE!=='function')return;
 const old=window.NEXO_V11_LIVE;
 const phase=document.createElement('div');phase.className='v12-result-phase';phase.setAttribute('role','status');
 phase.textContent='AGUARDANDO RESULTADO CONFIRMADO';
 card.querySelector('.v11-now-body')?.append(phase);
 let seen='',timer=null,fireCancel=null;
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 function fireworks(){
  if(reduce||document.hidden)return;
  if(fireCancel)fireCancel();
  const canvas=document.createElement('canvas');canvas.className='v12-fireworks';canvas.setAttribute('aria-hidden','true');card.append(canvas);
  const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
  const bounds=card.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.min(2000,Math.max(1,Math.round(bounds.width*dpr)));
  canvas.height=Math.min(1000,Math.max(1,Math.round(bounds.height*dpr)));
  ctx.scale(dpr,dpr);
  const w=canvas.width/dpr,h=canvas.height/dpr;
  const particles=[];let running=true,raf=0;
  const palette=['#fefefe','#fbd35c','#35ddb4','#a4d3ff','#f799de'];
  const t0=performance.now();let lastBurst=-1200;
  const add=(x,y)=>{for(let i=0;i<38;i++){
   const angle=(Math.PI*2*i/38)+Math.random()*.4,speed=1.1+Math.random()*2.8;
   particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,r:1+Math.random()*2,color:palette[i%palette.length]});
  }};
  function draw(t){
   if(!running)return;
   const elapsed=t-t0;
   ctx.clearRect(0,0,w,h);
   if(elapsed<9000&&elapsed-lastBurst>1100){lastBurst=elapsed;add(w*(.2+Math.random()*.6),h*(.2+Math.random()*.45));}
   for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.033;p.vx*=.994;p.life-=.009;
    if(p.life<=0){particles.splice(i,1);continue;}
    ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
   }ctx.globalAlpha=1;
   if(elapsed<10000&&!document.hidden)raf=requestAnimationFrame(draw);else stop();
  }
  function stop(){running=false;cancelAnimationFrame(raf);canvas.remove();card.classList.remove('v12-white-celebrate');if(fireCancel===stop)fireCancel=null;}
  fireCancel=stop;card.classList.add('v12-white-celebrate');raf=requestAnimationFrame(draw);
 }
 window.NEXO_V11_LIVE=(rows,status)=>{
  const r=rows?.[0];if(!r){old(rows,status);return;}
  if(r.id===seen)return; // Previne animação repetida a cada consulta de 1s.
  const first=!seen;seen=r.id;
  if(timer)clearTimeout(timer);
  const age=Math.round(Date.now()/1000-r.minute_epoch);
  if(age>120){old(rows,status);phase.textContent='FONTE ATRASADA · '+Math.max(1,Math.floor(age/60))+' MIN';card.classList.remove('v12-result-arriving');if(fireCancel)fireCancel();return;}
  card.classList.remove('v12-result-arriving');
  if(first){old(rows,status);phase.textContent='BRABET · ÚLTIMO RESULTADO CONFIRMADO';return;}
  phase.textContent='BRABET GIROU · RESULTADO RECEBIDO';
  card.classList.add('v12-result-arriving');
  timer=setTimeout(()=>{
   if(r.id!==seen)return;
   old(rows,status);phase.textContent='RESULTADO CONFIRMADO · '+(r.color==='white'?'⚪ BRANCO':r.color==='red'?'🔴 VERMELHO':'⚫ PRETO');
   card.classList.remove('v12-result-arriving');
   if(r.color==='white')fireworks();else if(fireCancel)fireCancel();
  },300);
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&fireCancel)fireCancel();});
})();
