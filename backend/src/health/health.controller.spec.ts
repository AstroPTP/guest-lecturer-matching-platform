import 'reflect-metadata';
import {
  Controller,
  Get,
  INestApplication,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { monitoringStore } from '../monitoring/monitoring.store';
import { prisma } from '../prisma';
import { restoreRealTimers } from '../testing/timers';
import { HealthController } from './health.controller';

const DRIVER_ERROR =
  'connect ECONNREFUSED 10.0.0.5:5432 (db.internal.example) PostgreSQL 16.2';

let savedCacheMs: string | undefined;

beforeEach(() => {
  monitoringStore.reset();
  savedCacheMs = process.env.READINESS_CACHE_MS;
  delete process.env.READINESS_CACHE_MS;
});

afterEach(() => {
  if (savedCacheMs === undefined) delete process.env.READINESS_CACHE_MS;
  else process.env.READINESS_CACHE_MS = savedCacheMs;
  restoreRealTimers();
  jest.restoreAllMocks();
});

/** Just enough of an Express response to see what the controller wrote. */
function fakeResponse() {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
      return response;
    },
  };
  return { sent, response: response as unknown as Response };
}

describe('HealthController', () => {
  // A new one each time: it remembers its last readiness answer.
  let controller: HealthController;
  beforeEach(() => {
    controller = new HealthController();
  });

  it.each(['liveness', 'readiness'] as const)(
    'is reachable without a token on %s',
    (route) => {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype[route]),
      ).toBe(true);
    },
  );

  it.each(['liveness', 'readiness'] as const)(
    'opts %s out of the rate limiter',
    (route) => {
      // @nestjs/throttler keeps this as "THROTTLER:SKIP" plus the name of the
      // throttler, "default" unless the module names others.
      expect(
        Reflect.getMetadata(
          'THROTTLER:SKIPdefault',
          HealthController.prototype[route],
        ),
      ).toBe(true);
    },
  );

  describe('healthz', () => {
    it('answers ok and never touches the database', () => {
      const query = jest.spyOn(prisma, '$queryRaw');

      expect(controller.liveness()).toEqual({ status: 'ok' });
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('readyz', () => {
    it('answers 200 {"status":"ready"} when the database answers', async () => {
      const query = jest
        .spyOn(prisma, '$queryRaw')
        .mockResolvedValue([{ '?column?': 1 }] as never);
      const { sent, response } = fakeResponse();

      await controller.readiness(response);

      expect(sent).toEqual({ status: 200, body: { status: 'ready' } });
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('answers 503 with exactly {"status":"unavailable"} when the query fails', async () => {
      jest
        .spyOn(prisma, '$queryRaw')
        .mockRejectedValue(new Error(DRIVER_ERROR));
      const { sent, response } = fakeResponse();

      await expect(controller.readiness(response)).resolves.toBeUndefined();

      expect(sent).toEqual({ status: 503, body: { status: 'unavailable' } });
      expect(Object.keys(sent.body as object)).toEqual(['status']);
      expect(JSON.stringify(sent)).not.toMatch(
        /ECONNREFUSED|5432|db\.internal|PostgreSQL|16\.2/,
      );
    });

    it('answers 503 when the query takes longer than two seconds', async () => {
      jest.useFakeTimers();
      jest
        .spyOn(prisma, '$queryRaw')
        .mockReturnValue(new Promise(() => undefined) as never);
      const { sent, response } = fakeResponse();

      const outcome = controller.readiness(response);
      await jest.advanceTimersByTimeAsync(1999);
      expect(sent.status).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      await outcome;

      expect(sent).toEqual({ status: 503, body: { status: 'unavailable' } });
    });

    it('still answers 200 for a query that finishes just inside two seconds', async () => {
      jest.useFakeTimers();
      jest
        .spyOn(prisma, '$queryRaw')
        .mockReturnValue(
          new Promise((resolve) =>
            setTimeout(() => resolve([{}]), 1500),
          ) as never,
        );
      const { sent, response } = fakeResponse();

      const outcome = controller.readiness(response);
      await jest.advanceTimersByTimeAsync(1500);
      await outcome;

      expect(sent).toEqual({ status: 200, body: { status: 'ready' } });
    });

    it('leaves no timer behind once the query has answered', async () => {
      jest.useFakeTimers();
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{}] as never);

      await controller.readiness(fakeResponse().response);

      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not throw, so the exception filter is never involved', async () => {
      jest
        .spyOn(prisma, '$queryRaw')
        .mockRejectedValue(new Error(DRIVER_ERROR));

      await expect(
        controller.readiness(fakeResponse().response),
      ).resolves.not.toThrow();
    });
  });
});

describe('readyz database load', () => {
  /** Probes the controller as the framework would, and says what came back. */
  const probe = async (controller: HealthController) => {
    const { sent, response } = fakeResponse();
    await controller.readiness(response);
    return sent;
  };

  const READY = { status: 200, body: { status: 'ready' } };
  const UNAVAILABLE = { status: 503, body: { status: 'unavailable' } };

  /** A query that answers after `ms`, or rejects, so probes can overlap it. */
  const answersAfter = (ms: number, outcome: 'ok' | 'fail' = 'ok') =>
    jest
      .spyOn(prisma, '$queryRaw')
      .mockImplementation(
        (() =>
          new Promise((resolve, reject) =>
            setTimeout(
              () =>
                outcome === 'ok'
                  ? resolve([{}])
                  : reject(new Error(DRIVER_ERROR)),
              ms,
            ),
          )) as never,
      );

  it('answers fifty concurrent probes with one query', async () => {
    jest.useFakeTimers();
    const query = answersAfter(100);
    const controller = new HealthController();

    const answers = Array.from({ length: 50 }, () => probe(controller));
    await jest.advanceTimersByTimeAsync(100);

    expect(await Promise.all(answers)).toEqual(Array(50).fill(READY));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('shares one failing query among concurrent probes too', async () => {
    jest.useFakeTimers();
    const query = answersAfter(100, 'fail');
    const controller = new HealthController();

    const answers = Array.from({ length: 50 }, () => probe(controller));
    await jest.advanceTimersByTimeAsync(100);

    expect(await Promise.all(answers)).toEqual(Array(50).fill(UNAVAILABLE));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('shares one timed-out query too, and answers 503 at two seconds', async () => {
    jest.useFakeTimers();
    const query = jest
      .spyOn(prisma, '$queryRaw')
      .mockReturnValue(new Promise(() => undefined) as never);
    const controller = new HealthController();

    const answers = Array.from({ length: 20 }, () => probe(controller));
    await jest.advanceTimersByTimeAsync(2000);

    expect(await Promise.all(answers)).toEqual(Array(20).fill(UNAVAILABLE));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reuses the answer for a second probe inside the window', async () => {
    jest.useFakeTimers();
    const query = answersAfter(10);
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    await first;
    await jest.advanceTimersByTimeAsync(1999);

    expect(await probe(controller)).toEqual(READY);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('asks again once the window has passed', async () => {
    jest.useFakeTimers();
    const query = answersAfter(10);
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    await first;
    await jest.advanceTimersByTimeAsync(2000);
    const second = probe(controller);
    await jest.advanceTimersByTimeAsync(10);

    expect(await second).toEqual(READY);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('holds a failure for the same window, then retries', async () => {
    jest.useFakeTimers();
    const query = answersAfter(10, 'fail');
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    expect(await first).toEqual(UNAVAILABLE);

    // The database comes back, but the failure is still the answer.
    query.mockImplementation((() => Promise.resolve([{}])) as never);
    await jest.advanceTimersByTimeAsync(1999);
    expect(await probe(controller)).toEqual(UNAVAILABLE);
    expect(query).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(await probe(controller)).toEqual(READY);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('counts the window from when the answer arrived, not from when it was asked for', async () => {
    jest.useFakeTimers();
    const query = answersAfter(1500);
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(1500);
    await first;
    // 1999 ms after the answer is 3499 ms after the first probe.
    await jest.advanceTimersByTimeAsync(1999);
    await probe(controller);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps no timer running between probes', async () => {
    jest.useFakeTimers();
    answersAfter(10);
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    await first;

    expect(jest.getTimerCount()).toBe(0);
  });

  it('takes the window from READINESS_CACHE_MS', async () => {
    process.env.READINESS_CACHE_MS = '500';
    jest.useFakeTimers();
    const query = answersAfter(10);
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    await first;
    await jest.advanceTimersByTimeAsync(499);
    await probe(controller);
    expect(query).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    const second = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    await second;
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each(['abc', '-1', '', '60001', 'Infinity', 'NaN'])(
    'falls back to two seconds for READINESS_CACHE_MS=%j',
    async (bad) => {
      process.env.READINESS_CACHE_MS = bad;
      jest.useFakeTimers();
      const query = answersAfter(10);
      const controller = new HealthController();

      const first = probe(controller);
      await jest.advanceTimersByTimeAsync(10);
      await first;
      await jest.advanceTimersByTimeAsync(1999);
      await probe(controller);

      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it('with READINESS_CACHE_MS=0 reuses nothing, but still shares a check in flight', async () => {
    process.env.READINESS_CACHE_MS = '0';
    jest.useFakeTimers();
    const query = answersAfter(10);
    const controller = new HealthController();

    const together = [probe(controller), probe(controller), probe(controller)];
    await jest.advanceTimersByTimeAsync(10);
    await Promise.all(together);
    expect(query).toHaveBeenCalledTimes(1);

    const next = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    await next;
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('never lets the cache change the body of either answer', async () => {
    jest.useFakeTimers();
    const query = answersAfter(10);
    const controller = new HealthController();

    const first = probe(controller);
    await jest.advanceTimersByTimeAsync(10);
    const cached = await probe(controller);

    expect(await first).toEqual(READY);
    expect(cached).toEqual(READY);
    expect(Object.keys(cached.body as object)).toEqual(['status']);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

/** A route that fails the ordinary way, as the control for the probe tests. */
@Controller()
class UnavailableController {
  @Get('boom')
  boom(): never {
    throw new ServiceUnavailableException({ status: 'unavailable' });
  }
}

describe('health routes over HTTP', () => {
  let app: INestApplication<App>;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  // Started the way main.ts starts the real application, with the global
  // filter in place, because that is the path the probes take.
  beforeEach(async () => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      controllers: [HealthController, UnavailableController],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves /healthz as {"status":"ok"} without touching the database', async () => {
    const query = jest.spyOn(prisma, '$queryRaw');

    const res = await request(app.getHttpServer()).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('serves /readyz as 200 {"status":"ready"} when the database answers', async () => {
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{}] as never);

    const res = await request(app.getHttpServer()).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('serves /readyz as 503 with exactly {"status":"unavailable"} when it fails', async () => {
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error(DRIVER_ERROR));

    const res = await request(app.getHttpServer()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
    expect(Object.keys(res.body as object)).toEqual(['status']);
    expect(res.text).not.toMatch(/ECONNREFUSED|5432|PostgreSQL|db\.internal/);
  });

  it('answers a flood of probes with one query', async () => {
    const query = jest
      .spyOn(prisma, '$queryRaw')
      .mockImplementation(
        (() =>
          new Promise((resolve) =>
            setTimeout(() => resolve([{}]), 20),
          )) as never,
      );
    // Listening once, because supertest otherwise binds a new port per request
    // and fifty at the same moment race each other.
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();

    const responses = await Promise.all(
      Array.from({ length: 50 }, () => request(url).get('/readyz')),
    );

    expect(responses.map((r) => r.status)).toEqual(Array(50).fill(200));
    expect(
      responses.every((r) => (r.body as { status: string }).status === 'ready'),
    ).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('records nothing and logs nothing when a probe fails, however often it comes', async () => {
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error(DRIVER_ERROR));

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).get('/readyz').expect(503);
    }

    expect(monitoringStore.recent(10)).toEqual([]);
    expect(monitoringStore.countsSinceStart().serverErrors).toBe(0);
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });

  it('would have caught it: a 503 thrown from an ordinary route is recorded and logged', async () => {
    // The control. If this stops being true, the test above proves nothing.
    await request(app.getHttpServer()).get('/boom').expect(503);

    expect(monitoringStore.countsSinceStart().serverErrors).toBe(1);
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});

describe('health routes and the rate limiter', () => {
  let app: INestApplication<App>;

  // A limit of two a minute, so that a third request is refused unless the
  // route has opted out.
  beforeEach(async () => {
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{}] as never);
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
      controllers: [HealthController, UnavailableController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/healthz', '/readyz'])(
    'never answers 429 on %s, however often it is probed',
    async (path) => {
      for (let i = 0; i < 6; i += 1) {
        await request(app.getHttpServer()).get(path).expect(200);
      }
    },
  );

  it('would have: an ordinary route is limited by the same guard', async () => {
    // The control. If this stops being true, the test above proves nothing.
    await request(app.getHttpServer()).get('/boom').expect(503);
    await request(app.getHttpServer()).get('/boom').expect(503);
    await request(app.getHttpServer()).get('/boom').expect(429);
  });
});
