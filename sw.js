// Lodge of Nairobi portal service worker.
// Goal: make the app installable (standalone) and work offline, WITHOUT ever
// serving a stale page when online. HTML is network-first so updates land on
// the next online load; static assets are cache-first; Supabase (cross-origin)
// is never intercepted.
const CACHE = 'lon-portal-v3';
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
