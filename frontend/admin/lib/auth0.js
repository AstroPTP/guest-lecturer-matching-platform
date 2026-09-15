import { Auth0Client } from '@auth0/nextjs-auth0/server';

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