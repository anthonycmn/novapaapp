/*
 * NOVA PA Family Hub service worker.
 * Strategy:
 *  - Precache the offline shell on install.
 *  - Network-first for navigations, falling back to cache, then /offline.
 *  - Stale-while-revalidate for static assets (_next/static, fonts, icons).
 *  - Never cache API/auth routes.
 * Phase 3 adds calendar payload caching; Phase 2 adds push handlers.
 */
const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const OFFLINE_URL = "/offline";

/* Routes worth having in a theater basement with no signal (#5, #9). */
const OFFLINE_CRITICAL = ["/schedule", "/dashboard", "/admin/health"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, ASSET_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  // Never intercept API, auth, or cross-origin requests.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigations so the schedule and emergency
          // roster stay readable offline.
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Fall back to a cached critical route's shell, then the offline page.
          for (const route of OFFLINE_CRITICAL) {
            if (url.pathname === route) {
              const routeCached = await caches.match(route);
              if (routeCached) return routeCached;
            }
          }
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      })
    );
  }
});

/* ── Web Push (Phase 2) ────────────────────────────────────────────────── */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "NOVA PA", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "NOVA PA", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
      tag: payload.tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
