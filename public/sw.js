/* global self, caches, URL, fetch, Response */
const cachePrefix = "central-offline-";
const cacheName =
  cachePrefix + new URL(self.registration.scope).pathname + "-v2";
const offlineUrl = new URL("offline.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.add(offlineUrl)),
  );
});
self.addEventListener("activate", (event) => {
  const oldCacheName = "central-offline-v1";
  const scopePrefix =
    cachePrefix + new URL(self.registration.scope).pathname + "-";
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key === oldCacheName ||
                (key.startsWith(scopePrefix) && key !== cacheName),
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    !request.url.startsWith(self.registration.scope)
  )
    return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(offlineUrl)) ?? Response.error();
    }),
  );
});
