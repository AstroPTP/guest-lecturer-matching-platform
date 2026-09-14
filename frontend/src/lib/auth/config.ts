/**
 * Auth configuration for the frontend.
 *
 * Server-side only values have no NEXT_PUBLIC_ prefix and must not gain one.
 * The backend is called from a route handler, never from the browser, so its
 * URL and the access token stay on the server.
 */

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(
      `${name} is not set. Copy frontend/.env.local.template to ` +
        'frontend/.env.local and fill in the values.',
    );
  }
  return value.trim();
}

/**
 * Where the NestJS API lives.
 *
 * Read only by /api/backend, which is the single point browser traffic reaches
 * the API through. Trailing slash stripped so path joining stays predictable.
 */
export function backendUrl(): string {
  return required(
    'BACKEND_URL',
    process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL,
  ).replace(/\/$/, '');
}

/**
 * The namespaced roles claim.
 *
 * The namespace is not decoration. Auth0 silently discards custom claims whose
 * name is not a URI, so a claim called plain `roles` never reaches the token
 * and nothing reports why.
 */
export const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';
