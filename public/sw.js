/**
 * Service worker — app shell offline.
 *
 * Estratégia network-first para mesma origem (garante código sempre fresco
 * quando online; cai no cache offline). Requisições externas (Firebase,
 * Google Fonts, QR Code) não são interceptadas.
 */
const CACHE = "lumix-cs2-v2";
const SHELL = [
  "/",
  "/index.html",
  "/torneio.html",
  "/inscricao.html",
  "/admin.html",
  "/404.html",
  "/assets/css/styles.css",
  "/assets/img/favicon.svg",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return; // não intercepta terceiros

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
  );
});
