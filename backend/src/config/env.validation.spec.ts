import { auth0Issuer, auth0JwksUri, validateEnv } from './env.validation';

/** A complete, valid environment. Each test breaks exactly one thing. */
function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3001',
    FRONTEND_URL: 'http://localhost:3000',
    AUTH0_DOMAIN: 'glma-dev.au.auth0.com',
    AUTH0_AUDIENCE: 'https://glmp-api.curtin.edu.au',
    DATABASE_URL: 'postgresql://user:pass@host:6543/postgres?pgbouncer=true',
    DIRECT_URL: 'postgresql://user:pass@host:5432/postgres',
  };
}

describe('validateEnv', () => {
  it('accepts a complete environment and returns typed values', () => {
    const env = validateEnv(validEnv());

    expect(env.port).toBe(3001);
    expect(env.allowedOrigins).toEqual(['http://localhost:3000']);
    expect(env.auth0Audience).toBe('https://glmp-api.curtin.edu.au');
    expect(env.nodeEnv).toBe('test');
  });

  it('defaults NODE_ENV to development when unset', () => {
    const source = validEnv();
    delete source.NODE_ENV;

    expect(validateEnv(source).nodeEnv).toBe('development');
  });

  it('freezes the result so config cannot drift at runtime', () => {
    const env = validateEnv(validEnv());

    expect(Object.isFrozen(env)).toBe(true);
  });

  describe('required variables', () => {
    const required = [
      'PORT',
      'FRONTEND_URL',
      'AUTH0_DOMAIN',
      'AUTH0_AUDIENCE',
      'DATABASE_URL',
      'DIRECT_URL',
    ];

    it.each(required)('throws when %s is missing', (name) => {
      const source = validEnv();
      delete source[name];

      expect(() => validateEnv(source)).toThrow(name);
    });

    it.each(required)('throws when %s is blank', (name) => {
      const source = validEnv();
      source[name] = '   ';

      expect(() => validateEnv(source)).toThrow(name);
    });
  });

  it('reports every failure at once rather than only the first', () => {
    const source = validEnv();
    delete source.PORT;
    delete source.AUTH0_DOMAIN;
    delete source.DIRECT_URL;

    // One boot should tell you about all three, not send you round three times.
    expect(() => validateEnv(source)).toThrow(/PORT[\s\S]*AUTH0_DOMAIN/);
    expect(() => validateEnv(source)).toThrow(/DIRECT_URL/);
  });

  describe('PORT', () => {
    it.each(['0', '65536', '-1', 'not-a-number', '3001.5'])(
      'rejects %s',
      (value) => {
        const source = validEnv();
        source.PORT = value;

        expect(() => validateEnv(source)).toThrow('PORT');
      },
    );
  });

  describe('AUTH0_DOMAIN', () => {
    // The dashboard shows the domain bare, but people reflexively paste a
    // scheme. Both forms would build a different issuer string and 401
    // everything with no clue why.
    it.each(['https://glma-dev.au.auth0.com', 'http://glma-dev.au.auth0.com'])(
      'rejects %s because it carries a scheme',
      (value) => {
        const source = validEnv();
        source.AUTH0_DOMAIN = value;

        expect(() => validateEnv(source)).toThrow('AUTH0_DOMAIN');
      },
    );

    it('suggests the corrected value in the error', () => {
      const source = validEnv();
      source.AUTH0_DOMAIN = 'https://glma-dev.au.auth0.com/';

      expect(() => validateEnv(source)).toThrow('glma-dev.au.auth0.com');
    });

    it('rejects a domain carrying a path', () => {
      const source = validEnv();
      source.AUTH0_DOMAIN = 'glma-dev.au.auth0.com/authorize';

      expect(() => validateEnv(source)).toThrow('AUTH0_DOMAIN');
    });
  });

  describe('derived Auth0 URLs', () => {
    // Auth0's issuer has a trailing slash and it is not optional — it is
    // compared against the token's `iss` claim as an exact string.
    it('builds the issuer with its trailing slash', () => {
      expect(auth0Issuer('glma-dev.au.auth0.com')).toBe(
        'https://glma-dev.au.auth0.com/',
      );
    });

    it('builds the JWKS uri', () => {
      expect(auth0JwksUri('glma-dev.au.auth0.com')).toBe(
        'https://glma-dev.au.auth0.com/.well-known/jwks.json',
      );
    });

    // The dev IdP runs on loopback with no TLS; a real tenant must be https.
    it.each(['localhost:9099', '127.0.0.1:9099'])(
      'uses http for %s so the dev IdP works',
      (domain) => {
        expect(auth0Issuer(domain)).toBe(`http://${domain}/`);
      },
    );
  });

  describe('roles claim', () => {
    it('defaults to the namespaced roles claim', () => {
      expect(validateEnv(validEnv()).auth0RolesClaim).toBe(
        'https://glmp.curtin.edu.au/roles',
      );
    });

    it('can be overridden for the dev IdP and tests', () => {
      const source = validEnv();
      source.AUTH0_ROLES_CLAIM = 'https://example.test/roles';

      expect(validateEnv(source).auth0RolesClaim).toBe(
        'https://example.test/roles',
      );
    });
  });

  describe('FRONTEND_URL / CORS allowlist', () => {
    it('parses a comma-separated list', () => {
      const source = validEnv();
      source.FRONTEND_URL = 'http://localhost:3000, https://glma.example.com';

      expect(validateEnv(source).allowedOrigins).toEqual([
        'http://localhost:3000',
        'https://glma.example.com',
      ]);
    });

    // CRS-02: a wildcard origin with credentials enabled would let any site
    // read authenticated responses.
    it('rejects a wildcard origin', () => {
      const source = validEnv();
      source.FRONTEND_URL = '*';

      expect(() => validateEnv(source)).toThrow('FRONTEND_URL');
    });

    it('rejects an origin carrying a path', () => {
      const source = validEnv();
      source.FRONTEND_URL = 'http://localhost:3000/app';

      expect(() => validateEnv(source)).toThrow('FRONTEND_URL');
    });

    it('rejects an origin with a trailing slash', () => {
      const source = validEnv();
      source.FRONTEND_URL = 'http://localhost:3000/';

      expect(() => validateEnv(source)).toThrow('FRONTEND_URL');
    });
  });
});
