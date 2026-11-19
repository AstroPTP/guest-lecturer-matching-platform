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

const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';

/**
 * Session lifetimes, in seconds. They must equal the refresh token lifetimes
 * set on the Auth0 application (Inactivity 3 days, Absolute 7 days). A longer
 * session outlives its refresh token, so pages open but every API call fails;
 * a shorter one signs users out early.
 */
const SESSION_INACTIVITY_SECONDS = 3 * 24 * 60 * 60;
const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60;

function instance() {
  client ??= new Auth0Client({
    // The access token stays on the server. /api/backend attaches it to
    // outbound calls; the SDK's own /auth/access-token route would hand it to
    // the browser, so it is switched off.
    enableAccessTokenEndpoint: false,

    authorizationParameters: {
      audience: process.env.AUTH0_AUDIENCE,
      // offline_access asks for a refresh token. Without one the access token
      // simply expires after an hour and every API call starts failing.
      scope: 'openid profile email offline_access',
    },

    session: {
      rolling: true,
      inactivityDuration: SESSION_INACTIVITY_SECONDS,
      absoluteDuration: SESSION_ABSOLUTE_SECONDS,
    },

    // Refresh a minute early, so a token that is valid when read here does not
    // expire on its way to the backend.
    tokenRefreshBuffer: 60,

    // Without this hook the SDK keeps only the default ID token claims and
    // drops the namespaced roles claim, so the middleware would see no role.
    // Having the hook at all is what turns that filtering off; it passes the
    // claim through explicitly so the intent is visible.
    async beforeSessionSaved(session) {
      const roles = session.user[ROLES_CLAIM];
      return {
        ...session,
        user: {
          ...session.user,
          ...(roles !== undefined ? { [ROLES_CLAIM]: roles } : {}),
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