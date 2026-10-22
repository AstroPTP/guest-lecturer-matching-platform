import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import {
  generateKeyPair,
  signToken,
  TEST_AUDIENCE,
  TEST_ROLES_CLAIM,
  type KeyPair,
} from '../auth/testing/token-factory';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import type { ErrorEnvelope } from '../common/error-codes';
import { APP_ENV } from '../config/app-env.token';
import type { AppEnv } from '../config/env.validation';
import {
  suggestionsEnabled,
  SuggestionsEnabledGuard,
} from './suggestions-enabled.guard';
import { SuggestionsController } from './suggestions.controller';
import {
  SuggestionsService,
  type SuggestionsResult,
} from './suggestions.service';

const FLAG = 'MATCHING_SUGGESTIONS_ENABLED';

const answer: SuggestionsResult = {
  session: {
    date: '2026-10-28',
    startTime: '10:00',
    endTime: '11:00',
    topics: ['Economics'],
    topicsFrom: 'request',
  },
  stages: {
    considered: 1,
    eligible: 1,
    available: 1,
    sharesTopic: 1,
    reliable: 1,
  },
  suggestions: [],
};

describe('suggestionsEnabled', () => {
  it('is on when the variable is unset, empty or anything but "false"', () => {
    expect(suggestionsEnabled({})).toBe(true);
    expect(suggestionsEnabled({ [FLAG]: '' })).toBe(true);
    expect(suggestionsEnabled({ [FLAG]: 'true' })).toBe(true);
    expect(suggestionsEnabled({ [FLAG]: '0' })).toBe(true);
    expect(suggestionsEnabled({ [FLAG]: 'no' })).toBe(true);
    // A misspelling of "false" must not switch the feature off.
    // cspell:disable-next-line
    expect(suggestionsEnabled({ [FLAG]: 'flase' })).toBe(true);
  });

  it('is off only for "false", whatever its case or padding', () => {
    expect(suggestionsEnabled({ [FLAG]: 'false' })).toBe(false);
    expect(suggestionsEnabled({ [FLAG]: ' FALSE ' })).toBe(false);
  });
});

describe('SuggestionsEnabledGuard', () => {
  const guard = new SuggestionsEnabledGuard();
  const original = process.env[FLAG];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  });

  it('lets a request through by default', () => {
    delete process.env[FLAG];
    expect(guard.canActivate()).toBe(true);
  });

  it('answers 404 when switched off', () => {
    process.env[FLAG] = 'false';
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });
});

