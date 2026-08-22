/*
 * Development identity provider — a stand-in for our Auth0 tenant.
 *
 * WHY THIS EXISTS
 * ---------------
 * The backend guards verify an RS256 signature against a published JWKS. That
 * needs an identity provider, and until the real Auth0 tenant is configured
 * there isn't one — which would mean shipping auth code nobody had ever run.
 * This serves a JWKS and mints tokens of exactly the shape Auth0 issues, so
 * the whole flow is exercisable today with no account and no network.
 *
 * The guards cannot tell it from a real tenant. Moving to the real one is
 * AUTH0_DOMAIN in backend/.env and nothing else.
 *
 * WHY IT IS DANGEROUS, AND WHAT STOPS IT
 * --------------------------------------
 * It mints signed tokens for anyone who asks, with any role they name. In
 * production that is a total authentication bypass. Three things prevent it,
 * and none of them are decoration:
 *
 *   1. It refuses to start when NODE_ENV=production.
 *   2. It binds 127.0.0.1 only, never 0.0.0.0, so it is unreachable off-host
 *      even if it is somehow running.
 *   3. It lives outside backend/ and frontend/, so neither build can import it
 *      and it cannot be bundled into a deployed artefact by accident.
 *
 * If you are tempted to relax any of those to make something work, the thing
 * you actually want is the real tenant.
 *
 * Author: Naveen Fernando (security). Jira KAN-223.
 */

'use strict';

const { generateKeyPairSync, createSign, randomUUID } = require('node:crypto');
const { createServer } = require('node:http');

// --- Gate 1: never in production -------------------------------------------
if (process.env.NODE_ENV === 'production') {
  console.error(
    '[dev-idp] refusing to start with NODE_ENV=production.\n' +
      '[dev-idp] This mints signed tokens on demand. Use the real Auth0 tenant.',
  );
  process.exit(1);
}

const PORT = Number(process.env.DEV_IDP_PORT ?? 9099);
const HOST = '127.0.0.1'; // Gate 2. Do not make this configurable.

const ISSUER = `http://${HOST}:${PORT}/`;
const AUDIENCE = process.env.DEV_IDP_AUDIENCE ?? 'https://api.glma.curtin.edu.au';
const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles'; // SAS 2.5.2 Interface 5
const KID = 'dev-idp-key-1';
const TOKEN_TTL_SECONDS = 60 * 60;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

/*
 * Test users. The three SRS roles, plus one holding none — that last account
 * is not padding: EOP-04 requires proving a token with no roles claim is
 * denied rather than defaulted, and you cannot test that without one.
 */
const USERS = {
  'guest@test.local': {
    sub: 'auth0|dev-guest-0001',
    name: 'Grace Guest',
    roles: ['guest_speaker'],
  },
  'coordinator@test.local': {
    sub: 'auth0|dev-coord-0002',
    name: 'Chris Coordinator',
    roles: ['unit_coordinator'],
  },
  'admin@test.local': {
    sub: 'auth0|dev-admin-0003',
    name: 'Alex Administrator',
    roles: ['ccae_admin'],
  },
  'both@test.local': {
    sub: 'auth0|dev-both-0004',
    name: 'Blair Both',
    roles: ['guest_speaker', 'unit_coordinator'],
  },
  'norole@test.local': {
    sub: 'auth0|dev-norole-0005',
    name: 'Unassigned User',
    roles: [],
  },
};

const b64url = (value) => Buffer.from(value).toString('base64url');

function mintAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: user.sub,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    azp: 'dev-idp-client',
    email: user.email,
    name: user.name,
    // Namespaced, because Auth0 silently drops custom claims that are not
    // URIs. Modelling that faithfully is the point — a token from here has to
    // fail and succeed for the same reasons a real one does.
    [ROLES_CLAIM]: user.roles,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);

  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    // The frontend calls /oauth/token from the browser during dev login.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error('body too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const server = createServer((req, res) => {
  const url = new URL(req.url, ISSUER);

  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  // OIDC discovery, so an OIDC client library can be pointed here unchanged.
  if (url.pathname === '/.well-known/openid-configuration') {
    return json(res, 200, {
      issuer: ISSUER,
      jwks_uri: `${ISSUER}.well-known/jwks.json`,
      token_endpoint: `${ISSUER}oauth/token`,
      userinfo_endpoint: `${ISSUER}userinfo`,
      id_token_signing_alg_values_supported: ['RS256'],
      response_types_supported: ['code'],
      grant_types_supported: ['password', 'authorization_code'],
    });
  }

  if (url.pathname === '/.well-known/jwks.json') {
    return json(res, 200, { keys: [jwk] });
  }

  // Who can be logged in as. Drives the demo login's account picker.
  if (url.pathname === '/dev/users') {
    return json(
      res,
      200,
      Object.entries(USERS).map(([email, user]) => ({
        email,
        name: user.name,
        roles: user.roles,
      })),
    );
  }

  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    return readJsonBody(req)
      .then((body) => {
        const email = String(body.username ?? body.email ?? '').toLowerCase();
        const user = USERS[email];

        if (!user) {
          // Same shape Auth0 returns, so the frontend error handling is
          // exercised rather than bypassed.
          return json(res, 403, {
            error: 'invalid_grant',
            error_description: 'Wrong email or password.',
          });
        }

        return json(res, 200, {
          access_token: mintAccessToken({ ...user, email }),
          token_type: 'Bearer',
          expires_in: TOKEN_TTL_SECONDS,
        });
      })
      .catch(() =>
        json(res, 400, { error: 'invalid_request', error_description: 'Bad body.' }),
      );
  }

  return json(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-idp] issuer   ${ISSUER}`);
  console.log(`[dev-idp] audience ${AUDIENCE}`);
  console.log(`[dev-idp] jwks     ${ISSUER}.well-known/jwks.json`);
  console.log('[dev-idp] accounts:');
  for (const [email, user] of Object.entries(USERS)) {
    console.log(`  ${email.padEnd(26)} ${user.roles.join(', ') || '(no roles)'}`);
  }
  console.log(`\n[dev-idp] point backend/.env at:  AUTH0_DOMAIN=${HOST}:${PORT}`);
  console.log(`[dev-idp] request ids: ${randomUUID().slice(0, 8)} session\n`);
});
