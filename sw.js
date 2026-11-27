// Lodge of Nairobi portal service worker.
// Goal: make the app installable (standalone) and work offline, WITHOUT ever
// serving a stale page when online. HTML is network-first so updates land on
// the next online load; static assets are cache-first; Supabase (cross-origin)
// is never intercepted.
const CACHE = 'lon-portal-v4';
const SHELL = [
  './', './index.html', './register.html',
  './logo.png', './icon-192.png', './icon-512.png',
  './apple-touch-icon.png', './manifest.json',
  './icon-192-maskable.png', './icon-512-maskable.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL).catch(function(){}); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Only our own origin; Supabase and any other host go straight to the network.
  if (url.origin !== location.origin) return;

  var isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  if (isHTML) {
    // Network-first: always fetch the freshest page when online.
    e.respondWith(
      fetch(req).then(function(r){
        var cp = r.clone();
        caches.open(CACHE).then(function(c){ c.put(req, cp); });
        return r;
      }).catch(function(){
        return caches.match(req).then(function(m){ return m || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Static assets: cache-first, fall back to network and cache it.
  e.respondWith(
    caches.match(req).then(function(m){
      return m || fetch(req).then(function(r){
        var cp = r.clone();
        caches.open(CACHE).then(function(c){ c.put(req, cp); });
        return r;
      });
    })
  );
});

// ── Web Push ───────────────────────────────────────────────────────────────
// A push arrives even when the app is closed. We show it and let the DEVICE
// decide sound/vibration: no custom sound, no forced vibrate, not marked
// silent — so a phone on silent / Do Not Disturb shows it quietly.
self.addEventListener('push', function(e){
  var data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch(err){ data = { title: 'Lodge of Nairobi № 7187', body: (e.data && e.data.text()) || '' }; }
  var title = data.title || 'Lodge of Nairobi № 7187';
  var options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || './index.html', pane: data.pane || '' }
  };
  if (data.tag) options.tag = data.tag;
  e.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses the open app (or opens it), and asks it to
// jump to the relevant pane if one was supplied.
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var d = e.notification.data || {};
  var target = d.url || './index.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++){
        var c = list[i];
        if (c.url.indexOf(location.origin) === 0 && 'focus' in c){
          if (d.pane){ try { c.postMessage({ type: 'open-pane', pane: d.pane }); } catch(x){} }
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
