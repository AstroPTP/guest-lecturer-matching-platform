import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * The application module validates the environment as it is constructed, so
 * these values have to be in place before the module is compiled. They are set
 * here rather than read from a .env file so the suite is hermetic: it needs no
 * local file, no tenant and no network, and it behaves the same on CI.
 */
const TEST_ENV: Record<string, string> = {
  PORT: '3001',
  NODE_ENV: 'test',
  FRONTEND_URL: 'http://localhost:3000',
  AUTH0_DOMAIN: '127.0.0.1:9099',
  AUTH0_AUDIENCE: 'https://glmp-api.curtin.edu.au',
  AUTH0_ROLES_CLAIM: 'https://glmp.curtin.edu.au/roles',
  DATABASE_URL:
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres?pgbouncer=true',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let saved: Record<string, string | undefined>;

  beforeEach(async () => {
    saved = {};
    for (const [key, value] of Object.entries(TEST_ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  // GET / carries @Public(), so the global auth guard lets it through with no
  // Authorization header. If this starts returning 401, the decorator has been
  // dropped rather than the guard being wrong.
  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});
