// IMPORTANTE: sube este número de versión cada vez que cambies app.js, style.css
// o index.html. Al cambiar, el navegador activará un service worker nuevo, borrará
// el caché viejo y servirá los archivos actualizados.
const CACHE_VERSION = 'v19';
const CACHE_NAME = 'planner7-' + CACHE_VERSION;

// Archivos de código de la app: siempre se intenta traer la versión más reciente
// desde la red (network-first). Así los cambios se ven sin tener que limpiar caché.
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json'
];

// Recursos estáticos que rara vez cambian: cache-first (rápidos y offline).
const STATIC_ASSETS = [
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
  '/icons/copy.svg',
  '/icons/datepicker.svg',
  '/icons/download.svg',
  '/icons/edit.svg',
  '/icons/folder-closed.svg',
  '/icons/folder-open.svg',
  '/icons/bar-chart.svg',
  '/icons/key.svg',
  '/icons/log-out.svg',
  '/icons/message-square-text.svg',
  '/icons/message-square.svg',
  '/icons/redo.svg',
  '/icons/tag.svg',
  '/icons/trash.svg',
  '/icons/undo.svg'
];

// Instalación: cachear todos los assets conocidos.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([...APP_SHELL, ...STATIC_ASSETS])
    )
  );
  self.skipWaiting();
});

// Activación: borrar cualquier caché de versiones anteriores.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Determina si una petición es de un archivo de código de la app (network-first).
function isAppShellRequest(url) {
  const path = url.pathname;
  return (
    path === '/' ||
    path.endsWith('/index.html') ||
    path.endsWith('/app.js') ||
    path.endsWith('/style.css') ||
    path.endsWith('/manifest.json')
  );
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase y recursos externos: siempre red, sin tocar el service worker.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Código de la app (HTML/JS/CSS): network-first.
  // Trae siempre la versión más reciente; si no hay red, usa la cacheada.
  if (isAppShellRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Resto de assets locales (iconos, imágenes): cache-first con respaldo a red.
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
