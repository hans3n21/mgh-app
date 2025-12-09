self.addEventListener('install', (event) => {
    // Skip waiting to activate the new service worker immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Claim clients immediately so the service worker controls the page
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Minimal fetch handler - currently just passes through
    // Can be expanded for offline caching later
});
