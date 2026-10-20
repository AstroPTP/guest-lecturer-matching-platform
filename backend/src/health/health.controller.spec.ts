import 'reflect-metadata';
import {
  INestApplication,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { prisma } from '../prisma';
import { restoreRealTimers } from '../testing/timers';
import { HealthController } from './health.controller';

const DRIVER_ERROR =
  'connect ECONNREFUSED 10.0.0.5:5432 (db.internal.example) PostgreSQL 16.2';

afterEach(() => {
  restoreRealTimers();
  jest.restoreAllMocks();
});

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

  describe('healthz', () => {
    it('answers ok and never touches the database', () => {
      const query = jest.spyOn(prisma, '$queryRaw');

      expect(controller.liveness()).toEqual({ status: 'ok' });
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('readyz', () => {
    it('answers ready when the database answers', async () => {
      const query = jest
        .spyOn(prisma, '$queryRaw')
        .mockResolvedValue([{ '?column?': 1 }] as never);

      await expect(controller.readiness()).resolves.toEqual({
        status: 'ready',
      });
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('answers 503 with a generic body when the query fails', async () => {
      jest
        .spyOn(prisma, '$queryRaw')
        .mockRejectedValue(new Error(DRIVER_ERROR));

      const failure: unknown = await controller
        .readiness()
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      const refusal = failure as ServiceUnavailableException;
      expect(refusal.getStatus()).toBe(503);
      expect(refusal.getResponse()).toEqual({ status: 'unavailable' });
      expect(JSON.stringify(refusal.getResponse())).not.toMatch(
        /ECONNREFUSED|5432|db\.internal|PostgreSQL|16\.2/,
      );
      expect(refusal.message).not.toMatch(/ECONNREFUSED|5432|PostgreSQL/);
    });

    it('answers 503 when the query takes longer than two seconds', async () => {
      jest.useFakeTimers();
      jest
        .spyOn(prisma, '$queryRaw')
        .mockReturnValue(new Promise(() => undefined) as never);

      const outcome = controller.readiness().catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(2000);

      const failure = (await outcome) as ServiceUnavailableException;
      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(failure.getResponse()).toEqual({ status: 'unavailable' });
    });

    it('still answers ready for a query that finishes just inside two seconds', async () => {
      jest.useFakeTimers();
      jest
        .spyOn(prisma, '$queryRaw')
        .mockReturnValue(
          new Promise((resolve) =>
            setTimeout(() => resolve([{}]), 1500),
          ) as never,
        );

      const outcome = controller.readiness();
      await jest.advanceTimersByTimeAsync(1500);

      await expect(outcome).resolves.toEqual({ status: 'ready' });
    });

    it('leaves no timer behind once the query has answered', async () => {
      jest.useFakeTimers();
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{}] as never);

      await controller.readiness();

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});

describe('health routes over HTTP', () => {
  let app: INestApplication<App>;

  const start = async (withFilter: boolean) => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    if (withFilter) {
      app.useGlobalFilters(new GlobalExceptionFilter());
    }
    await app.init();
  };

  afterEach(async () => {
    await app.close();
  });

  it('serves /healthz as {"status":"ok"} without touching the database', async () => {
    const query = jest.spyOn(prisma, '$queryRaw');
    await start(false);

    const res = await request(app.getHttpServer()).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('serves /readyz as {"status":"ready"} when the database answers', async () => {
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{}] as never);
    await start(false);

    const res = await request(app.getHttpServer()).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('serves /readyz as 503 with exactly {"status":"unavailable"} when it fails', async () => {
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error(DRIVER_ERROR));
    await start(false);

    const res = await request(app.getHttpServer()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
    expect(res.text).not.toMatch(/ECONNREFUSED|5432|PostgreSQL/);
  });

  it('keeps the 503 and leaks nothing when the global filter wraps it', async () => {
    // The filter logs every 5xx at error level; keep that out of the test output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error(DRIVER_ERROR));
    await start(true);

    const res = await request(app.getHttpServer()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.text).not.toMatch(/ECONNREFUSED|5432|PostgreSQL|db\.internal/);
  });
});
