/*
 * Shows pushed notifications and opens the right page when one is clicked.
 *
 * The page registers this file only when a person turns notifications on. It
 * does nothing else: no fetch handler and no cache, so no page that belongs to a
 * signed-in person is ever stored or served from here.
 */

// A new copy takes over at once, so a change to how notifications look or open
// reaches people on their next visit and not after every tab has been closed.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * A path on this site, or the site root. Anything else, such as a full address,
 * a protocol-relative one or a backslash trick, is replaced, so a notification
 * can never send someone to another site.
 */
function sitePath(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//") || /[\\\s]/.test(href)) {
    return "/";
  }
  return href;
}

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }

  const title = typeof message.title === "string" && message.title ? message.title : "Curtin GLMP";
  const href = sitePath(message.href);

  // A browser requires every push to show something, so this runs even when the
  // message could not be read.
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === "string" ? message.body : "",
      data: { href },
      icon: "/icon/192",
      badge: "/push-badge",
      // One notification per page: a second about the same conversation
      // replaces the first instead of stacking.
      tag: href,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(sitePath(event.notification.data && event.notification.data.href), self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);

      if (open) {
        // Take the person to the page the notification is about, in the tab
        // they already have, and bring it forward.
        let tab = open;
        try {
          if (open.url !== target.href && "navigate" in open) {
            tab = (await open.navigate(target.href)) || open;
          }
        } catch {
          // Some browsers refuse to navigate a tab they do not control. Focusing it is still right.
        }
        try {
          await tab.focus();
        } catch {
          await self.clients.openWindow(target.href);
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});
