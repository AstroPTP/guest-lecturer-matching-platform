import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import * as webPush from 'web-push';
import { prisma, resolveUserId } from '../prisma';

/**
 * Pushed notifications, the Web Push protocol with VAPID.
 *
 * Every notice raised in the application is also sent to the phones and
 * computers the person has chosen to receive them on. The browser's own push
 * service (Google, Mozilla, Apple or Microsoft, depending on the browser)
 * carries the message, so there is no mail server and no outside account to
 * set up. The only configuration is a key pair, and without it all of this is
 * off.
 *
 * Plain functions rather than an injectable, so the notifications service and
 * the routes need one import and no module dependency.
 */

const logger = new Logger('Push');

/** The most devices one person can have set up. A newer one replaces the least recently used. */
export const MAX_SUBSCRIPTIONS_PER_USER = 5;

/** The longest body a push carries, in characters. */
export const BODY_LIMIT = 140;

/** The longest push address stored. Real ones are a few hundred characters. */
export const MAX_ENDPOINT_LENGTH = 2048;

/** How long the push service holds a message for a device that is switched off. */
const TTL_SECONDS = 24 * 60 * 60;

/** How long to wait for a push service to answer before giving up on it. */
const SEND_TIMEOUT_MS = 10_000;

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** What a push is built from: the parts of a notice a device is shown. */
export interface PushNotice {
  title: string;
  description: string;
  href: string;
}

/** The whole of what leaves the server for a device. Nothing else is added to it. */
export interface PushPayload {
  title: string;
  body: string;
  href: string;
}

let warnedAboutConfig = false;

/**
 * The key pair and contact address, or null when any of the three is missing
 * or malformed. Read from the environment each time it is needed, so the
 * result is never stale and a test can switch push on and off.
 *
 * A malformed value turns push off instead of stopping the application: push
 * is an extra, and a typo in it should not take sign-in down.
 */
export function readPushConfig(
  env: NodeJS.ProcessEnv = process.env,
): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.VAPID_SUBJECT?.trim() ?? '';
  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  // A public key is an uncompressed P-256 point (65 bytes, starting 0x04) and a
  // private key is its 32-byte scalar, both as URL-safe base64.
  const publicBytes = Buffer.from(publicKey, 'base64url');
  const privateBytes = Buffer.from(privateKey, 'base64url');
  const valid =
    publicBytes.length === 65 &&
    publicBytes[0] === 0x04 &&
    privateBytes.length === 32 &&
    (/^mailto:.+@.+/.test(subject) || /^https:\/\/.+/.test(subject));
  if (!valid) {
    if (!warnedAboutConfig) {
      warnedAboutConfig = true;
      logger.warn(
        'Push notifications are off: the VAPID settings are present but not valid.',
      );
    }
    return null;
  }

  return { publicKey, privateKey, subject };
}

/** Whether pushed notifications are switched on. */
export function pushEnabled(): boolean {
  return readPushConfig() !== null;
}

/** The public key a browser needs to subscribe, or nothing when push is off. */
export function publicKeyStatus(): {
  enabled: boolean;
  publicKey: string | null;
} {
  const config = readPushConfig();
  return { enabled: config !== null, publicKey: config?.publicKey ?? null };
}

/** Push services whose full address is known. */
const PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

/** Push services that use a different subdomain per region or per device. */
const PUSH_HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com'];

/**
 * The push address in its canonical form, or null when it is not one this
 * application will send to.
 *
 * The server makes an HTTPS request to whatever address a browser reports, so
 * an unchecked one would let a signed-in user have the server call any host it
 * can reach, internal ones included. Only https, on the default port, with no
 * credentials, at a known push service, is accepted.
 *
 * The address that is stored and used is the parser's own serialisation, not
 * the string that arrived. The library that sends the request parses addresses
 * with an older parser than the one used here, and the two can disagree about
 * which host a string with backslashes or similar names. Handing it the
 * canonical form leaves nothing for them to disagree about.
 */
export function normalisePushEndpoint(raw: string): string | null {
  if (raw.length > MAX_ENDPOINT_LENGTH) {
    return null;
  }
  // Whitespace, backslashes and control characters are where parsers differ.
  // eslint-disable-next-line no-control-regex
  if (/[\s\\\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return null;
  }

  const host = url.hostname;
  const known =
    PUSH_HOSTS.has(host) ||
    PUSH_HOST_SUFFIXES.some(
      (suffix) => host.endsWith(suffix) && host.length > suffix.length,
    );
  return known ? url.href : null;
}

/** An href that stays on this site: a path, never a full address or a protocol-relative one. */
function safeHref(href: string): string {
  return href.startsWith('/') && !href.startsWith('//') && !/[\\\s]/.test(href)
    ? href
    : '/';
}

/** The text cut to the limit at a whole character, with an ellipsis when something was left out. */
function truncate(text: string, limit: number): string {
  const characters = Array.from(text.trim());
  if (characters.length <= limit) {
    return characters.join('');
  }
  return (
    characters
      .slice(0, limit - 1)
      .join('')
      .trimEnd() + '…'
  );
}

/**
 * What a device is sent. Exactly three fields: the notice's title, its
 * description cut to 140 characters, and where it leads. The recipient, the
 * notice type and the id stay on the server.
 */
export function buildPayload(notice: PushNotice): PushPayload {
  return {
    title: notice.title,
    body: truncate(notice.description, BODY_LIMIT),
    href: safeHref(notice.href),
  };
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error;
    return typeof statusCode === 'number' ? statusCode : undefined;
  }
  return undefined;
}

