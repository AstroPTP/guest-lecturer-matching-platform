import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { corsOptions } from './cors-options';

const ORIGIN = 'http://localhost:3000';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

describe('corsOptions', () => {
  const lowerCased = (names: string | string[] | undefined) =>
    [names ?? []]
      .flat()
      .flatMap((name) => name.split(','))
      .map((name) => name.trim().toLowerCase());

  it('does not let a caller send a correlation id', () => {
    expect(lowerCased(corsOptions([ORIGIN]).allowedHeaders)).not.toContain(
      'x-correlation-id',
    );
  });

  it('still lets a caller send its credentials and a JSON body', () => {
    expect(lowerCased(corsOptions([ORIGIN]).allowedHeaders)).toEqual([
      'authorization',
      'content-type',
    ]);
  });

  it('lets a cross-origin caller read the id the API gave its request', () => {
    expect(lowerCased(corsOptions([ORIGIN]).exposedHeaders)).toContain(
      'x-correlation-id',
    );
  });

  describe('as the application serves it', () => {
    let app: NestExpressApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [PingController],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>();
      app.enableCors(corsOptions([ORIGIN]));
      await app.init();
    });
    afterEach(() => app.close());

    it('answers a preflight asking for the correlation id header without allowing it', async () => {
      const res = await request(app.getHttpServer())
        .options('/ping')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-correlation-id');

      expect(res.status).toBe(204);
      expect(
        lowerCased(String(res.headers['access-control-allow-headers'])),
      ).toEqual(['authorization', 'content-type']);
    });

    it('exposes the correlation id header to the calling page', async () => {
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', ORIGIN);

      expect(
        lowerCased(String(res.headers['access-control-expose-headers'])),
      ).toContain('x-correlation-id');
    });
  });
});
