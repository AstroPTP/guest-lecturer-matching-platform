import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { currentCorrelationId } from './request-context';
import {
  requestContextMiddleware,
  type RequestLogLine,
} from './request-context.middleware';
import { monitoringStore } from '../monitoring/monitoring.store';

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Controller()
class ThingsController {
  @Get('things/:id')
  one(@Param('id') id: string) {
    return { id, seenByHandler: currentCorrelationId() };
  }

  @Get('slow/:name/:delay')
  async slow(@Param('name') name: string, @Param('delay') delay: string) {
    await tick(Number(delay));
    return { name, seenByHandler: currentCorrelationId() };
  }

  @Post('things')
  async create(@Body() body: Record<string, unknown>) {
    await tick(1);
    return {
      received: Object.keys(body),
      seenByHandler: currentCorrelationId(),
    };
  }

  @Get('boom')
  boom(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
  }

  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('readyz')
  readyz() {
    return { status: 'ready' };
  }
}

describe('requestContextMiddleware', () => {
  let app: NestExpressApplication;
  let lines: string[];
  let clock: number[];

  const parsed = (): RequestLogLine[] =>
    lines.map((line) => JSON.parse(line) as RequestLogLine);

  /**
   * Started the way main.ts starts the application: the middleware first, then
   * the JSON body parser, the validation pipe and the global filter.
   */
  beforeEach(async () => {
    lines = [];
    clock = [];
    monitoringStore.reset();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      controllers: [ThingsController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.use(
      requestContextMiddleware({
        write: (line) => lines.push(line),
        // Each request reads the clock twice: when it starts and when it ends.
        // With nothing queued it falls back to a steady 1 ms per read.
        now: (() => {
          let reads = 0;
          return () => clock.shift() ?? (reads += 1);
        })(),
      }),
    );
    app.useBodyParser('json', { limit: '1kb' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe('the correlation id', () => {
    it('reuses a well-formed inbound id on the response, in the handler and in the log', async () => {
      const res = await request(app.getHttpServer())
        .get('/things/7')
        .set('x-correlation-id', 'abc-123_DEF')
        .expect(200);

      expect(res.headers['x-correlation-id']).toBe('abc-123_DEF');
      expect((res.body as { seenByHandler: string }).seenByHandler).toBe(
        'abc-123_DEF',
      );
      expect(parsed()[0].correlationId).toBe('abc-123_DEF');
    });

    it.each([
      ['too long', 'a'.repeat(65)],
      ['markup', '<script>alert(1)</script>'],
      ['spaced', 'has space in it'],
    ])(
      'replaces an inbound id that is %s with a ULID',
      async (_label, inbound) => {
        const res = await request(app.getHttpServer())
          .get('/things/7')
          .set('x-correlation-id', inbound)
          .expect(200);

        const issued = res.headers['x-correlation-id'];
        expect(issued).not.toBe(inbound);
        expect(issued).toMatch(ULID);
        expect(parsed()[0].correlationId).toBe(issued);
        expect(lines.join('')).not.toContain(inbound);
      },
    );

    it('mints a ULID when none is sent, and a different one for every request', async () => {
      const first = await request(app.getHttpServer()).get('/things/1');
      const second = await request(app.getHttpServer()).get('/things/1');

      expect(first.headers['x-correlation-id']).toMatch(ULID);
      expect(second.headers['x-correlation-id']).toMatch(ULID);
      expect(first.headers['x-correlation-id']).not.toBe(
        second.headers['x-correlation-id'],
      );
    });

    it('sets the header on a 404 and on a 500 as well as on a success', async () => {
      const missing = await request(app.getHttpServer()).get('/nowhere');
      const failed = await request(app.getHttpServer()).get('/boom');

      expect(missing.status).toBe(404);
      expect(missing.headers['x-correlation-id']).toMatch(ULID);
      expect(failed.status).toBe(500);
      expect(failed.headers['x-correlation-id']).toMatch(ULID);
    });

    it('keeps the context after the body has been parsed and awaited on', async () => {
      const res = await request(app.getHttpServer())
        .post('/things')
        .set('x-correlation-id', 'posted-1')
        .send({ name: 'x' })
        .expect(201);

      expect((res.body as { seenByHandler: string }).seenByHandler).toBe(
        'posted-1',
      );
    });

    it('keeps requests that overlap apart', async () => {
      const server = app.getHttpServer();
      const [slow, fast] = await Promise.all([
        request(server).get('/slow/a/40').set('x-correlation-id', 'id-a'),
        request(server).get('/slow/b/1').set('x-correlation-id', 'id-b'),
      ]);

      expect((slow.body as { seenByHandler: string }).seenByHandler).toBe(
        'id-a',
      );
      expect((fast.body as { seenByHandler: string }).seenByHandler).toBe(
        'id-b',
      );
    });
  });

  describe('the log line', () => {
    it('writes exactly one JSON line per request with exactly the six fields', async () => {
      await request(app.getHttpServer()).get('/things/7').expect(200);

      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('\n');
      const line = parsed()[0];
      expect(Object.keys(line).sort()).toEqual([
        'correlationId',
        'durationMs',
        'method',
        'route',
        'status',
        'ts',
      ]);
      expect(line.method).toBe('GET');
      expect(line.status).toBe(200);
      expect(new Date(line.ts).toISOString()).toBe(line.ts);
    });

    it('logs the route pattern, not the path with its ids', async () => {
      await request(app.getHttpServer()).get('/things/7');
      await request(app.getHttpServer()).get('/things/8');

      expect(parsed().map((line) => line.route)).toEqual([
        '/things/:id',
        '/things/:id',
      ]);
    });

    it('logs the path without its query string where no route matched', async () => {
      await request(app.getHttpServer()).get('/nowhere?token=secret-in-query');

      const line = parsed()[0];
      expect(line.route).toBe('/nowhere');
      expect(line.status).toBe(404);
      expect(lines.join('')).not.toContain('secret-in-query');
    });

    it('never logs a query value, a body, a header or a token', async () => {
      await request(app.getHttpServer())
        .post('/things?token=secret-in-query')
        .set('Authorization', 'Bearer secret-bearer-token')
        .set('Cookie', 'session=secret-cookie')
        .send({ password: 'secret-in-body' })
        .expect(201);

      const text = lines.join('');
      for (const secret of [
        'secret-in-query',
        'secret-bearer-token',
        'secret-cookie',
        'secret-in-body',
        'Bearer',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('caps how much of an unmatched path it writes', async () => {
      await request(app.getHttpServer()).get(`/${'a'.repeat(400)}`);

      expect(parsed()[0].route).toHaveLength(200);
    });

    it('reports the status the client received', async () => {
      await request(app.getHttpServer()).get('/boom');
      await request(app.getHttpServer()).get('/nowhere');

      expect(parsed().map((line) => line.status)).toEqual([500, 404]);
    });

    it('times the request from its start to the finished response', async () => {
      clock.push(100, 142.34);

      await request(app.getHttpServer()).get('/things/7');

      expect(parsed()[0].durationMs).toBe(42.3);
    });

    it('does not log the health probes, but still gives them an id', async () => {
      const live = await request(app.getHttpServer()).get('/healthz');
      const ready = await request(app.getHttpServer()).get('/readyz?x=1');

      expect(live.status).toBe(200);
      expect(ready.status).toBe(200);
      expect(live.headers['x-correlation-id']).toMatch(ULID);
      expect(lines).toEqual([]);
    });

    it('still answers when the log sink throws', async () => {
      await app.close();
      const module = await Test.createTestingModule({
        controllers: [ThingsController],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>();
      app.use(
        requestContextMiddleware({
          write: () => {
            throw new Error('disk full');
          },
        }),
      );
      await app.init();

      const res = await request(app.getHttpServer()).get('/things/7');

      expect(res.status).toBe(200);
    });
  });

  describe('with the error filter', () => {
    it('puts the same id in the envelope, the header and the log line', async () => {
      const res = await request(app.getHttpServer())
        .get('/boom')
        .set('x-correlation-id', 'trace-me-1')
        .expect(500);

      expect((res.body as { correlationId: string }).correlationId).toBe(
        'trace-me-1',
      );
      expect(res.headers['x-correlation-id']).toBe('trace-me-1');
      expect(parsed()[0]).toMatchObject({
        correlationId: 'trace-me-1',
        status: 500,
        route: '/boom',
      });
    });

    it('gives the minted ULID to the envelope when the caller sent none', async () => {
      const res = await request(app.getHttpServer()).get('/boom').expect(500);

      const body = res.body as { correlationId: string };
      expect(body.correlationId).toMatch(ULID);
      expect(body.correlationId).toBe(res.headers['x-correlation-id']);
    });

    it('still has an id and a line for a body refused before routing', async () => {
      const res = await request(app.getHttpServer())
        .post('/things')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ filler: 'x'.repeat(2_000) }))
        .expect(413);

      const body = res.body as { correlationId: string; code: string };
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.correlationId).toBe(res.headers['x-correlation-id']);
      expect(parsed()[0]).toMatchObject({
        correlationId: body.correlationId,
        status: 413,
      });
    });

    it('answers a route that does not exist with NOT_FOUND and the same id', async () => {
      const res = await request(app.getHttpServer())
        .get('/nowhere')
        .expect(404);

      const body = res.body as { code: string; correlationId: string };
      expect(body.code).toBe('NOT_FOUND');
      expect(body.correlationId).toBe(res.headers['x-correlation-id']);
    });

    it('records the failure in the monitoring store as before', async () => {
      await request(app.getHttpServer()).get('/boom');

      expect(monitoringStore.recent(1)[0]).toMatchObject({
        status: 500,
        path: '/boom',
      });
    });
  });
});
