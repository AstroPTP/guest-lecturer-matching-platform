import { auth0, auth0Configured } from '@/lib/auth0';

/**
 * Reading the signed-in administrator, server-side only.
 *
 * The access token lives in the session the Auth0 SDK manages and is read here
 * and nowhere else. It is never returned to the browser: the proxy attaches it
 * to outbound calls, and nothing in a page can see it.
 *
 * The portal used to serve the raw token to the browser from an API route so
 * that client code could call the API cross-origin. That is what this replaces.
 */

export interface AdminSessionClaims {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
}

/** The namespaced claim the identity provider puts roles in. */
const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';

export async function readAccessToken(): Promise<string | null> {
  if (!auth0Configured()) {
    return null;
  }

  const session = await auth0.getSession();
  return session?.tokenSet?.accessToken ?? null;
}

export async function readAdminClaims(): Promise<AdminSessionClaims | null> {
  if (!auth0Configured()) {
    return null;
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    return null;
  }

  const raw = (session.user as Record<string, unknown>)[ROLES_CLAIM];
  const roles = Array.isArray(raw)
    ? raw.filter((role): role is string => typeof role === 'string')
    : [];

  return {
    sub: String(session.user.sub ?? ''),
    email: typeof session.user.email === 'string' ? session.user.email : undefined,
    name: typeof session.user.name === 'string' ? session.user.name : undefined,
    roles,
  };
}
