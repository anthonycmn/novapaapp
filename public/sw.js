/*
 * NOVA PA Family Hub service worker.
 * Strategy:
 *  - Precache the offline shell on install.
 *  - Network-first for navigations, falling back to cache, then /offline.
 *  - Stale-while-revalidate for static assets (_next/static, fonts, icons).
 *  - Never cache API/auth routes.
 * Phase 3 adds calendar payload caching; Phase 2 adds push handlers.
 */
const VERSION = "v9";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const OFFLINE_URL = "/offline";

/* Routes worth having in a theater basement with no signal (#5, #9).
   /family/documents joined the list in the Sep 5 2026 audit — the health
   form and emergency contacts are exactly what a basement needs. */
const OFFLINE_CRITICAL = ["/schedule", "/dashboard", "/admin/health", "/family/documents"];

/*
 * Sign-out tells us to forget the rendered pages. Cached navigations carry
 * the previous user's children and schedule; on a shared device those must
 * not survive into the next sign-in (Sep 5 2026 audit).
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-shell-cache") {
    event.waitUntil(caches.delete(SHELL_CACHE));
  }
});

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
    /*
     * NAVIGATIONS ARE NOT INTERCEPTED. AT ALL. (11 Sep 2026.)
     *
     * v7 cloned every streamed page mid-flight to cache it, and pages froze
     * on their loading skeleton with the content already downloaded. v8 kept
     * a plain fetch() passthrough and pages STILL froze: React's streamed
     * HTML plus a respondWith proxy is enough to strand the inline scripts
     * that reveal each finished section. Six days of "the portal is slow,
     * reload it" traced back to this handler.
     *
     * So page loads now go straight to the network, browser-native, and the
     * worker keeps to the jobs that need no proxying: push notifications and
     * static assets. The offline page cache went with it — a nicety that is
     * not worth breaking every page for. If offline pages come back, they
     * come back as a separate cache.add() fetch, never as a tee of the
     * response a parent is reading, and get verified against a streamed
     * route before shipping.
     */
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
      /* The status-bar glyph. Android renders ONLY this image's alpha, so a
         full-colour icon here becomes a white square (CJ, 5 Sep 2026) —
         it must be a pure silhouette: the white butterfly, on nothing. */
      badge: "/icons/badge-96.png",
      data: { url: payload.url ?? "/" },
      tag: payload.tag,
    })
  );
});

/* Chrome rotates push endpoints — on worker updates, and whenever it
   pleases. Without this handler the rotation happens in silence: the old
   endpoint starts answering 410, the server prunes it, and the phone is
   deaf until the person thinks to toggle push off and on (which nobody
   ever does — they just stop hearing from us). Re-subscribe with the same
   VAPID key and re-file, session cookie riding along. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription;
        let newSub = event.newSubscription ?? null;
        if (!newSub) {
          const key = oldSub?.options?.applicationServerKey;
          if (!key) return;
          newSub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        }
        await fetch("/api/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            oldEndpoint: oldSub?.endpoint ?? null,
          }),
        });
      } catch {
        /* Signed out, offline, or subscribe refused: the next app open
           re-files whatever the browser holds (PushSync). */
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  /* Absolute, because openWindow/navigate resolve relative URLs differently
     across platforms, and the tap must land on the row's page every time —
     a reply's notification carries /messages/<threadId>, and that is where
     the parent expects to be standing. */
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        /* FOCUS FIRST, then navigate. The old order navigated before
           focusing; on Android the navigate() of a background window can
           reject, the waitUntil promise died, and the app flashed open and
           vanished (CJ, 5 Sep 2026: "it only opens quickly and then
           disappears"). A focus that lands is worth keeping even if the
           navigation is then refused. */
        try {
          await client.focus();
        } catch {
          continue;
        }
        try {
          await client.navigate(target);
        } catch {
          /* Uncontrolled or cross-scope window: focused but not moved.
             The user is in the app; the bell badge takes them the rest
             of the way. */
        }
        return;
      }
      try {
        await self.clients.openWindow(target);
      } catch {
        /* Some Android WebAPK states refuse deep-link opens; open the app
           at its root rather than doing nothing at all. */
        await self.clients.openWindow("/");
      }
    })()
  );
});
