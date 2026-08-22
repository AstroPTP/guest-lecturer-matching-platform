/**
 * Auth configuration for the frontend.
 *
 * Server-side only values have no NEXT_PUBLIC_ prefix and must not gain one:
 * the token endpoint is called from a route handler, never from the browser.
 */

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(
      `${name} is not set. Copy frontend/.env.example to frontend/.env.local ` +
        'and fill in the values.',
    );
  }
  return value.trim();
}

/** Bare tenant host, no scheme — same rule as the backend's AUTH0_DOMAIN. */
export function authDomain(): string {
  return required('AUTH0_DOMAIN', process.env.AUTH0_DOMAIN);
}

export function authAudience(): string {
  return required('AUTH0_AUDIENCE', process.env.AUTH0_AUDIENCE);
}

/** Loopback runs the dev IdP over http; a real tenant is always https. */
export function authOrigin(): string {
  const domain = authDomain();
  const loopback =
    domain.startsWith('localhost') || domain.startsWith('127.0.0.1');
  return `${loopback ? 'http' : 'https'}://${domain}`;
}

export function backendUrl(): string {
  return required(
    'BACKEND_URL',
    process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL,
  ).replace(/\/$/, '');
}

/** Roles claim, namespaced per SAS 2.5.2 Interface 5. */
export const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';

/** Name of the HttpOnly cookie holding the access token. */
export const SESSION_COOKIE = 'glma_session';

/**
 * Whether the dev login route exists at all.
 *
 * It exchanges an email for a signed token with no password, so it is an
 * authentication bypass wherever it is reachable. The route returns 404 unless
 * this is explicitly true, and it is never true in a deployed environment.
 */
export function devLoginEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEV_LOGIN === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}
