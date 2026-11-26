/* NEXO PRO V13 PWA: never cache API, tokens, login, admin or live data */
const CACHE='nexo-pro-public-v14.2';const ASSETS=['/historicos.html','/nexo-pro.css','/nexo-pro.js','/nexo-pro-192.png','/nexo-pro-512.png','/nexo-pro-logo.png','/nexo-pro-v14.css','/nexo-pro-white.png','/nexo-pro-v14-2.css'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('nexo-pro-public-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const u=new URL(req.url);if(u.origin!==self.location.origin)return;if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/adm')||u.pathname.startsWith('/branco')||u.pathname.startsWith('/controle'))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/historicos.html')));return;}
 if(ASSETS.includes(u.pathname)){event.respondWith(caches.match(req).then(r=>r||fetch(req)));}
});
