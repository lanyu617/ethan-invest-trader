/* Shell cache only. No API caching, push, analytics, credential storage or queued writes. */
const CACHE_NAME = 'ethan-trader-shell-0.1.0';
const ROOT = new URL('./', self.location.href);
const FILES = ['./','./index.html','./assets/style.css','./assets/app.js','./assets/core.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'].map(path => new URL(path, ROOT).href);
const ALLOWED = new Set(FILES);
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ethan-trader-shell-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));});
self.addEventListener('message', event => {if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==ROOT.origin || url.pathname.includes('/api/'))return;
  if(request.mode==='navigate' && (url.pathname===ROOT.pathname || url.pathname===ROOT.pathname+'index.html')) {
    event.respondWith(fetch(request).catch(() => caches.match(new URL('./index.html', ROOT).href)));return;
  }
  if(!ALLOWED.has(url.href))return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
