/**
 * Startup validation for the backend's environment.
 *
 * Every variable the application depends on is checked once, at boot, before
 * Nest builds the module graph. A missing or malformed value stops the process
 * with a message naming every problem at once.
 *
 * The alternative — reading process.env at the point of use and falling back to
 * a default — is what we are deliberately avoiding. A backend that starts
 * without AUTH0_DOMAIN cannot verify a single token, so it answers 401 to
 * every request and looks like a broken guard rather than a missing variable.
 * Failing at boot points straight at the cause.
 *
 * See backend/.env.example for what each variable is and where to obtain it.
 */

export interface AppEnv {
  nodeEnv: string;
  port: number;
  /** Exact frontend origins permitted by CORS. Never empty, never a wildcard. */
  allowedOrigins: string[];
  /** Auth0 tenant domain, no scheme. e.g. glma-dev.au.auth0.com */
  auth0Domain: string;
  /** The Auth0 API identifier. Compared against the token's `aud`. */
  auth0Audience: string;
  /**
   * Namespaced roles claim. Auth0 silently drops custom claims whose names
   * are not URIs, so the namespace is not decoration. Configurable only so the
   * tests and the dev IdP can drive it. Do not change it in .env.
   */
  auth0RolesClaim: string;
  databaseUrl: string;
  directUrl: string;
}

/** Collects failures so one boot reports every problem, not just the first. */
class EnvErrors {
  private readonly messages: string[] = [];

  add(variable: string, problem: string): void {
    this.messages.push(`  ${variable} — ${problem}`);
  }

  throwIfAny(): void {
    if (this.messages.length === 0) {
      return;
    }
    throw new Error(
      `Environment validation failed:\n${this.messages.join('\n')}\n\n` +
        'Copy backend/.env.example to backend/.env and fill in the values.',
    );
  }
}

function readString(
  source: NodeJS.ProcessEnv,
  name: string,
  errors: EnvErrors,
): string {
  const raw = source[name]?.trim();
  if (!raw) {
    errors.add(name, 'is required but was not set');
    return '';
  }
  return raw;
}

/**
 * AUTH0_DOMAIN is a bare host — no scheme, no path, no trailing slash.
 *
 * It is pasted out of the Auth0 dashboard, where it is displayed bare, but
 * people reflexively add https://. Both forms would then be used to build the
 * issuer string that is compared against the token's `iss` claim, and a
 * mismatch there produces a 401 that looks nothing like a configuration
 * error. Rejecting the wrong shape here is cheaper than debugging that.
 */
function readDomain(source: NodeJS.ProcessEnv, errors: EnvErrors): string {
  const raw = readString(source, 'AUTH0_DOMAIN', errors);
  if (!raw) {
    return '';
  }

  if (raw.includes('://')) {
    errors.add(
      'AUTH0_DOMAIN',
      `must be a bare host with no scheme, got "${raw}" ` +
        `(try "${raw.replace(/^https?:\/\//, '').replace(/\/$/, '')}")`,
    );
    return '';
  }

  if (raw.includes('/')) {
    errors.add('AUTH0_DOMAIN', `must not contain a path, got "${raw}"`);
    return '';
  }

  return raw;
}

function readPort(source: NodeJS.ProcessEnv, errors: EnvErrors): number {
  const raw = source.PORT?.trim();
  if (!raw) {
    errors.add('PORT', 'is required but was not set');
    return 0;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.add('PORT', `must be an integer between 1 and 65535, got "${raw}"`);
    return 0;
  }

  return port;
}

/**
 * Comma-separated list of exact origins. Deliberately strict: an origin is
 * scheme + host + optional port and nothing else. A wildcard is rejected
 * outright because CORS is configured with credentials enabled, and
 * `origin: '*'` with credentials is the misconfiguration this is meant to
 * catch: the browser would send cookies to any site that asked.
 */
function readAllowedOrigins(
  source: NodeJS.ProcessEnv,
  errors: EnvErrors,
): string[] {
  const raw = readString(source, 'FRONTEND_URL', errors);
  if (!raw) {
    return [];
  }

  const origins = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (origins.length === 0) {
    errors.add('FRONTEND_URL', 'contained no origins');
    return [];
  }

  const valid: string[] = [];
  for (const origin of origins) {
    if (origin === '*') {
      errors.add(
        'FRONTEND_URL',
        'must not be "*" — CORS runs with credentials enabled, so the ' +
          'allowlist has to name real origins',
      );
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      errors.add('FRONTEND_URL', `contains an invalid origin: "${origin}"`);
      continue;
    }

    if (parsed.origin !== origin) {
      errors.add(
        'FRONTEND_URL',
        `"${origin}" must be a bare origin with no path or trailing slash ` +
          `(expected "${parsed.origin}")`,
      );
      continue;
    }

    valid.push(origin);
  }

  return valid;
}

/**
 * Validates `source` and returns the typed, frozen environment.
 *
 * Takes the environment as an argument rather than reading the global so the
 * tests can drive it directly without mutating process.env.
 *
 * @throws Error listing every variable that failed.
 */
/**
 * Auth0's issuer is the tenant domain with a scheme and a trailing slash, and
 * the trailing slash is not optional — it is compared against the token's
 * `iss` claim as an exact string. Deriving both this and the JWKS URI from
 * AUTH0_DOMAIN means there is one variable to get wrong instead of three.
 */
export function auth0Issuer(domain: string): string {
  return `${domainOrigin(domain)}/`;
}

export function auth0JwksUri(domain: string): string {
  return `${domainOrigin(domain)}/.well-known/jwks.json`;
}

/**
 * Local development points AUTH0_DOMAIN at the dev IdP on localhost, which
 * has no TLS. Anything else must be https — a tenant reached over plain http
 * would put tokens on the wire in clear.
 */
function domainOrigin(domain: string): string {
  const isLoopback =
    domain.startsWith('localhost') || domain.startsWith('127.0.0.1');
  return `${isLoopback ? 'http' : 'https'}://${domain}`;
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const errors = new EnvErrors();

  const env: AppEnv = {
    nodeEnv: source.NODE_ENV?.trim() || 'development',
    port: readPort(source, errors),
    allowedOrigins: readAllowedOrigins(source, errors),
    auth0Domain: readDomain(source, errors),
    auth0Audience: readString(source, 'AUTH0_AUDIENCE', errors),
    auth0RolesClaim:
      source.AUTH0_ROLES_CLAIM?.trim() || 'https://glmp.curtin.edu.au/roles',
    databaseUrl: readString(source, 'DATABASE_URL', errors),
    directUrl: readString(source, 'DIRECT_URL', errors),
  };

  errors.throwIfAny();

  return Object.freeze(env);
}
