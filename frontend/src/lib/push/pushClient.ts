import { BackendError } from "@/lib/api/backendClient";
import { subscribePush, unsubscribePush } from "@/services/notifications/pushService";
import type { PushStatus } from "@/types/notifications/pushTypes";

/**
 * The browser's side of pushed notifications: permission, the service worker
 * and the subscription. Nothing here runs until a person asks, except reading
 * the current state.
 */

const WORKER_URL = "/sw.js";

/** Whether this browser can receive pushed notifications at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** An iPhone or iPad. An iPad can report itself as a Mac, so touch is checked too. */
function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Whether the site is open from the Home Screen rather than in a browser tab. */
function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Whether notifications could work here after a step the person takes: an
 * iPhone or iPad only receives them once the site is on the Home Screen, so
 * it is worth telling them how.
 */
export function canOfferPush(): boolean {
  return pushSupported() || (isAppleMobile() && !isInstalled());
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) {
    return false;
  }
  const view = new Uint8Array(a);
  return view.every((byte, index) => byte === b[index]);
}

/** The subscription this browser already holds for the site, if any, without registering anything. */
async function existingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER_URL);
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Where this device stands. Reads state only; it neither asks for permission nor registers anything. */
export async function readPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "blocked";
  }
  if (Notification.permission !== "granted") {
    return "off";
  }
  try {
    return (await existingSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

function toBody(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("This browser did not return a complete subscription.");
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Turns notifications on for this device. Call it from a click: it asks the
 * browser for permission, which browsers allow only in answer to one.
 *
 * Registers the service worker, subscribes with the server's key and tells the
 * API. If the API refuses, the browser's subscription is dropped again so the
 * page never claims notifications are on when the server has no record of them.
 *
 * @returns the status afterwards. "blocked" when the person says no.
 */
export async function turnOnPush(publicKey: string): Promise<PushStatus> {
  if (!pushSupported()) {
    return "unsupported";
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return "blocked";
  }
  if (permission !== "granted") {
    return "off";
  }

  await navigator.serviceWorker.register(WORKER_URL, { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const key = urlBase64ToBytes(publicKey);

  const subscribe = () => registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with another key, from before the server's key changed,
  // cannot be used with this one.
  if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await subscribe();

  try {
    try {
      await subscribePush(toBody(subscription));
    } catch (error) {
      // The server holds this address with keys this browser does not have, so
      // it cannot be this subscription. A new subscription has a new address.
      if (!(error instanceof BackendError && error.status === 409)) {
        throw error;
      }
      await subscription.unsubscribe();
      subscription = await subscribe();
      await subscribePush(toBody(subscription));
    }
  } catch (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }

  return "on";
}

/** Turns notifications off for this device: tells the API, then drops the browser's subscription. */
export async function turnOffPush(): Promise<void> {
  if (!pushSupported()) {
    return;
  }
  const subscription = await existingSubscription();
  if (!subscription) {
    return;
  }
  try {
    await unsubscribePush(subscription.endpoint);
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}
