import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
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
  let server: Server;
  const original = process.env[FLAG];
  const user: AuthenticatedUser = { id: 'auth0|coord-1', roles: [] };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SuggestionsController],
      providers: [SuggestionsService, SuggestionsEnabledGuard],
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
    // Stands in for JwtAuthGuard, which has already set the caller by now.
    app.use(
      (req: { user?: AuthenticatedUser }, _res: unknown, next: () => void) => {
        req.user = user;
        next();
      },
    );
    await app.init();
    server = app.getHttpServer() as Server;
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

  const good =
    '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=Economics';

  it('passes the signed-in user, never anything from the query, to the service', async () => {
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);

    await request(server).get(`${good}&coordinatorId=99`).expect(400);
    expect(suggest).not.toHaveBeenCalled();

    const res = await request(server).get(good).expect(200);
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

    await request(server)
      .get(
        '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=Economics&topics=Taxation%20Law',
      )
      .expect(200);
    await request(server)
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
    await request(server).get(`${good}&limit=3`).expect(200);
    expect(suggest.mock.calls[0][1].limit).toBe(3);
  });

  it.each([
    ['no topics', '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00'],
    [
      'empty topics',
      '/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=,,',
    ],
    [
      'too many topics',
      `/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=${Array.from({ length: 11 }, (_, i) => `T${i}`).join(',')}`,
    ],
    [
      'a very long topic',
      `/suggestions?date=2026-10-28&startTime=10:00&endTime=11:00&topics=${'x'.repeat(81)}`,
    ],
    ['no date', '/suggestions?startTime=10:00&endTime=11:00&topics=Economics'],
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
    const res = await request(server).get(url).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(suggest).not.toHaveBeenCalled();
  });

  it('answers 404 on every request when switched off, even a malformed one', async () => {
    process.env[FLAG] = 'false';
    const suggest = jest.spyOn(service, 'suggest').mockResolvedValue(answer);

    await request(server).get(good).expect(404);
    await request(server).get('/suggestions').expect(404);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('answers again as soon as it is switched back on', async () => {
    jest.spyOn(service, 'suggest').mockResolvedValue(answer);
    process.env[FLAG] = 'false';
    await request(server).get(good).expect(404);
    process.env[FLAG] = 'true';
    await request(server).get(good).expect(200);
  });
});
