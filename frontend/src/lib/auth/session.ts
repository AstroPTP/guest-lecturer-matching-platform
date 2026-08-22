import { cookies } from 'next/headers';
import { ROLES_CLAIM, SESSION_COOKIE } from './config';

/**
 * Server-side session handling.
 *
 * The access token lives in an HttpOnly cookie and is read only here, on the
 * server. It is never returned to the browser and never placed anywhere
 * JavaScript can reach — which is what checklist items TAM-01 and TAM-02
 * actually test for. Calls to the NestJS API go through the route handler at
 * /api/backend, which attaches the token server-side.
 */

export interface SessionClaims {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  exp: number;
}

/**
 * Decodes a token WITHOUT verifying it.
 *
 * Safe only because of where it is used: to render a name and choose a menu.
 * Nothing here is an access decision. Every actual authorisation decision is
 * made by the NestJS guards, which verify the RS256 signature against the
 * tenant's published keys on every single request. If this decoded a forged
 * token, the holder would see a different sidebar and still be refused by the
 * backend.
 */
export function decodeClaims(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (typeof payload.sub !== 'string') {
      return null;
    }

    const claimed = payload[ROLES_CLAIM];

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      // Missing claim means no roles, matching the backend's RolesGuard.
      roles: Array.isArray(claimed)
        ? claimed.filter((r): r is string => typeof r === 'string')
        : [],
      exp: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

/** The raw token. Server-side callers only — never send this to the browser. */
export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function readSessionClaims(): Promise<SessionClaims | null> {
  const token = await readAccessToken();
  if (!token) {
    return null;
  }

  const claims = decodeClaims(token);
  if (!claims) {
    return null;
  }

  // An expired token is treated as no session, so the UI does not show a
  // logged-in state whose every request comes back 401.
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    return null;
  }

  return claims;
}

/** Cookie options. Every flag here is doing a job. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    // Unreachable from document.cookie — TAM-01.
    httpOnly: true,
    // Not sent over plain http outside development — TAM-02.
    secure: process.env.NODE_ENV === 'production',
    // Not attached to cross-site requests, which is the CSRF control.
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
