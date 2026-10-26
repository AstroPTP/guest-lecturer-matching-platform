import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import {
  startAuthStandIn,
  type AuthStandIn,
} from '../auth/testing/auth-stand-in';
import { prisma } from '../prisma';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import type { ErrorEnvelope } from '../common/error-codes';
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
  const switchSetting = (enabled: boolean) =>
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue({ suggestions_enabled: enabled } as never);

  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  });

  it('answers 404 by default: ranked matching is off until an administrator switches it on', async () => {
    delete process.env[FLAG];
    // Nothing stored: the settings row has never been changed.
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({} as never);
    const failure = await guard.canActivate().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NotFoundException);
    expect((failure as NotFoundException).getResponse()).toEqual({
      code: 'SUGGESTIONS_DISABLED',
      message: 'Suggested speakers is turned off by an administrator.',
    });
  });

  it('lets a request through when the administrator has it on', async () => {
    delete process.env[FLAG];
    switchSetting(true);
    await expect(guard.canActivate()).resolves.toBe(true);
  });

  it('answers 404 when MATCHING_SUGGESTIONS_ENABLED is false, without reading the database', async () => {
    process.env[FLAG] = 'false';
    const read = switchSetting(true);
    await expect(guard.canActivate()).rejects.toThrow(NotFoundException);
    expect(read).not.toHaveBeenCalled();
  });

  it('lets the environment win: false switches it off even with the setting on', async () => {
    process.env[FLAG] = 'false';
    switchSetting(true);
    await expect(guard.canActivate()).rejects.toBeInstanceOf(NotFoundException);
  });

  it("answers 404 with the administrator's message when Settings has it off", async () => {
    delete process.env[FLAG];
    switchSetting(false);
    const failure = await guard.canActivate().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NotFoundException);
    expect((failure as NotFoundException).getResponse()).toEqual({
      code: 'SUGGESTIONS_DISABLED',
      message: 'Suggested speakers is turned off by an administrator.',
    });
  });

  it('does not let the environment turn it back on: true leaves the administrator in charge', async () => {
    process.env[FLAG] = 'true';
    switchSetting(false);
    await expect(guard.canActivate()).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SuggestionsController over HTTP', () => {
  let app: INestApplication;
  let service: SuggestionsService;
  let auth: AuthStandIn;
  const original = process.env[FLAG];

  const tokenFor = (roles: string[]) => auth.tokenFor(roles);

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
    auth = await startAuthStandIn();
  });

  afterAll(async () => {
    await auth.stop();
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: auth.imports,
      controllers: [SuggestionsController],
      providers: [
        SuggestionsService,
        SuggestionsEnabledGuard,
        ...auth.providers,
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
    // Ranked matching is off until an administrator switches it on, so these
    // tests start from the switch being on and say so when they want it off.
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue({ suggestions_enabled: true } as never);
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
      const forged = auth.forgedToken(['unit_coordinator']);
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
  describe('off by default', () => {
    beforeEach(() => {
      // A settings row nobody has changed.
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue({} as never);
    });

    it('answers 404 on the list and on the status until the administrator switches it on', async () => {
      const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      const list = await api.get(good).expect(404);
      expect(list.body).toMatchObject({ code: 'SUGGESTIONS_DISABLED' });
      await api.get('/suggestions/status').expect(404);
      await api
        .get('/suggestions/status', tokenFor(['guest_speaker']))
        .expect(404);
      expect(suggest).not.toHaveBeenCalled();
    });

    it('answers once the administrator has switched it on', async () => {
      jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      await api.get(good).expect(404);
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue({ suggestions_enabled: true } as never);
      await api.get(good).expect(200);
      await api.get('/suggestions/status').expect(200);
    });
  });

  describe("the administrator's switch", () => {
    const off = () =>
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue({ suggestions_enabled: false } as never);

    it("answers 404 with the administrator's message, as the API error envelope", async () => {
      const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      off();
      const res = await api.get(good).expect(404);
      expect(res.body).toMatchObject({
        code: 'SUGGESTIONS_DISABLED',
        message: 'Suggested speakers is turned off by an administrator.',
      });
      expect(suggest).not.toHaveBeenCalled();
    });

    it('gives a plain 404, with no administrator message, when the environment turned it off', async () => {
      process.env[FLAG] = 'false';
      off();
      const res = await api.get(good).expect(404);
      expect((res.body as ErrorEnvelope).code).not.toBe('SUGGESTIONS_DISABLED');
    });

    it('answers again as soon as the administrator switches it back on', async () => {
      jest.spyOn(service, 'suggest').mockResolvedValue(answer);
      const upsert = off();
      await api.get(good).expect(404);
      upsert.mockResolvedValue({ suggestions_enabled: true } as never);
      await api.get(good).expect(200);
    });
  });

  describe('GET /suggestions/status', () => {
    it('says it is on for a unit coordinator', async () => {
      const res = await api.get('/suggestions/status').expect(200);
      expect(res.body).toEqual({ enabled: true });
    });

    it("answers 404 with the administrator's message when it is off", async () => {
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue({ suggestions_enabled: false } as never);
      const res = await api.get('/suggestions/status').expect(404);
      expect(res.body).toMatchObject({
        code: 'SUGGESTIONS_DISABLED',
        message: 'Suggested speakers is turned off by an administrator.',
      });
    });

    it('answers 404 when the environment turned it off', async () => {
      process.env[FLAG] = 'false';
      await api.get('/suggestions/status').expect(404);
    });

    it('says it is on for a guest speaker too, so Discovery and Help can match it', async () => {
      const res = await api
        .get('/suggestions/status', tokenFor(['guest_speaker']))
        .expect(200);
      expect(res.body).toEqual({ enabled: true });
    });

    it('needs a token and a coordinator or guest role: 401 with none, 403 for an administrator', async () => {
      await api.get('/suggestions/status', null).expect(401);
      await api
        .get('/suggestions/status', tokenFor(['ccae_admin']))
        .expect(403);
      await api.get('/suggestions/status', tokenFor([])).expect(403);
    });
  });
});
