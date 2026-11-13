'use strict';
const CACHE='hooshyar-pos-shell-v1';
const ASSETS=[
  './','./index.html','./invoice.html','./manifest.webmanifest','./icon.svg','./css/style.css',
  './js/core.js','./js/sync.js','./js/domain.js','./js/payments.js','./js/printing.js','./js/club.js','./js/reports.js',
  './js/views.js','./js/views-console.js','./js/views-invoices.js','./js/views-reports.js','./js/views-admin.js','./js/app.js',
  './fonts/vazirmatn-arabic-400-normal.woff2','./fonts/vazirmatn-arabic-700-normal.woff2',
  './fonts/vazirmatn-latin-400-normal.woff2','./fonts/vazirmatn-latin-700-normal.woff2'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.indexOf('/api/')!==-1||url.searchParams.has('op'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;}).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;})));
});
