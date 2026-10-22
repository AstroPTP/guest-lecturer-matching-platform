/**
 * Stops this device receiving a person's notifications when they sign out.
 *
 * On a shared computer, or a phone that is handed on, the next person to sign
 * in would otherwise see the previous person's messages arrive. So on every
 * way out (the Logout link, Delete Account, a sign-in that has expired, the
 * step after email verification) this runs first.
 *
 * It does two things, in this order:
 *
 *   1. Unsubscribes in the browser. That is local, and it invalidates the
 *      device's address at the push service, so nothing more can be delivered
 *      here whatever the API does or whether it can be reached at all.
 *   2. Asks the API to forget the device, with `keepalive` so the request
 *      still goes out while the page is being left. It is not waited for: the
 *      server also drops an address the push service reports as gone.
 *
 * It never throws, and the only wait is the local step, capped so that signing
 * out can never be held up by a browser that does not answer.
 *
 * Kept free of the API client on purpose: the client calls this when a request
 * is refused as signed out, and importing it back would be a cycle.
 */

const WORKER_URL = "/sw.js";
const DEFAULT_CAP_MS = 3000;

function canReceivePush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** The promise's result, or nothing once the cap passes, without leaving a timer running. */
async function withCap<T>(work: Promise<T>, capMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const capped = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, capMs);
  });
  try {
    await Promise.race([work.then(() => undefined), capped]);
  } finally {
    clearTimeout(timer);
  }
}

export async function releaseDeviceBeforeSignOut(capMs: number = DEFAULT_CAP_MS): Promise<void> {
  if (!canReceivePush()) {
    return;
  }

  let endpoint: string | null = null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(WORKER_URL);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) {
      return;
    }
    endpoint = subscription.endpoint;
    await withCap(subscription.unsubscribe(), capMs);
  } catch {
    // Whatever stopped the local step, the API is still asked below.
  }

  if (endpoint === null) {
    return;
  }
  try {
    void fetch("/api/backend/notifications/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Nothing more can be done from here.
  }
}

/**
 * For a page people reach when they are not signed in, such as the sign-in
 * page: releases the device only if there is really no session. A signed-in
 * person who happens to open that page keeps their notifications.
 */
export async function releaseDeviceIfSignedOut(): Promise<void> {
  if (!canReceivePush()) {
    return;
  }
  try {
    const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    const body = (await response.json()) as { user: unknown };
    if (!body.user) {
      await releaseDeviceBeforeSignOut();
    }
  } catch {
    // Not knowing is a reason to leave things as they are.
  }
}
