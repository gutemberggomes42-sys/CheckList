const CACHE_NAME = 'checklist-app-shell-v1';
const APP_FILES = [
    './',
    './index.html',
    './firebase-adapter.js',
    './manifest.webmanifest',
    './app-icon.svg',
    './app-icon-192.png',
    './app-icon-512.png',
    './usina-cambui.png'
];
const CDN_HOSTS = new Set([
    'www.gstatic.com',
    'cdn.tailwindcss.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
]);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(APP_FILES.map(path => cache.add(new URL(path, self.registration.scope))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('checklist-app-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

async function networkFirst(request, fallbackUrl) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            try { await cache.put(request, response.clone()); } catch (_) {}
        }
        return response;
    } catch (_) {
        return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : null) || Response.error();
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        if (request.mode === 'navigate') {
            event.respondWith(networkFirst(request, new URL('./index.html', self.registration.scope).href));
            return;
        }
        if (APP_FILES.some(path => new URL(path, self.registration.scope).pathname === url.pathname)) {
            event.respondWith(networkFirst(request));
        }
        return;
    }
    if (CDN_HOSTS.has(url.hostname) && ['script', 'style', 'font'].includes(request.destination)) {
        event.respondWith(networkFirst(request));
    }
});
