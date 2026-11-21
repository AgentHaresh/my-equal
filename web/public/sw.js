// A small service worker so My Equal can be installed as an app and opens even with no signal.
// It never stores chats: only the app's own page and static files are kept, and anything under
// /api/ always goes to the network.
const CACHE = "my-equal-shell-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Static files carry a fingerprint in their name, so a stored copy is always the right one.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
            return res.clone();
          })
      )
    );
    return;
  }

  // The page itself: the network first, the last good copy when there is no signal.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put("/", res.clone()));
          return res.clone();
        })
        .catch(() => caches.match("/").then((hit) => hit || new Response("My Equal needs a connection the first time it opens.", { status: 503, headers: { "Content-Type": "text/plain" } })))
    );
  }
});

// A notification arrives while the app is closed or in the background.
self.addEventListener("push", (event) => {
  let note = { title: "My Equal", body: "You have something new." };
  try {
    note = { ...note, ...event.data.json() };
  } catch {
    /* keep the plain wording */
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // If My Equal is already open and in front, the app itself shows the news.
      if (windows.some((w) => w.visibilityState === "visible" && w.focused)) return;
      return self.registration.showNotification(note.title, { body: note.body, tag: note.tag, renotify: Boolean(note.tag), icon: "/icon-192.png", badge: "/icon-192.png", data: { url: note.url || "/" } });
    })
  );
});

// Tapping it brings My Equal to the front, or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
      return self.clients.openWindow(url);
    })
  );
});
