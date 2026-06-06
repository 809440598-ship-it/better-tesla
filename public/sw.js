const CACHE = "better-tesla-disabled-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.delete(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("better-tesla")).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", () => {});
