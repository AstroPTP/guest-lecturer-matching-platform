import { Auth0Client } from '@auth0/nextjs-auth0/server';

/**
 * The Auth0 client, constructed on first use rather than on import.
 *
 * The constructor throws when the Auth0 environment variables are absent, and
 * it used to run as soon as this module was imported. Anything importing it,
 * the proxy and the API route handler, therefore failed to build wherever
 * those variables are not set, which is every CI run. The pipeline has no
 * tenant credentials and should not need any to compile the application.
 *
 * Deferring construction to the first property access keeps the same public
 * shape, `auth0.middleware(...)` and `auth0.getSession()`, while moving the
 * requirement from build time to request time, which is where it belongs. A
 * missing variable now fails the request that needs it, with the real message,
 * instead of failing the build with a stack trace about module evaluation.
 */
let client;

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