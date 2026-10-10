import { Auth0Client, filterDefaultIdTokenClaims } from '@auth0/nextjs-auth0/server';

let client;

/** The namespaced claim the identity provider puts roles in. */
const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';

/** The payload of a JWT, or an empty object if it cannot be read. */
function claimsOf(token) {
  const payload = typeof token === 'string' ? token.split('.')[1] : undefined;
  if (!payload) {
    return {};
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
  } catch {
    return {};
  }
}

/**
 * The account's roles, from the ID token or else the access token.
 *
 * Both tokens come straight from the tenant's token endpoint during the
 * server-side code exchange, so reading the access token's payload here is
 * safe. It only decides which page to show; the API still verifies the
 * token's signature and role on every request.
 */
function rolesFrom(session) {
  for (const claims of [session.user, claimsOf(session.tokenSet?.accessToken)]) {
    const roles = claims?.[ROLES_CLAIM];
    if (Array.isArray(roles)) {
      return roles.filter((role) => typeof role === 'string');
    }
  }
  return [];
}

/**
 * Whether the tenant is configured well enough to construct a client.
 *
 * The SDK needs a bare hostname, a client id and a secret, and throws without
 * them. Checked rather than caught so that a page renders signed-out instead
 * of returning a server error on every route.
 */
export function auth0Configured() {
  const domain = process.env.AUTH0_DOMAIN ?? '';
  return Boolean(
    domain &&
      !domain.includes(':') &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_SECRET,
  );
}

function instance() {
  client ??= new Auth0Client({
    authorizationParameters: {
      audience: process.env.AUTH0_AUDIENCE,
      scope: 'openid profile email',
    },
    // Without this hook the SDK keeps only the standard OIDC claims in
    // session.user and drops the roles claim, so the administrator check in
    // the middleware saw no roles and turned every account away, including
    // real administrators.
    async beforeSessionSaved(session) {
      return {
        ...session,
        user: {
          ...filterDefaultIdTokenClaims(session.user),
          [ROLES_CLAIM]: rolesFrom(session),
        },
      };
    },
  });
  return client;
}

/** @type {import('@auth0/nextjs-auth0/server').Auth0Client} */
export const auth0 = /** @type {any} */ (
  new Proxy(
    {},
    {
      get(_target, property) {
        const value = instance()[property];
        return typeof value === 'function' ? value.bind(instance()) : value;
      },
    },
  )
);