describe('SuggestionsController over HTTP', () => {
  let app: INestApplication;
  let service: SuggestionsService;
  let jwksServer: Server;
  let keys: KeyPair;
  let issuer: string;
  let domain: string;
  const original = process.env[FLAG];

  /** A token the real strategy accepts, issued by the stand-in tenant below. */
  const tokenFor = (roles: string[], subject = 'auth0|coord-1') =>
    signToken({ privateKey: keys.privateKey, issuer, subject, roles });

  /** GET as a signed-in unit coordinator unless told otherwise. */
  const api = {
    get: (
      url: string,
      token: string | null = tokenFor(['unit_coordinator']),
    ) => {
      const call = request(app.getHttpServer() as Server).get(url);
      return token === null
        ? call
        : call.set('Authorization', `Bearer ${token}`);
    },
  };

  beforeAll(async () => {
    keys = generateKeyPair();
    // A local stand-in for the Auth0 tenant's key set, as the guard specs use,
    // so the real JwtStrategy verifies real signatures offline.
    jwksServer = createServer((req, res) => {
      if (req.url?.includes('jwks.json')) {
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
    domain = `127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  beforeEach(async () => {
    const testEnv = {
      nodeEnv: 'test',
      port: 0,
      allowedOrigins: ['http://localhost:3000'],
      auth0Domain: domain,
      auth0Audience: TEST_AUDIENCE,
      auth0RolesClaim: TEST_ROLES_CLAIM,
      databaseUrl: 'postgresql://localhost:5432/test',
      directUrl: 'postgresql://localhost:5432/test',
    } satisfies AppEnv;

    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [SuggestionsController],
      providers: [
        SuggestionsService,
        SuggestionsEnabledGuard,
        { provide: APP_ENV, useValue: testEnv },
        JwtStrategy,
        // Registered in the order the real application registers them.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    // The same pipe and filter main.ts installs.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    service = module.get(SuggestionsService);
    delete process.env[FLAG];
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  });

  describe('who may ask', () => {
    it('answers 401 with no token, and never reaches the service', async () => {
      const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      const res = await api.get('/suggestions', null).expect(401);
      expect((res.body as ErrorEnvelope).code).toBe('AUTH_MISSING_BEARER');
      expect(suggest).not.toHaveBeenCalled();
    });

    it('answers 401 for a token signed with a key the tenant does not publish', async () => {
      const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      const forged = signToken({
        privateKey: generateKeyPair().privateKey,
        issuer,
        roles: ['unit_coordinator'],
      });
      await api.get('/suggestions', forged).expect(401);
      expect(suggest).not.toHaveBeenCalled();
    });

    it('answers 403 to a guest speaker, and never reaches the service', async () => {
      const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      const res = await api
        .get('/suggestions', tokenFor(['guest_speaker']))
        .expect(403);
      expect((res.body as ErrorEnvelope).code).toBe('AUTHZ_INSUFFICIENT_ROLE');
      expect(suggest).not.toHaveBeenCalled();
    });

    it('answers 403 to an administrator, who is not a coordinator', async () => {
      await api.get('/suggestions', tokenFor(['ccae_admin'])).expect(403);
    });

    it('answers 403 to a token with no roles', async () => {
      await api.get('/suggestions', tokenFor([])).expect(403);
    });

    it('answers a unit coordinator', async () => {
      jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      await api.get('/suggestions').expect(200);
    });

    it('still asks who you are first when the feature is off: 401 with no token, 403 for a guest', async () => {
      process.env[FLAG] = 'false';
      await api.get('/suggestions', null).expect(401);
      await api.get('/suggestions', tokenFor(['guest_speaker'])).expect(403);
      await api.get('/suggestions').expect(404);
    });
  });

  const good =
    '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=Economics';

  it('passes the signed-in user, never anything from the query, to the service', async () => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);

    await api.get(`${good}&coordinatorId=99`).expect(400);
    expect(suggest).not.toHaveBeenCalled();

    const res = await api.get(good).expect(200);
    expect(res.body).toEqual(answer);
    expect(suggest).toHaveBeenCalledWith(
      'auth0|coord-1',
      expect.objectContaining({
        date: '2026-10-28',
        startTime: '10:00',
        endTime: '11:00',
        topics: ['Economics'],
      }),
    );
  });

  it('accepts topics repeated or comma separated, and trims them', async () => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);

    await api
      .get(
        '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=Economics&topics=Taxation%20Law',
      )
      .expect(200);
    await api
      .get(
        '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=Economics,%20Taxation%20Law,',
      )
      .expect(200);

    const topics = suggest.mock.calls.map(([, q]) => q.topics);
    expect(topics).toEqual([
      ['Economics', 'Taxation Law'],
      ['Economics', 'Taxation Law'],
    ]);
  });

  it('turns the limit into a number', async () => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
    await api.get(`${good}&limit=3`).expect(200);
    expect(suggest.mock.calls[0][1].limit).toBe(3);
  });

  it('accepts a request with everything blank', async () => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);

    await api.get('/suggestions').expect(200);

    const [asker, query] = suggest.mock.calls[0];
    // Taken from the verified token, never from the request.
    expect(asker).toBe('auth0|coord-1');
    expect(query.date).toBeUndefined();
    expect(query.startTime).toBeUndefined();
    expect(query.endTime).toBeUndefined();
    expect(query.topics).toBeUndefined();
  });

  it.each([
    ['only a date', '/suggestions?date=2026-10-28'],
    ['only times', '/suggestions?startTime=10:00&endTime=11:00'],
    ['only topics', '/suggestions?topics=Economics'],
    ['empty topics', '/suggestions?topics=,,'],
    ['an empty topics parameter', '/suggestions?topics='],
  ])('accepts %s', async (_label, url) => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
    await api.get(url).expect(200);
    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it('turns empty topics into an empty list', async () => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
    await api.get('/suggestions?topics=,,').expect(200);
    expect(suggest.mock.calls[0][1].topics).toEqual([]);
  });

  it.each([
    [
      'too many topics',
      `/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=${Array.from({ length: 11 }, (_, i) => `T${i}`).join(',')}`,
    ],
    [
      'a very long topic',
      `/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=${'x'.repeat(81)}`,
    ],
    [
      'a badly formed date',
      '/suggestions?date=28-10-2026&startTime=10:00&endTime=11:00&topics=Economics',
    ],
    [
      'a badly formed time',
      '/suggestions?date=2026-10-28&startTime=10am&endTime=11:00&topics=Economics',
    ],
    [
      'an hour of 24',
      '/suggestions?date=2026-10-28&startTime=10:00&endTime=24:00&topics=Economics',
    ],
    ['a limit of zero', `${good}&limit=0`],
    ['a limit over the maximum', `${good}&limit=51`],
    ['a non-numeric limit', `${good}&limit=lots`],
  ])('rejects %s with a 400', async (_label, url) => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
    const res = await api.get(url).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(suggest).not.toHaveBeenCalled();
  });

  it('answers 404 on every request when switched off, even a malformed one', async () => {
    process.env[FLAG] = 'false';
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);

    await api.get(good).expect(404);
    await api.get('/suggestions').expect(404);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('answers again as soon as it is switched back on', async () => {
    jest.spyOn(service, 'suggest').mockResolvedValue(answer);
    process.env[FLAG] = 'false';
    await api.get(good).expect(404);
    process.env[FLAG] = 'true';
    await api.get(good).expect(200);
  });
});
