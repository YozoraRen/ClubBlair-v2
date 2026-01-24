const CACHE_NAME = 'club-blair-v2'; // Version bump
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/ocr.js',
  '/icon.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignore Google Apps Script (GAS) calls - Network Only
  if (url.hostname.includes('script.google.com')) {
    return; // Let the browser handle it directly
  }

  // 2. Ignore POST requests - Network Only
  if (event.request.method !== 'GET') {
    return;
  }

  // 3. Ignore browser extensions or non-http protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Navigation fallback for SPA (if accessing / directly)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Static Assets: Cache First, Fallback to Network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) // Take control immediately
  );
});
