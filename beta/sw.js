/* GM Coach BETA service worker (scope /beta/ only). Network-first shell, images cache-first, API never cached. */
var V = 'gmb-v2', IMG = 'gmb-img-v1';
var SHELL = ['./', 'index.html', 'beta.css?v=1', 'core.js?v=1', 'foods.js?v=1', 'app.js?v=1', '../assets/styles.css?v=3', '../assets/img/logo.png', '../assets/img/icon-192.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /^gmb-/.test(k) && k !== V && k !== IMG; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.pathname.indexOf('/object/authenticated/') >= 0) return;
  if (u.pathname.indexOf('/storage/v1/object/public/') >= 0 || /\.(woff2|png|webp|jpg)$/.test(u.pathname)) {
    e.respondWith(caches.open(IMG).then(function (c) { return c.match(r).then(function (hit) { return hit || fetch(r).then(function (res) { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }); }); }));
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; })
    .catch(function () { return caches.match(r).then(function (hit) { return hit || caches.match('index.html'); }); }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow('./');
  }));
});
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'GM Coach', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'GM Coach', { body: d.body || '', icon: '../assets/img/icon-192.png', badge: '../assets/img/icon-192.png',
    tag: d.tag || 'gmb', renotify: true, vibrate: [200, 100, 200], data: { url: './' } }));
});
