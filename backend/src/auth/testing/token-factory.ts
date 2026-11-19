import { generateKeyPairSync, KeyObject, createSign } from 'node:crypto';

/**
 * Builds signed and deliberately malformed tokens for the guard tests.
 *
 * Everything here is generated in-process. No Auth0 tenant, no network and no
 * secret in .env is needed to run the suite, which is what lets the guard
 * tests run in CI and on a machine that has never seen our credentials.
 *
 * Test-only. Never imported by application code.
 */

// Auth0's issuer carries a trailing slash. Getting that wrong is the single
// most common configuration fault, so the fixtures model it faithfully.
export const TEST_DOMAIN = 'test-tenant.au.auth0.com';
export const TEST_ISSUER = `https://${TEST_DOMAIN}/`;
export const TEST_AUDIENCE = 'https://api.glma.test';
export const TEST_ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';
export const TEST_KID = 'test-signing-key';

export interface KeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** The public half, in the JWKS form jwks-rsa would serve. */
  jwk: Record<string, unknown>;
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  return {
    privateKey,
    publicKey,
    jwk: {
      ...publicKey.export({ format: 'jwk' }),
      kid: TEST_KID,
      alg: 'RS256',
      use: 'sig',
    },
  };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface TokenOptions {
  privateKey: KeyObject;
  /** Seconds from now until expiry. Negative produces an expired token. */
  expiresInSeconds?: number;
  issuer?: string;
  audience?: string;
  subject?: string;
  roles?: unknown;
  /** Omits the roles claim entirely, as a token issued with no Action does. */
  omitRolesClaim?: boolean;
  email?: string;
}

/** A well-formed RS256 token. The happy path, and the base every variant bends. */
export function signToken(options: TokenOptions): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT', kid: TEST_KID };

  const payload: Record<string, unknown> = {
    iss: options.issuer ?? TEST_ISSUER,
    aud: options.audience ?? TEST_AUDIENCE,
    sub: options.subject ?? 'auth0|65f1a2b3c4d5e6f7a8b9c0d1',
    iat: now,
    exp: now + (options.expiresInSeconds ?? 3600),
    email: options.email ?? 'test.user@student.curtin.edu.au',
    azp: 'test-client-id',
  };

  if (!options.omitRolesClaim) {
    payload[TEST_ROLES_CLAIM] = options.roles ?? [];
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;

  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64url(signer.sign(options.privateKey));

  return `${signingInput}.${signature}`;
}

/**
 * A token claiming `{"alg":"none"}` with an empty signature. The classic
 * algorithm-confusion attack (checklist SPF-03).
 */
export function signAlgNoneToken(
  subject = 'attacker',
  issuer: string = TEST_ISSUER,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    iss: issuer,
    aud: TEST_AUDIENCE,
    sub: subject,
    iat: now,
    exp: now + 3600,
    [TEST_ROLES_CLAIM]: ['ccae_admin'],
  };

  return `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}.`;
}

/**
 * Takes a valid token, rewrites its payload, and reattaches the original
 * signature. This is what an attacker editing their own roles claim in devtools
 * produces (checklist TAM-04, EOP-03).
 */
export function tamperPayload(
  token: string,
  mutate: (payload: Record<string, unknown>) => void,
): string {
  const [header, payload, signature] = token.split('.');
  const decoded = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;

  mutate(decoded);

  const tampered = `${header}.${base64url(JSON.stringify(decoded))}.${signature}`;

  // A tamper helper that quietly produced the original token again would make
  // every test built on it pass for the wrong reason: the request would be
  // accepted because the token was genuinely valid, not because the guard
  // failed. Fail loudly here instead.
  if (tampered === token) {
    throw new Error(
      'tamperPayload produced an identical token; the mutation changed nothing',
    );
  }

  return tampered;
}
