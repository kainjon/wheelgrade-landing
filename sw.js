/* WheelGrade landing-page service worker — makes wheelgrade.com itself
   installable so the browser can offer a one-click install
   (beforeinstallprompt) on desktop and Android Chrome.

   This worker ONLY covers the landing pages at the domain root.
   The app at /app/ has its own service worker (/app/sw.js, scope /app/),
   which is a longer scope and therefore still wins for every /app/ URL —
   this worker never touches /app/api/*, /app/auth/*, or any app asset.

   Caching is deliberately light so a deploy always shows immediately:
   - HTML / navigation: network-first (fresh page every load, cached copy
     only as an offline fallback).
   - Static assets (CSS, JS, icons, manifest): cache-first, they change
     rarely and the landing deploy bumps them on push. */
var CACHE = 'wheelgrade-landing-v1';
var SHELL = [
  '/',
  '/manifest.json',
  '/app/icon-192.png',
  '/app/icon-512.png',
  '/app/icon-512-maskable.png'
];
/* NOTE: '/index.html' is deliberately NOT in SHELL — the server 308-redirects
   it to '/', and a non-200 in cache.addAll fails the whole install, so the
   worker would never activate. '/' serves the same page. */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the app — /app/sw.js owns it.
  if (url.pathname === '/app' || url.pathname.indexOf('/app/') === 0) return;
  if (event.request.method !== 'GET') return;

  var isNav = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').indexOf('text/html') !== -1;
  if (isNav) {
    // Network-first for pages: a fresh deploy must show right away.
    event.respondWith(
      fetch(event.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        return resp;
      }).catch(function () { return caches.match(event.request); })
    );
    return;
  }
  // Static assets: cache-first, then network.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        return resp;
      });
    })
  );
});
