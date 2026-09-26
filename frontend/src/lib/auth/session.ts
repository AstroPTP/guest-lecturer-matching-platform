import { auth0 } from '@/lib/auth0';

/**
 * Reading the signed-in user, server-side only.
 *
 * The access token lives in the session the Auth0 SDK manages, and it is read
 * here on the server and nowhere else. Nothing in this file runs in the
 * browser, and the token is never returned to it: /api/backend attaches it to
 * outbound calls, and /api/auth/session returns claims without it.
 *
 * That is what makes the token unreachable from JavaScript. It cannot be read
 * from document.cookie, cannot be lifted by injected script, and never lands in
 * a variable the page can see.
 */

/** What the browser is allowed to know about the signed-in user. */
export interface SessionClaims {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  exp?: number;
}

/**
 * The namespaced claim the identity provider puts roles in.
 *
 * The namespace is not decoration. Auth0 silently discards custom claims whose
 * name is not a URI, so a claim called plain `roles` never reaches the token at
 * all and nothing reports why.
 */
const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';

/**
 * The raw access token, for attaching to a backend call server-side.
 *
 * Goes through getAccessToken() rather than reading the session directly, so
 * an expired token is refreshed (when a refresh token exists) instead of being
 * sent and rejected. Call this from a route handler, where the SDK can write
 * the updated session cookie; a Server Component cannot.
 *
 * Returns null rather than throwing when there is no session, or the token
 * cannot be refreshed, so a caller can treat signed-out as an ordinary case.
 */
export async function readAccessToken(): Promise<string | null> {
  const session = await auth0.getSession();
  if (!session) {
    return null;
  }
  try {
    const { token } = await auth0.getAccessToken();
    return token ?? null;
  } catch {
    return null;
  }
}

/**
 * The claims describing the signed-in user.
 *
 * Roles are read from the token the provider issued. A missing or malformed
 * claim yields an empty array, never a default role: if the Post-Login Action
 * that populates it is disabled or fails, every guarded route closes rather
 * than opening. The backend enforces the same rule independently, so this is
 * for rendering, not for access decisions.
 */
export async function readSessionClaims(): Promise<SessionClaims | null> {
  const session = await auth0.getSession();
  if (!session?.user) {
    return null;
  }

  const raw = (session.user as Record<string, unknown>)[ROLES_CLAIM];
  const roles = Array.isArray(raw)
    ? raw.filter((r): r is string => typeof r === 'string')
    : [];

  return {
    sub: String(session.user.sub ?? ''),
    email: typeof session.user.email === 'string' ? session.user.email : undefined,
    name: typeof session.user.name === 'string' ? session.user.name : undefined,
    roles,
  };
}
