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

beforeEach(() => {
  monitoringStore.reset();
});

afterEach(() => {
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
  const controller = new HealthController();

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
