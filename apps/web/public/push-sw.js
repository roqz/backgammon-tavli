// Web Push handlers, imported into the generated service worker (vite.config.ts → importScripts).
/* eslint-env serviceworker */

self.addEventListener("push", (event) => {
  let msg = { title: "Tavli", body: "", tag: "tavli", url: "./" };
  try {
    msg = { ...msg, ...event.data?.json() };
  } catch {
    // not JSON: show the defaults
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      renotify: true,
      requireInteraction: true,
      icon: "icon-192.png",
      data: { url: new URL(msg.url, self.registration.scope).href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        // The open app handles the tournament link itself.
        open.postMessage({ type: "open-url", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
