const CACHE_NAME = "shera-studio-v4";
const APP_SHELL = ["/", "/index.html", "/about.html", "/classes.html", "/massages.html", "/booking.html", "/styles.css", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/index.html"));
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const freshContent = event.request.mode === "navigate" || ["script", "style", "document"].includes(event.request.destination);
  event.respondWith(freshContent ? networkFirst(event.request) : caches.match(event.request).then((cached) => cached || networkFirst(event.request)));
});
