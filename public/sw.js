// Service worker minimal — rend le site installable (PWA) sans mise en cache agressive
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Laisse passer toutes les requêtes normalement (pas de cache offline pour l'instant)
  event.respondWith(fetch(event.request));
});
