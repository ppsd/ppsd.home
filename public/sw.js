// Minimal service worker — enables "install to home screen" (PWA) without
// caching app code (so updates always load fresh from the server).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // pass-through: let the browser fetch from the network as usual
})
