import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import {
  startAuthStandIn,
  type AuthStandIn,
} from '../auth/testing/auth-stand-in';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { GuestSpeakersController } from '../guest-speakers/guest-speakers.controller';
import { GuestSpeakersService } from '../guest-speakers/guest-speakers.service';
import { UnitCoordinatorsController } from '../unit-coordinators/unit-coordinators.controller';
import { UnitCoordinatorsService } from '../unit-coordinators/unit-coordinators.service';
import { DISCOVERY_SORTS } from './discovery-sort';

/**
 * The `?sort=` parameter on the two Discovery lists, over HTTP with the same
 * validation pipe and error filter the application installs.
 */
describe('GET /guest-speakers and GET /unit-coordinators with ?sort=', () => {
  let app: INestApplication;
  let auth: AuthStandIn;
  let guests: GuestSpeakersService;
  let coordinators: UnitCoordinatorsService;

  const lists = [
    {
      path: '/guest-speakers',
      role: 'unit_coordinator',
      subject: 'auth0|coord-1',
      service: () => guests,
    },
    {
      path: '/unit-coordinators',
      role: 'guest_speaker',
      subject: 'auth0|guest-1',
      service: () => coordinators,
    },
  ];

  const get = (path: string, role: string, subject: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('Authorization', `Bearer ${auth.tokenFor([role], subject)}`);

  beforeAll(async () => {
    auth = await startAuthStandIn();
  });

  afterAll(async () => {
    await auth.stop();
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: auth.imports,
      controllers: [GuestSpeakersController, UnitCoordinatorsController],
      providers: [
        GuestSpeakersService,
        UnitCoordinatorsService,
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
    guests = module.get(GuestSpeakersService);
    coordinators = module.get(UnitCoordinatorsService);
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe.each(lists)('$path', ({ path, role, subject, service }) => {
    it.each([...DISCOVERY_SORTS])(
      'accepts sort=%s and hands it to the service with the signed-in user',
      async (sort) => {
        const list = jest.spyOn(service(), 'findAll').mockResolvedValue([]);
        await get(`${path}?sort=${sort}`, role, subject).expect(200);
        expect(list).toHaveBeenCalledWith(subject, sort);
      },
    );

    it('gives the service no sort when none is asked for, so it picks the default', async () => {
      const list = jest.spyOn(service(), 'findAll').mockResolvedValue([]);
      await get(path, role, subject).expect(200);
      expect(list).toHaveBeenCalledWith(subject, undefined);
    });

    it.each([
      ['an unknown value', 'sort=loudest'],
      ['a different case', 'sort=Name'],
      ['an empty value', 'sort='],
      ['a list', 'sort=name&sort=topics'],
      ['a score', 'sort=score'],
      ['an unknown parameter', 'sort=name&order=desc'],
    ])(
      'refuses %s with a 400 and never reaches the service',
      async (_label, query) => {
        const list = jest.spyOn(service(), 'findAll').mockResolvedValue([]);
        const res = await get(`${path}?${query}`, role, subject).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
        expect(list).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['an administrator', 'ccae_admin'],
      ['the same role as the list is about', ''],
      ['a token with no roles', null],
    ])(
      'refuses %s with a 403 and never reaches the service',
      async (_who, other) => {
        const list = jest.spyOn(service(), 'findAll').mockResolvedValue([]);
        // The other side's role: a guest speaker for the coordinator list, and the reverse.
        const wrong =
          other === ''
            ? role === 'unit_coordinator'
              ? 'guest_speaker'
              : 'unit_coordinator'
            : other;
        const token = auth.tokenFor(wrong === null ? [] : [wrong], subject);
        const res = await request(app.getHttpServer() as Server)
          .get(`${path}?sort=name`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        expect(res.body).toMatchObject({ code: 'AUTHZ_INSUFFICIENT_ROLE' });
        expect(list).not.toHaveBeenCalled();
      },
    );

    it('still needs a signed-in user', async () => {
      const list = jest.spyOn(service(), 'findAll').mockResolvedValue([]);
      await request(app.getHttpServer() as Server)
        .get(`${path}?sort=name`)
        .expect(401);
      expect(list).not.toHaveBeenCalled();
    });
  });
});
