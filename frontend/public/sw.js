// App-shell cache so CouncilRoom opens instantly as a PWA. API calls always hit the network.
// Bump this to drop every client's old cache; activate deletes any other name.
const CACHE = "councilroom-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Never cache a 404 or an auth redirect: a poisoned entry outlives the
        // problem and gets served back as if it were the app.
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
  );
});

// A finished council, arriving through the push service. The payload was
// encrypted for this browser alone, so the title and preview are already here —
// no fetch, nothing for the relay to have read on the way.
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (_) {
    // A push with no readable body still means "something finished".
  }
  e.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Chrome waives the show-something rule while a window of this origin is
      // visible, and the answer is already on screen in it.
      if (windows.some((w) => w.visibilityState === "visible")) return;
      await self.registration.showNotification(data.title || "CouncilRoom", {
        body: data.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        // One notification per room: a second answer replaces the first rather
        // than stacking up a column of them.
        tag: data.url || "councilroom",
        renotify: true,
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse the window that is already open — installed apps only get one.
      for (const w of windows) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
