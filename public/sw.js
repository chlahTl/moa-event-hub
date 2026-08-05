const CACHE_NAME = "moa-shell-v4";
const STATIC_PATHS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PATHS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isAdminRequest = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  const isApiRequest = url.pathname === "/api" || url.pathname.startsWith("/api/");
  const isAuthRequest =
    url.pathname === "/signin-with-chatgpt" ||
    url.pathname === "/signout-with-chatgpt" ||
    url.pathname === "/callback";

  // Never serve identity-aware pages, dispatcher-owned authentication routes,
  // or API data from the service-worker cache. `no-store` also bypasses the
  // browser's HTTP cache for these calls.
  if (isAdminRequest || isApiRequest || isAuthRequest) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
