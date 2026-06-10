const CACHE_NAME = 'planner7-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icons/logo svg.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/calendar.svg',
  '/icons/check-checked.svg',
  '/icons/check-unchecked.svg',
  '/icons/chevron-down.svg',
  '/icons/chevron-left.svg',
  '/icons/chevron-right.svg',
  '/icons/clock.svg',
  '/icons/close.svg',
  '/icons/datepicker.svg',
  '/icons/download.svg',
  '/icons/edit.svg',
  '/icons/folder-closed.svg',
  '/icons/folder-open.svg',
  '/icons/key.svg',
  '/icons/log-out.svg',
  '/icons/message-square-text.svg',
  '/icons/message-square.svg',
  '/icons/redo.svg',
  '/icons/tag.svg',
  '/icons/trash.svg',
  '/icons/undo.svg'
];

// Instalación: cachear todos los assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first para peticiones a Supabase, cache-first para assets locales
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase y recursos externos: siempre red
  if (!url.origin.includes(self.location.origin)) {
    return;
  }

  // Assets locales: cache-first con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
