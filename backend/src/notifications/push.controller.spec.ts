import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createECDH, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as webPush from 'web-push';
import { AppRole } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import * as prismaDouble from '../prisma';
import { prisma } from '../prisma';
import { SubscribePushDto } from './dto/push-subscription.dto';
import { PushController } from './push.controller';

jest.mock('web-push', () => ({
  sendNotification: jest.fn(),
  encrypt: jest.fn(),
}));

const send = webPush.sendNotification as jest.Mock;

const vapid = (
  jest.requireActual<typeof import('web-push')>('web-push') as {
    generateVAPIDKeys: () => { publicKey: string; privateKey: string };
  }
).generateVAPIDKeys();

function deviceKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

const FCM = 'https://fcm.googleapis.com/fcm/send/abc:APA91bExample_token-1';
const keys = deviceKeys();

/** One user id per person for the whole file, as in the real lookup, so a limit used up in one test is not met in another. */
const people = new Map<string, bigint>();

let app: INestApplication<App>;
let saved: Record<string, string | undefined>;

/**
 * Stands in for the JWT guard, which AuthModule registers. Registered after the
 * throttler below, in the order the real guards run: the throttler is first, so
 * when it counts a request nothing has yet said who the caller is. A limit that
 * depends on the signed-in person has to be applied later than that.
 */
@Injectable()
class SignInAsHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    (request as Request & { user: unknown }).user = {
      id: request.header('x-test-user') ?? 'auth0|alice',
      roles: [],
    };
    return true;
  }
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
    controllers: [PushController],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: SignInAsHeaderGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  saved = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:glmp@example.com';
  send.mockReset().mockResolvedValue({ statusCode: 201 });
  // The test double maps every sign-in to one user. Give each its own, as the
  // real lookup does, since the limit is per person.
  jest.spyOn(prismaDouble, 'resolveUserId').mockImplementation((id: string) => {
    if (!people.has(id)) people.set(id, BigInt(people.size + 1));
    return Promise.resolve(people.get(id) as bigint);
  });
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  jest.restoreAllMocks();
});

const http = () => request(app.getHttpServer());

describe('GET /notifications/push/key', () => {
  it('says push is on and gives the public key', async () => {
    const response = await http().get('/notifications/push/key').expect(200);

    expect(response.body).toEqual({
      enabled: true,
      publicKey: vapid.publicKey,
    });
  });

  it('says push is off, with no key, when it is not configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const response = await http().get('/notifications/push/key').expect(200);

    expect(response.body).toEqual({ enabled: false, publicKey: null });
  });
});

describe('POST /notifications/push/subscribe', () => {
  const body = { endpoint: FCM, keys };

  it('stores the device for the caller in the token', async () => {
    const create = jest.spyOn(prisma.push_subscriptions, 'create');

    await http()
      .post('/notifications/push/subscribe')
      .set('User-Agent', 'GlmpTest/1.0')
      .send(body)
      .expect(201, { subscribed: true });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 1n,
        endpoint: FCM,
        user_agent: 'GlmpTest/1.0',
      }) as unknown,
    });
  });

  it("answers 409 when the address is another person's and the keys differ", async () => {
    const other = deviceKeys();
    jest.spyOn(prisma.push_subscriptions, 'findUnique').mockResolvedValue({
      subscription_id: 5n,
      user_id: 2n,
      ...other,
    } as never);
    const updateMany = jest.spyOn(prisma.push_subscriptions, 'updateMany');
    const create = jest.spyOn(prisma.push_subscriptions, 'create');

    await http().post('/notifications/push/subscribe').send(body).expect(409);

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['http to the cloud metadata address', 'http://169.254.169.254/latest/'],
    ['an unknown https host', 'https://push.example.com/abc'],
  ])('answers 400 for %s and stores nothing', async (_label, endpoint) => {
    const create = jest.spyOn(prisma.push_subscriptions, 'create');

    await http()
      .post('/notifications/push/subscribe')
      .send({ ...body, endpoint })
      .expect(400);

    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['no keys', { endpoint: FCM }],
    ['a short public key', { endpoint: FCM, keys: { ...keys, p256dh: 'abc' } }],
    ['a short secret', { endpoint: FCM, keys: { ...keys, auth: 'abc' } }],
    ['no endpoint', { keys }],
    ['an endpoint that is not text', { endpoint: 5, keys }],
    [
      'a key of the right length that is not a point on the curve',
      { endpoint: FCM, keys: { ...keys, p256dh: 'A'.repeat(87) } },
    ],
    ['fields the route does not know', { ...body, expirationTime: null }],
    [
      'an address far too long',
      { endpoint: 'https://fcm.googleapis.com/' + 'a'.repeat(3000), keys },
    ],
  ])('answers 400 for %s', async (_label, payload) => {
    const create = jest.spyOn(prisma.push_subscriptions, 'create');

    await http()
      .post('/notifications/push/subscribe')
      .send(payload)
      .expect(400);

    expect(create).not.toHaveBeenCalled();
  });

  it('answers 404 while push is off', async () => {
    delete process.env.VAPID_SUBJECT;
    const create = jest.spyOn(prisma.push_subscriptions, 'create');

    await http().post('/notifications/push/subscribe').send(body).expect(404);

    expect(create).not.toHaveBeenCalled();
  });
});

