const CACHE="holodylnyk-v24";
const ASSETS=["./","./index.html","./404.html","./css/style.css","./js/recipes.js","./js/app.js","./manifest.webmanifest","./icon.svg","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function isHTML(req){
  if(req.mode==="navigate") return true;
  const dest=req.destination;
  if(dest==="document") return true;
  const url=new URL(req.url);
  return url.origin===location.origin&&(url.pathname.endsWith(".html")||url.pathname.endsWith("/"));
}
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  if(isHTML(e.request)){
    // network-first для сторінок: ніколи не показуємо застарілий HTML
    e.respondWith(fetch(e.request).then(res=>{
      if(res.ok){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
      return res;
    }).catch(()=>caches.match(e.request)));
    return;
  }
  // статика: спочатку кеш, в фоні оновлюємо
  e.respondWith(caches.match(e.request).then(hit=>{
    const net=fetch(e.request).then(res=>{
      if(res.ok&&new URL(e.request.url).origin===location.origin){
        const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return res;
    }).catch(()=>hit);
    return hit||net;
  }));
});
