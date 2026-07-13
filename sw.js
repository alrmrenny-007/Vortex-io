const CACHE = 'vortex-io-v5';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for the app itself and Supabase — always show the latest code/data when online.
// Cache is now purely an offline fallback, not something users depend on to see updates.
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (url.includes('supabase.co')) {
    return; // let these go straight to network, no caching of live data
  }
  const isAppPage = e.request.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('/');
  if (isAppPage) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Static assets (icons, manifest) - cache-first is fine, they rarely change
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});

// Real push notifications — fires even if the app/tab isn't open
self.addEventListener('push', (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }
  catch(e){ data = { title: 'Vortex.io', body: event.data ? event.data.text() : 'New update' }; }
  const title = data.title || 'Vortex.io';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type:'window' }).then(windowClients => {
      for(const client of windowClients){
        if(client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});
