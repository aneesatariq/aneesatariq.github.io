'use strict';

// Minimal PWA worker: network-first, no SRI precache, no plain-text error pages.
const VERSION = '1.0.55';
const CACHE = `aneesa-tariq-portfolio:minimal:${VERSION}`;
const SHELL = ['offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (path) => {
      try {
        const response = await fetch(new URL(path, self.registration.scope), { cache: 'reload' });
        if (response.ok) await cache.put(new URL(path, self.registration.scope).href, response.clone());
      } catch {
        // Shell caching is best-effort; the live site must never depend on it.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('aneesa-tariq-portfolio:') && key !== CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      return await fetch(event.request);
    } catch {
      if (event.request.mode === 'navigate') {
        const offlineURL = new URL('offline.html', self.registration.scope).href;
        const cached = await caches.match(offlineURL);
        if (cached) return cached;
      }
      // Do not invent "Page not found." / plain-text 503 bodies.
      return Response.error();
    }
  })());
});