describe('DELETE /notifications/push/subscribe', () => {
  it('removes the caller own device, filtering by the caller as well as the address', async () => {
    const deleteMany = jest
      .spyOn(prisma.push_subscriptions, 'deleteMany')
      .mockResolvedValue({ count: 1 });

    await http()
      .delete('/notifications/push/subscribe')
      .send({ endpoint: FCM })
      .expect(200, { removed: true });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { user_id: 1n, endpoint: FCM },
    });
  });

  it('answers that nothing was removed for a device that is not the caller', async () => {
    jest
      .spyOn(prisma.push_subscriptions, 'deleteMany')
      .mockResolvedValue({ count: 0 });

    await http()
      .delete('/notifications/push/subscribe')
      .send({ endpoint: FCM })
      .expect(200, { removed: false });
  });

  it('answers 400 when no address is given', async () => {
    await http().delete('/notifications/push/subscribe').send({}).expect(400);
  });
});

describe('POST /notifications/push/test', () => {
  it('sends to the caller and says how many devices took it', async () => {
    jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockResolvedValue([
        { subscription_id: 1n, endpoint: FCM, ...keys },
      ] as never);

    await http()
      .post('/notifications/push/test')
      .set('x-test-user', 'auth0|test-sender')
      .expect(201, { sent: 1 });
  });

  it('allows three a minute for a person and then answers 429', async () => {
    const as = (person: string) =>
      http().post('/notifications/push/test').set('x-test-user', person);

    await as('auth0|busy').expect(201);
    await as('auth0|busy').expect(201);
    await as('auth0|busy').expect(201);
    const refused = await as('auth0|busy').expect(429);
    expect(refused.headers['retry-after']).toBe('60');
  });

  it('counts each person separately although every request comes from one address', async () => {
    const as = (person: string) =>
      http().post('/notifications/push/test').set('x-test-user', person);

    for (let i = 0; i < 3; i += 1) {
      await as('auth0|crowded-one').expect(201);
    }
    await as('auth0|crowded-one').expect(429);
    await as('auth0|crowded-two').expect(201);
    await as('auth0|crowded-three').expect(201);
  });

  it('is not limited by address, which the throttler would see for everyone alike', () => {
    const handler = (
      PushController.prototype as unknown as Record<string, object>
    ).test;
    const limit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      handler,
    ) as unknown;

    expect(limit).toBeUndefined();
  });

  it('answers 404 while push is off', async () => {
    delete process.env.VAPID_PUBLIC_KEY;

    await http()
      .post('/notifications/push/test')
      .set('x-test-user', 'auth0|off')
      .expect(404);
  });
});

describe('the subscription body', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('accepts the shape a browser sends', async () => {
    await expect(
      pipe.transform(
        { endpoint: FCM, keys },
        { type: 'body', metatype: SubscribePushDto },
      ),
    ).resolves.toBeInstanceOf(SubscribePushDto);
  });
});

describe('who may use the routes', () => {
  const guard = new RolesGuard(new Reflector());

  function contextFor(handler: object, roles: AppRole[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => PushController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u', roles } }),
      }),
    } as unknown as ExecutionContext;
  }

  it.each(['key', 'subscribe', 'unsubscribe', 'test'] as const)(
    'lets every signed-in role reach %s',
    (name) => {
      const handler = PushController.prototype[name];
      for (const role of [
        AppRole.GuestSpeaker,
        AppRole.UnitCoordinator,
        AppRole.CcaeAdmin,
      ]) {
        expect(guard.canActivate(contextFor(handler, [role]))).toBe(true);
      }
    },
  );
});
