import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { APP_ENV } from '../config/app-env.token';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import type { ErrorEnvelope } from '../common/error-codes';
import type { AppEnv } from '../config/env.validation';
import { prisma } from '../prisma';
import { JwtAuthGuard } from './jwt.guard';
import { JwtStrategy } from './jwt.strategy';
import { Public } from './public.decorator';
import { AppRole } from './roles';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import {
  generateKeyPair,
  KeyPair,
  signAlgNoneToken,
  signToken,
  tamperPayload,
  TEST_AUDIENCE,
  TEST_ROLES_CLAIM,
} from './testing/token-factory';

/**
 * Guard behaviour, checked against a running Nest application.
 *
 * Test names carry their THREAT_MODEL_CHECKLIST.md item id, so a failure names
 * the threat it was protecting against rather than just a broken assertion.
 *
 * A local HTTP server stands in for the Auth0 tenant's JWKS endpoint. That
 * keeps the suite offline and credential-free while still exercising the real
 * jwks-rsa fetch, cache and key-matching path. Mocking the library out would
 * test the mock instead of the thing that has to be right.
 */

@Controller('test')
class ProbeController {
  @Public()
  @Get('open')
  open(): string {
    return 'open';
  }

  @Get('protected')
  protected(): string {
    return 'protected';
  }

  @Roles(AppRole.CcaeAdmin)
  @Get('admin')
  adminOnly(): string {
    return 'admin';
  }

  @Roles(AppRole.GuestSpeaker, AppRole.UnitCoordinator)
  @Get('either')
  either(): string {
    return 'either';
  }
}

