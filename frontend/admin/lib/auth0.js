import { Auth0Client } from '@auth0/nextjs-auth0/server';

let client;

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