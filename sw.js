const CACHE='mnssf-trainer-v3';
const CORE=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./questions/manifest.json'];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('mnssf-trainer-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(
    caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
      if(response.ok && (url.pathname.includes('/questions/')||url.pathname.endsWith('.css')||url.pathname.endsWith('.js'))){
        const copy=response.clone();
        caches.open(CACHE).then(c=>c.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match(event.request)))
  );
});
