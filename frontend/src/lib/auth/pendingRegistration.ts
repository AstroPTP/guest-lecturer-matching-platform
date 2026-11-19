import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';

/**
 * Registration details held between the register form and the OTP page.
 * Server-side only.
 *
 * The password account is created after the email is verified, so the name,
 * password and role have to survive the trip to /verify. They are kept in an
 * HttpOnly cookie, encrypted and authenticated with a key derived from
 * AUTH0_SECRET. The browser only ever holds ciphertext it cannot read or
 * alter, and no script on the page can reach the password, which is what
 * keeping it in sessionStorage allowed.
 */

export interface PendingRegistration {
  email: string;
  fullName: string;
  password: string;
  role: 'guest' | 'coordinator';
}

export const PENDING_REGISTRATION_COOKIE = '__pending_registration';

/** Long enough to find the email and type the code; short enough to expire. */
const LIFETIME_SECONDS = 15 * 60;

/** Sent only to the two routes that use it. */
const COOKIE_PATH = '/api/auth/register';

function key(): Buffer {
  const secret = process.env.AUTH0_SECRET;
  if (!secret) {
    throw new Error('AUTH0_SECRET is not set.');
  }
  // A key of its own, so this cookie never shares one with the SDK session.
  return Buffer.from(hkdfSync('sha256', secret, '', 'pending-registration', 32));
}

function seal(value: PendingRegistration): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const payload = JSON.stringify({ ...value, exp: Date.now() + LIFETIME_SECONDS * 1000 });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

/** The stored details, or null when missing, expired, altered or unreadable. */
export function readPendingRegistration(sealed: string | undefined): PendingRegistration | null {
  if (!sealed) return null;
  try {
    const [iv, tag, encrypted] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'),
    ) as Partial<PendingRegistration> & { exp?: number };

    if (
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now() ||
      typeof payload.email !== 'string' ||
      typeof payload.fullName !== 'string' ||
      typeof payload.password !== 'string' ||
      (payload.role !== 'guest' && payload.role !== 'coordinator')
    ) {
      return null;
    }
    return {
      email: payload.email,
      fullName: payload.fullName,
      password: payload.password,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: (process.env.APP_BASE_URL ?? '').startsWith('https://'),
  path: COOKIE_PATH,
};

export function storePendingRegistration(response: NextResponse, value: PendingRegistration): void {
  response.cookies.set(PENDING_REGISTRATION_COOKIE, seal(value), {
    ...cookieOptions,
    maxAge: LIFETIME_SECONDS,
  });
}

export function clearPendingRegistration(response: NextResponse): void {
  response.cookies.set(PENDING_REGISTRATION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
}