/**
 * Sends one notice to every device the given people have set up, and returns
 * how many devices the push services accepted it for.
 *
 * Never throws. A device the push service says is gone (404 or 410) is
 * deleted, so it is not tried again. Any other failure is logged by status
 * only: the error object is left out because it carries the device's address.
 */
async function deliver(userIds: bigint[], notice: PushNotice): Promise<number> {
  const config = readPushConfig();
  if (!config || userIds.length === 0) {
    return 0;
  }

  try {
    const devices = await prisma.push_subscriptions.findMany({
      where: { user_id: { in: userIds } },
      select: {
        subscription_id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });
    if (devices.length === 0) {
      return 0;
    }

    const message = JSON.stringify(buildPayload(notice));
    const accepted: bigint[] = [];
    const gone: bigint[] = [];

    await Promise.all(
      devices.map(async (device) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth },
            },
            message,
            {
              vapidDetails: {
                subject: config.subject,
                publicKey: config.publicKey,
                privateKey: config.privateKey,
              },
              TTL: TTL_SECONDS,
              urgency: 'normal',
              timeout: SEND_TIMEOUT_MS,
            },
          );
          accepted.push(device.subscription_id);
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) {
            gone.push(device.subscription_id);
          } else {
            logger.warn(
              `A push was not delivered (${status ?? (error instanceof Error ? error.name : 'unknown error')})`,
            );
          }
        }
      }),
    );

    if (gone.length > 0) {
      await prisma.push_subscriptions.deleteMany({
        where: { subscription_id: { in: gone } },
      });
    }
    if (accepted.length > 0) {
      await prisma.push_subscriptions.updateMany({
        where: { subscription_id: { in: accepted } },
        data: { last_used_at: new Date() },
      });
    }
    return accepted.length;
  } catch (error) {
    logger.warn(
      `Pushes were not sent (${error instanceof Error ? error.name : 'unknown error'})`,
    );
    return 0;
  }
}

/**
 * Sends a notice to the given people's devices without making the caller wait,
 * and without the caller ever hearing of a failure. The returned promise never
 * rejects; it is returned only so a test can wait for the sending to finish.
 */
export function pushToUsers(
  userIds: bigint[],
  notice: PushNotice,
): Promise<number> {
  // Started inside .then() so that even a synchronous throw lands in the
  // catch instead of failing the request that raised the notice.
  return Promise.resolve()
    .then(() => deliver(userIds, notice))
    .catch(() => 0);
}

/** Refuses the request when push is off. */
function requirePush(): void {
  if (!pushEnabled()) {
    throw new NotFoundException('Notifications are not switched on here.');
  }
}

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Stores a device for the caller. Subscribing again with the same address
 * updates it, and moves it to the caller if someone else had it: one browser
 * has one address, and the person signed in on it now is who it is for.
 *
 * Keeps at most five devices per person by removing the least recently used.
 */
export async function saveSubscription(
  callerId: string,
  input: SubscriptionInput,
  userAgent?: string,
): Promise<{ subscribed: true }> {
  requirePush();

  const endpoint = normalisePushEndpoint(input.endpoint);
  if (!endpoint) {
    throw new BadRequestException(
      'That device address is not from a push service this application can use.',
    );
  }

  const userId = await resolveUserId(callerId);
  const now = new Date();
  const agent = userAgent?.trim().slice(0, 200) || null;

  await prisma.push_subscriptions.upsert({
    where: { endpoint },
    create: {
      user_id: userId,
      endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: agent,
      last_used_at: now,
    },
    update: {
      user_id: userId,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: agent,
      last_used_at: now,
    },
  });

  const surplus = await prisma.push_subscriptions.findMany({
    where: { user_id: userId },
    orderBy: [{ last_used_at: 'desc' }, { subscription_id: 'desc' }],
    skip: MAX_SUBSCRIPTIONS_PER_USER,
    select: { subscription_id: true },
  });
  if (surplus.length > 0) {
    await prisma.push_subscriptions.deleteMany({
      where: {
        subscription_id: { in: surplus.map((row) => row.subscription_id) },
      },
    });
  }

  return { subscribed: true };
}

/**
 * Removes the caller's own device with this address. Another person's device
 * is never touched: the delete is filtered by the caller as well as the
 * address, and asking for one that is not theirs removes nothing.
 */
export async function removeSubscription(
  callerId: string,
  endpoint: string,
): Promise<{ removed: boolean }> {
  const userId = await resolveUserId(callerId);
  const { count } = await prisma.push_subscriptions.deleteMany({
    where: {
      user_id: userId,
      endpoint: normalisePushEndpoint(endpoint) ?? endpoint,
    },
  });
  return { removed: count > 0 };
}

/**
 * Sends a short test to the caller's own devices and reports how many were
 * reached. Waits for the push services, since the answer is what the person
 * asked for.
 */
export async function sendTest(callerId: string): Promise<{ sent: number }> {
  requirePush();

  const userId = await resolveUserId(callerId);
  const sent = await pushToUsers([userId], {
    title: 'Curtin GLMP',
    description: 'Notifications are working on this device.',
    href: '/',
  });
  return { sent };
}
