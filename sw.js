const cacheName = 'fusaya-admin-shell-v1';
const files = ['./', './index.html', './manifest.webmanifest', './app.js', './icon-192.png', './icon-512.png'];
const assets = new Set(files.map(file => new URL(file, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !assets.has(event.request.url)) return;
  event.respondWith(fetch(event.request).catch(() => caches.open(cacheName).then(cache => cache.match(event.request))));
});
