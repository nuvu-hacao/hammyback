/* Service worker của HammyBack.
   - CHỈ lưu file tĩnh của app (cùng tên miền). Mạng trước, mất mạng mới dùng bản lưu.
   - KHÔNG BAO GIỜ lưu dữ liệu từ Google (googleapis.com, accounts.google.com…): các yêu cầu đó
     không đi qua service worker này. */
var CACHE = 'hammyback-static-v2';
var FILES = ['./', 'index.html', 'styles.css', 'engine.js', 'app.js', 'config.js', 'manifest.webmanifest', 'privacy.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'fonts/inter-latin-wght-normal.woff2', 'fonts/inter-latin-ext-wght-normal.woff2', 'fonts/inter-vietnamese-wght-normal.woff2', 'fonts/fraunces-latin-full-normal.woff2'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // Google API: đi thẳng ra mạng, không lưu
  if (u.search) return; // vd ?mock=1
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok && r.type === 'basic') { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: false }).then(function (m) { return m || caches.match('index.html'); }); }));
});
