/** Whether pushed notifications are switched on for this site, and the key a browser subscribes with. */
export interface PushKeyResponse {
  enabled: boolean;
  publicKey: string | null;
}

/** What a browser reports when it subscribes, less the fields the API does not take. */
export interface PushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * How this browser stands on notifications, in the words the settings page uses.
 *
 *   on           notifications are allowed and this device is subscribed
 *   off          nothing has been turned on here
 *   blocked      the person said no in the browser, which only they can undo
 *   unsupported  this browser cannot receive them, as with an iPhone before the
 *                site is added to the Home Screen
 */
export type PushStatus = "on" | "off" | "blocked" | "unsupported";
