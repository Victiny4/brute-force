const CACHE_NAME = 'brute-force-robotics-v1';
const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './config.js',
    './data-remote.js',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// 20-minute task reminders sent by the Supabase "task-alerts" function.
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(self.registration.showNotification(data.title || 'Task reminder', {
        body: data.body || '',
        tag: data.tag,
        icon: 'icon-192.png',
    }));
});

// Tapping a reminder opens the dashboard (or focuses it if already open).
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            if (windows.length) return windows[0].focus();
            return self.clients.openWindow('./');
        })
    );
});

// App shell files: network-first, so an online visit always gets the latest
// deployed code; only falls back to the last cached copy when offline.
// Everything else (e.g. Supabase requests) just goes to the network as normal.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then((response) => {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