describe('Auth guards', () => {
  let app: INestApplication;
  let jwksServer: Server;
  let keys: KeyPair;
  let otherKeys: KeyPair;
  let jwksRequestCount = 0;
  let issuer: string;

  /** signToken, but issued by the stand-in the strategy is pointed at. */
  const mint = (options: Parameters<typeof signToken>[0]) =>
    signToken({ issuer, ...options });

  beforeAll(async () => {
    keys = generateKeyPair();
    // A second, unrelated key. Its signatures are structurally perfect and
    // must still be rejected, because it is not in the published key set.
    otherKeys = generateKeyPair();

    jwksServer = createServer((req, res) => {
      if (req.url?.includes('jwks.json')) {
        jwksRequestCount += 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [keys.jwk] }));
        return;
      }
      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) =>
      jwksServer.listen(0, '127.0.0.1', resolve),
    );

    const { port } = jwksServer.address() as AddressInfo;
    issuer = `http://127.0.0.1:${port}/`;

    // A loopback domain, so auth0JwksUri()/auth0Issuer() resolve to the local
    // stand-in over http. The strategy is exercised exactly as it runs in
    // production: same derivation, same library, different host.
    const testEnv = {
      nodeEnv: 'test',
      port: 0,
      allowedOrigins: ['http://localhost:3000'],
      auth0Domain: `127.0.0.1:${port}`,
      auth0Audience: TEST_AUDIENCE,
      auth0RolesClaim: TEST_ROLES_CLAIM,
      databaseUrl: 'postgresql://localhost:5432/test',
      directUrl: 'postgresql://localhost:5432/test',
    } satisfies AppEnv;

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [ProbeController],
      providers: [
        { provide: APP_ENV, useValue: testEnv },
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  /** supertest types the body as `any`; read it as the envelope it is. */
  const envelopeOf = (res: request.Response): ErrorEnvelope =>
    res.body as ErrorEnvelope;
  const withToken = (path: string, token: string) =>
    get(path).set('Authorization', `Bearer ${token}`);

  describe('spoofing, forged tokens', () => {
    it('SPF-01 rejects a request with no Authorization header', async () => {
      const res = await get('/test/protected').expect(401);

      expect(envelopeOf(res).code).toBe('AUTH_MISSING_BEARER');
    });

    it('SPF-02 rejects a header with no Bearer scheme', async () => {
      const token = mint({ privateKey: keys.privateKey });
      const res = await get('/test/protected')
        .set('Authorization', token)
        .expect(401);

      expect(envelopeOf(res).code).toBe('AUTH_MISSING_BEARER');
    });

    it('SPF-03 rejects a token declaring alg none', async () => {
      const res = await withToken('/test/protected', signAlgNoneToken()).expect(
        401,
      );

      expect(envelopeOf(res).code).toBe('AUTH_INVALID_TOKEN');
    });

    it('SPF-04 rejects a token signed with a key outside the JWKS', async () => {
      const token = mint({ privateKey: otherKeys.privateKey });

      await withToken('/test/protected', token).expect(401);
    });

    it('SPF-05 rejects HS256 signed with the public key as the secret', async () => {
      // Algorithm confusion: the attacker takes the public key we publish and
      // uses it as an HMAC secret. Only an explicit RS256 allowlist stops this.
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: issuer,
          aud: TEST_AUDIENCE,
          sub: 'attacker',
          exp: Math.floor(Date.now() / 1000) + 3600,
          [TEST_ROLES_CLAIM]: ['ccae_admin'],
        }),
      ).toString('base64url');
      const secret = keys.publicKey.export({ type: 'spki', format: 'pem' });
      const signature = createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      const res = await withToken(
        '/test/admin',
        `${header}.${payload}.${signature}`,
      ).expect(401);

      expect(envelopeOf(res).code).toBe('AUTH_INVALID_TOKEN');
    });

    it('SPF-06 rejects an expired token', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        expiresInSeconds: -60,
      });

      await withToken('/test/protected', token).expect(401);
    });

    it('SPF-07 rejects a token issued for another audience', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        audience: 'some-other-api',
      });

      await withToken('/test/protected', token).expect(401);
    });

    it('SPF-08 rejects a token from another issuer', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        issuer: 'https://someone-elses-tenant.au.auth0.com/',
      });

      await withToken('/test/protected', token).expect(401);
    });

    it('SPF-09 fetches the JWKS once and serves later requests from cache', async () => {
      const token = mint({ privateKey: keys.privateKey });
      await withToken('/test/protected', token).expect(200);

      const afterWarmUp = jwksRequestCount;

      for (let i = 0; i < 5; i += 1) {
        await withToken('/test/protected', token).expect(200);
      }

      expect(jwksRequestCount).toBe(afterWarmUp);
    });

    it('SPF-10 accepts a valid, current, correctly-audienced token', async () => {
      // A suite that only proves rejections proves nothing.
      const token = mint({
        privateKey: keys.privateKey,
        subject: 'user-123',
        email: 'valid.user@student.curtin.edu.au',
      });

      const res = await withToken('/test/protected', token).expect(200);

      expect(res.text).toBe('protected');
    });

    it('rejects a valid token whose account has been deleted', async () => {
      const lookup = jest
        .spyOn(prisma.users, 'findFirst')
        // The guard selects only userid; the full row type is not needed.
        .mockResolvedValueOnce({ userid: 1n } as never);
      const token = mint({ privateKey: keys.privateKey, subject: 'user-123' });

      const res = await withToken('/test/protected', token).expect(401);

      expect(envelopeOf(res).code).toBe('AUTH_INVALID_TOKEN');
      expect(lookup).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { auth0Id: 'user-123', deletedat: { not: null } },
        }),
      );
      lookup.mockRestore();
    });
  });

  describe('tampering', () => {
    it('TAM-03 rejects a token whose payload was altered after signing', async () => {
      const token = tamperPayload(
        mint({ privateKey: keys.privateKey }),
        (payload) => {
          payload.sub = 'somebody-else';
        },
      );

      const res = await withToken('/test/protected', token).expect(401);

      expect(envelopeOf(res).code).toBe('AUTH_INVALID_TOKEN');
    });

    it('TAM-04 rejects a self-promotion to ccae_admin in the roles claim', async () => {
      // The single check the whole authorisation model rests on.
      const token = tamperPayload(
        mint({
          privateKey: keys.privateKey,
          roles: [AppRole.GuestSpeaker],
        }),
        (payload) => {
          payload[TEST_ROLES_CLAIM] = [AppRole.CcaeAdmin];
        },
      );

      const res = await withToken('/test/admin', token).expect(401);

      // 401, not 403: the signature fails before any role is read.
      expect(envelopeOf(res).code).toBe('AUTH_INVALID_TOKEN');
    });
  });

  describe('elevation of privilege', () => {
    it('EOP-01 denies an admin route to a guest speaker', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        roles: [AppRole.GuestSpeaker],
      });

      const res = await withToken('/test/admin', token).expect(403);

      expect(envelopeOf(res).code).toBe('AUTHZ_INSUFFICIENT_ROLE');
    });

    it('EOP-04 denies when the roles claim is absent entirely', async () => {
      // Fail-closed. If the access token hook is disabled or throws, tokens
      // arrive with no roles and guarded routes must shut, not open.
      const token = mint({
        privateKey: keys.privateKey,
        omitRolesClaim: true,
      });

      const res = await withToken('/test/admin', token).expect(403);

      expect(envelopeOf(res).code).toBe('AUTHZ_INSUFFICIENT_ROLE');
    });

    it('EOP-04 denies when the roles claim is present but empty', async () => {
      const token = mint({ privateKey: keys.privateKey, roles: [] });

      await withToken('/test/admin', token).expect(403);
    });

    it('EOP-04 ignores a role value the application does not know', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        roles: ['superuser', 'root'],
      });

      await withToken('/test/admin', token).expect(403);
    });

    it('EOP-04 denies when roles is not an array', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        roles: 'ccae_admin',
      });

      await withToken('/test/admin', token).expect(403);
    });

    it('EOP-06 admits a multi-role user under most-permissive-wins', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        roles: [AppRole.GuestSpeaker, AppRole.UnitCoordinator],
      });

      await withToken('/test/either', token).expect(200);
    });

    it('EOP-06 admits when only one of several required roles is held', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        roles: [AppRole.UnitCoordinator],
      });

      await withToken('/test/either', token).expect(200);
    });

    it('admits a caller holding the exact required role', async () => {
      const token = mint({
        privateKey: keys.privateKey,
        roles: [AppRole.CcaeAdmin],
      });

      await withToken('/test/admin', token).expect(200);
    });
  });

  describe('public routes', () => {
    it('allows a @Public() route with no token', async () => {
      await get('/test/open').expect(200);
    });

    it('EOP-09 protects a route that carries no decorator at all', async () => {
      // Guards are global, so protection is the default and forgetting one
      // leaves a route closed rather than open.
      await get('/test/protected').expect(401);
    });
  });

  describe('error envelope', () => {
    it('INF-01 returns exactly the four envelope fields and no internals', async () => {
      const res = await get('/test/protected').expect(401);

      expect(Object.keys(envelopeOf(res)).sort()).toEqual([
        'code',
        'correlationId',
        'message',
        'timestamp',
      ]);
      expect(JSON.stringify(envelopeOf(res))).not.toMatch(
        /stack|node_modules|\.ts:/i,
      );
    });

    it('REP-06 echoes a supplied correlation id so logs can be joined up', async () => {
      const res = await get('/test/protected')
        .set('x-correlation-id', 'req-abc-123')
        .expect(401);

      expect(envelopeOf(res).correlationId).toBe('req-abc-123');
    });

    it('mints a correlation id when the caller supplies none', async () => {
      const res = await get('/test/protected').expect(401);

      expect(envelopeOf(res).correlationId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it.each([
      ['spaces', 'not a valid id'],
      ['punctuation', '<script>alert(1)</script>'],
      ['over-long', 'a'.repeat(200)],
    ])(
      'replaces a correlation id containing %s rather than echoing it',
      async (_label, supplied) => {
        // Echoed into the response and written to the log, so an unvetted
        // client string is both a log-injection and a storage problem.
        const res = await get('/test/protected')
          .set('x-correlation-id', supplied)
          .expect(401);

        expect(envelopeOf(res).correlationId).not.toBe(supplied);
        expect(envelopeOf(res).correlationId).toMatch(/^[0-9a-f-]{36}$/);
      },
    );
  });
});
