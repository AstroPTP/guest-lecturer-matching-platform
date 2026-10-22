import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createECDH, randomBytes } from 'node:crypto';
import * as webPush from 'web-push';
import * as prismaDouble from '../prisma';
import { prisma } from '../prisma';
import {
  BODY_LIMIT,
  MAX_SUBSCRIPTIONS_PER_USER,
  buildPayload,
  normalisePushEndpoint,
  publicKeyStatus,
  pushToUsers,
  readPushConfig,
  removeSubscription,
  saveSubscription,
  sendTest,
} from './push';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

const send = webPush.sendNotification as jest.Mock;

const vapid = (
  jest.requireActual<typeof import('web-push')>('web-push') as {
    generateVAPIDKeys: () => { publicKey: string; privateKey: string };
  }
).generateVAPIDKeys();

const ENV = {
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: 'mailto:glmp@example.com',
};

/** A browser's subscription keys: a P-256 public key and a 16-byte secret. */
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

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
  Object.assign(process.env, ENV);
  send.mockReset().mockResolvedValue({ statusCode: 201 });
  // Failed pushes and bad settings are logged as warnings; the tests cause both on purpose.
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  jest.restoreAllMocks();
});

function switchPushOff() {
  delete process.env.VAPID_PUBLIC_KEY;
}

describe('readPushConfig', () => {
  it('returns the three settings when all are present and valid', () => {
    expect(readPushConfig(ENV)).toEqual({
      publicKey: ENV.VAPID_PUBLIC_KEY,
      privateKey: ENV.VAPID_PRIVATE_KEY,
      subject: ENV.VAPID_SUBJECT,
    });
  });

  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])(
    'is off when %s is missing',
    (name) => {
      expect(readPushConfig({ ...ENV, [name]: undefined })).toBeNull();
    },
  );

  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])(
    'is off when %s is blank',
    (name) => {
      expect(readPushConfig({ ...ENV, [name]: '   ' })).toBeNull();
    },
  );

  it('is off, without throwing, when the keys are not valid keys', () => {
    expect(
      readPushConfig({ ...ENV, VAPID_PUBLIC_KEY: 'not-a-key' }),
    ).toBeNull();
    expect(
      readPushConfig({ ...ENV, VAPID_PRIVATE_KEY: 'not-a-key' }),
    ).toBeNull();
  });

  it('is off when the contact is neither a mailto nor an https address', () => {
    expect(
      readPushConfig({ ...ENV, VAPID_SUBJECT: 'glmp@example.com' }),
    ).toBeNull();
    expect(
      readPushConfig({ ...ENV, VAPID_SUBJECT: 'http://example.com' }),
    ).toBeNull();
  });
});

describe('publicKeyStatus', () => {
  it('reports the public key when push is on', () => {
    expect(publicKeyStatus()).toEqual({
      enabled: true,
      publicKey: vapid.publicKey,
    });
  });

  it('reports push as off, with no key, when it is not configured', () => {
    switchPushOff();
    expect(publicKeyStatus()).toEqual({ enabled: false, publicKey: null });
  });

  it('never includes the private key', () => {
    expect(JSON.stringify(publicKeyStatus())).not.toContain(vapid.privateKey);
  });
});

describe('normalisePushEndpoint', () => {
  it.each([
    FCM,
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABexample',
    'https://web.push.apple.com/QGLPLexample',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAexample',
    'https://api.push.apple.com/3/device/abc',
  ])('accepts %s', (endpoint) => {
    expect(normalisePushEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    ['plain http to a push service', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['the cloud metadata address over http', 'http://169.254.169.254/latest/'],
    [
      'the cloud metadata address over https',
      'https://169.254.169.254/latest/',
    ],
    ['localhost', 'https://localhost/fcm/send/abc'],
    ['a private address', 'https://10.0.0.5/fcm/send/abc'],
    ['an unknown host', 'https://push.example.com/send/abc'],
    ['a push host as a prefix', 'https://fcm.googleapis.com.evil.example/x'],
    ['a host that only ends like one', 'https://evilfcm.googleapis.com/x'],
    ['a suffix with no subdomain', 'https://notify.windows.com/x'],
    ['a lookalike of a suffix', 'https://evilnotify.windows.com/x'],
    [
      'credentials in front of a push host',
      'https://fcm.googleapis.com@evil.example/x',
    ],
    ['a username on a push host', 'https://user:pw@fcm.googleapis.com/x'],
    ['a backslash trick', 'https://evil.example\\@fcm.googleapis.com/x'],
    ['a non-default port', 'https://fcm.googleapis.com:8443/x'],
    ['another protocol', 'ftp://fcm.googleapis.com/x'],
    ['a script', 'javascript:alert(1)'],
    ['text with a space', 'https://fcm.googleapis.com/a b'],
    ['a newline', 'https://fcm.googleapis.com/a\nb'],
    ['not an address', 'not a url'],
    ['nothing', ''],
    [
      'an address that is too long',
      'https://fcm.googleapis.com/' + 'a'.repeat(2100),
    ],
  ])('refuses %s', (_label, endpoint) => {
    expect(normalisePushEndpoint(endpoint)).toBeNull();
  });

  it('returns the canonical form of an address, which is what is stored and used', () => {
    expect(
      normalisePushEndpoint('HTTPS://FCM.GOOGLEAPIS.COM:443/fcm/send/abc'),
    ).toBe('https://fcm.googleapis.com/fcm/send/abc');
  });
});

describe('buildPayload', () => {
  const notice = {
    title: 'New message',
    description: 'Ada Lee replied to you',
    href: '/guest_lecturer/messages',
  };

  it('holds the title, the body and the href, and nothing else', () => {
    const payload = buildPayload({
      ...notice,
      // Fields a caller might pass along by mistake must not reach a device.
      ...({ recipientId: 'auth0|secret', type: 'message', id: '9' } as object),
    });

    expect(Object.keys(payload).sort()).toEqual(['body', 'href', 'title']);
    expect(payload).toEqual({
      title: 'New message',
      body: 'Ada Lee replied to you',
      href: '/guest_lecturer/messages',
    });
  });

  it('leaves a body of exactly the limit alone', () => {
    const body = 'x'.repeat(BODY_LIMIT);
    expect(buildPayload({ ...notice, description: body }).body).toBe(body);
  });

  it('cuts a longer body to the limit, marking the cut', () => {
    const { body } = buildPayload({
      ...notice,
      description: 'word '.repeat(100),
    });
    expect(Array.from(body).length).toBeLessThanOrEqual(BODY_LIMIT);
    expect(body.endsWith('…')).toBe(true);
  });

  it('does not cut a character in half', () => {
    const { body } = buildPayload({
      ...notice,
      description: '😀'.repeat(300),
    });
    expect(Array.from(body).length).toBe(BODY_LIMIT);
    // A lone half of a pair would round-trip as a replacement character.
    expect(JSON.parse(JSON.stringify(body))).toBe(body);
    expect(body).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    'javascript:alert(1)',
    '/\\evil.example',
    'matches',
    '',
  ])('sends a device to the site root instead of %p', (href) => {
    expect(buildPayload({ ...notice, href }).href).toBe('/');
  });

  it('keeps a path with a query', () => {
    expect(
      buildPayload({ ...notice, href: '/guest_lecturer/discovery?from=5' })
        .href,
    ).toBe('/guest_lecturer/discovery?from=5');
  });
});

interface StoredDevice {
  subscription_id: bigint;
  user_id: bigint;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  last_used_at: Date;
}

/**
 * An in-memory table that honours the lookups and writes the subscribe route
 * makes, so a test can look at the rows afterwards instead of at the calls.
 */
function fakeDevices(rows: StoredDevice[]) {
  const table = prisma.push_subscriptions;
  let nextId = 100n;
  jest
    .spyOn(table, 'findUnique')
    .mockImplementation(((args: { where: { endpoint: string } }) =>
      Promise.resolve(
        rows.find((row) => row.endpoint === args.where.endpoint) ?? null,
      )) as never);
  jest.spyOn(table, 'create').mockImplementation(((args: {
    data: Omit<StoredDevice, 'subscription_id'>;
  }) => {
    const row = { subscription_id: nextId++, ...args.data };
    rows.push(row);
    return Promise.resolve(row);
  }) as never);
  jest.spyOn(table, 'updateMany').mockImplementation(((args: {
    where: {
      subscription_id: bigint;
      OR: ({ user_id: bigint } | { p256dh: string; auth: string })[];
    };
    data: Partial<StoredDevice>;
  }) => {
    const row = rows.find(
      (candidate) => candidate.subscription_id === args.where.subscription_id,
    );
    const allowed = args.where.OR.some((condition) =>
      Object.entries(condition).every(
        ([field, value]) => row?.[field as keyof StoredDevice] === value,
      ),
    );
    if (!row || !allowed) return Promise.resolve({ count: 0 });
    Object.assign(row, args.data);
    return Promise.resolve({ count: 1 });
  }) as never);
  return rows;
}

function storedDevice(
  userId: bigint,
  overrides: Partial<StoredDevice> = {},
): StoredDevice {
  return {
    subscription_id: 1n,
    user_id: userId,
    endpoint: FCM,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: 'Earlier/1.0',
    last_used_at: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('saveSubscription', () => {
  const input = { endpoint: FCM, ...keys };
  const otherKeys = deviceKeys();

  it('is refused while push is off, and writes nothing', async () => {
    switchPushOff();
    const rows = fakeDevices([]);

    await expect(saveSubscription('auth0|a', input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rows).toEqual([]);
  });

  describe('when the address has not been seen before', () => {
    it('creates the device for the caller', async () => {
      const rows = fakeDevices([]);

      await expect(
        saveSubscription('auth0|a', input, 'Mozilla/5.0 (iPhone)'),
      ).resolves.toEqual({ subscribed: true });

      expect(rows).toEqual([
        expect.objectContaining({
          user_id: 1n,
          endpoint: FCM,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: 'Mozilla/5.0 (iPhone)',
        }),
      ]);
    });

    it('stores the canonical form of the address', async () => {
      const rows = fakeDevices([]);

      await saveSubscription('auth0|a', {
        ...input,
        endpoint: 'HTTPS://FCM.GOOGLEAPIS.COM/fcm/send/abc',
      });

      expect(rows[0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc');
    });

    it('keeps no more than 200 characters of the browser description', async () => {
      const rows = fakeDevices([]);

      await saveSubscription('auth0|a', input, 'A'.repeat(500));

      expect(rows[0].user_agent).toHaveLength(200);
    });

    it('reads the row another request wrote at the same moment, and decides again', async () => {
      const winner = storedDevice(2n, {
        p256dh: otherKeys.p256dh,
        auth: otherKeys.auth,
      });
      jest
        .spyOn(prisma.push_subscriptions, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner as never);
      jest
        .spyOn(prisma.push_subscriptions, 'create')
        .mockRejectedValueOnce(
          Object.assign(new Error('unique'), { code: 'P2002' }),
        );
      const updateMany = jest.spyOn(prisma.push_subscriptions, 'updateMany');

      // The winner is another person's, with other keys: the caller is refused.
      await expect(saveSubscription('auth0|a', input)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe("when the address is already the caller's", () => {
    it('refreshes the keys and the last-used time, and adds no second row', async () => {
      const rows = fakeDevices([storedDevice(1n)]);

      await saveSubscription('auth0|a', {
        endpoint: FCM,
        ...otherKeys,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_id: 1n,
        p256dh: otherKeys.p256dh,
        auth: otherKeys.auth,
      });
      expect(rows[0].last_used_at.getTime()).toBeGreaterThan(
        new Date('2026-10-01T00:00:00.000Z').getTime(),
      );
    });
  });

  describe("when the address is someone else's", () => {
    it('hands it to the caller when the keys are exactly the stored ones', async () => {
      const rows = fakeDevices([storedDevice(2n)]);

      await expect(saveSubscription('auth0|a', input)).resolves.toEqual({
        subscribed: true,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(1n);
    });

    it.each([
      ['the public key', { p256dh: otherKeys.p256dh }],
      ['the secret', { auth: otherKeys.auth }],
      ['both keys', { p256dh: otherKeys.p256dh, auth: otherKeys.auth }],
    ])(
      'answers 409 and changes nothing when %s differs',
      async (_label, changed) => {
        const before = storedDevice(2n);
        const rows = fakeDevices([{ ...before }]);

        await expect(
          saveSubscription('auth0|a', { ...input, ...changed }),
        ).rejects.toMatchObject({ status: 409 });

        expect(rows).toEqual([before]);
      },
    );

    it('never overwrites the stored keys, even though the caller presented a valid address', async () => {
      const rows = fakeDevices([storedDevice(2n)]);

      await expect(
        saveSubscription('auth0|a', { endpoint: FCM, ...otherKeys }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(rows[0]).toMatchObject({
        user_id: 2n,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
    });

    it('answers 409 when the row changed hands between the read and the write', async () => {
      fakeDevices([storedDevice(2n)]);
      // A write that finds the row no longer matches what was checked.
      jest
        .spyOn(prisma.push_subscriptions, 'updateMany')
        .mockResolvedValue({ count: 0 });

      await expect(saveSubscription('auth0|a', input)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['http to the cloud metadata address', 'http://169.254.169.254/latest/'],
    ['https to the cloud metadata address', 'https://169.254.169.254/latest/'],
    ['an unknown host', 'https://push.example.com/abc'],
    ['not an address', 'nonsense'],
  ])('answers 400 and stores nothing for %s', async (_label, endpoint) => {
    const rows = fakeDevices([]);

    await expect(
      saveSubscription('auth0|a', { ...input, endpoint }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toEqual([]);
  });

  it('keeps five devices: the sixth and any beyond replace the least recently used', async () => {
    fakeDevices([]);
    const findMany = jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockResolvedValue([
        { subscription_id: 3n },
        { subscription_id: 1n },
      ] as never);
    const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

    await saveSubscription('auth0|a', input);

    expect(MAX_SUBSCRIPTIONS_PER_USER).toBe(5);
    // Newest first, skipping the five that stay: what is left is what goes.
    expect(findMany).toHaveBeenCalledWith({
      where: { user_id: 1n },
      orderBy: [{ last_used_at: 'desc' }, { subscription_id: 'desc' }],
      skip: 5,
      select: { subscription_id: true },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { subscription_id: { in: [3n, 1n] } },
    });
  });

  it('removes nothing while the person is within the limit', async () => {
    fakeDevices([]);
    const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

    await saveSubscription('auth0|a', input);

    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('removeSubscription', () => {
  /** An in-memory table that honours the filter it is given. */
  function fakeTable(rows: { user_id: bigint; endpoint: string }[]) {
    jest
      .spyOn(prisma.push_subscriptions, 'deleteMany')
      .mockImplementation(((args: {
        where: { user_id: bigint; endpoint: string };
      }) => {
        const { where } = args;
        const before = rows.length;
        const kept = rows.filter(
          (row) =>
            !(row.user_id === where.user_id && row.endpoint === where.endpoint),
        );
        rows.splice(0, rows.length, ...kept);
        return Promise.resolve({ count: before - kept.length });
      }) as never);
    return rows;
  }

  it('removes the caller own device', async () => {
    const rows = fakeTable([{ user_id: 1n, endpoint: FCM }]);

    await expect(removeSubscription('auth0|a', FCM)).resolves.toEqual({
      removed: true,
    });
    expect(rows).toEqual([]);
  });

  it("leaves another person's device alone, and says nothing was removed", async () => {
    const rows = fakeTable([{ user_id: 2n, endpoint: FCM }]);

    // The caller resolves to user 1; the device belongs to user 2.
    await expect(removeSubscription('auth0|a', FCM)).resolves.toEqual({
      removed: false,
    });
    expect(rows).toEqual([{ user_id: 2n, endpoint: FCM }]);
  });

  it("removes the second person's own device and not the first's", async () => {
    const other = 'https://web.push.apple.com/other-device';
    const rows = fakeTable([
      { user_id: 1n, endpoint: FCM },
      { user_id: 2n, endpoint: other },
    ]);
    jest.spyOn(prismaDouble, 'resolveUserId').mockResolvedValueOnce(2n);

    await removeSubscription('auth0|b', other);

    expect(rows).toEqual([{ user_id: 1n, endpoint: FCM }]);
  });

  it('filters by the caller as well as by the address', async () => {
    const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

    await removeSubscription('auth0|a', FCM);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { user_id: 1n, endpoint: FCM },
    });
  });

  it('still works while push is off, so a device can always be removed', async () => {
    switchPushOff();

    await expect(removeSubscription('auth0|a', FCM)).resolves.toEqual({
      removed: false,
    });
  });
});

describe('pushToUsers', () => {
  const notice = {
    title: 'New message',
    description: 'Ada Lee replied to you',
    href: '/guest_lecturer/messages',
  };
  const device = (id: bigint, endpoint = FCM + id) => ({
    subscription_id: id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });

  function devices(...rows: ReturnType<typeof device>[]) {
    return jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockResolvedValue(rows as never);
  }

  it('sends the notice to each device the person has', async () => {
    devices(device(1n), device(2n));

    await expect(pushToUsers([1n], notice)).resolves.toBe(2);

    expect(send).toHaveBeenCalledTimes(2);
    const [subscription, body, options] = send.mock.calls[0] as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { vapidDetails: { subject: string }; TTL: number },
    ];
    expect(subscription).toEqual({ endpoint: FCM + 1n, keys });
    expect(JSON.parse(body)).toEqual({
      title: 'New message',
      body: 'Ada Lee replied to you',
      href: '/guest_lecturer/messages',
    });
    expect(options.vapidDetails.subject).toBe('mailto:glmp@example.com');
    expect(options.TTL).toBeGreaterThan(0);
  });

  it('looks up the devices of exactly the people named', async () => {
    const findMany = devices();

    await pushToUsers([4n, 5n], notice);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: { in: [4n, 5n] } } }),
    );
  });

  it('sends only the title, body and href', async () => {
    devices(device(1n));

    await pushToUsers([1n], {
      ...notice,
      ...({
        recipientId: 'auth0|x',
        type: 'message',
        actionLabel: 'Open',
      } as object),
    });

    const [, message] = send.mock.calls[0] as [unknown, string];
    const body = JSON.parse(message) as object;
    expect(Object.keys(body).sort()).toEqual(['body', 'href', 'title']);
  });

  it('does nothing while push is off', async () => {
    switchPushOff();
    const findMany = devices(device(1n));

    await expect(pushToUsers([1n], notice)).resolves.toBe(0);

    expect(findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing for nobody', async () => {
    const findMany = devices(device(1n));

    await expect(pushToUsers([], notice)).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    'deletes a device the push service answers %i for, and keeps the others',
    async (status) => {
      devices(device(1n), device(2n));
      send
        .mockRejectedValueOnce(
          Object.assign(new Error('gone'), { statusCode: status }),
        )
        .mockResolvedValueOnce({ statusCode: 201 });
      const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

      await expect(pushToUsers([1n], notice)).resolves.toBe(1);

      expect(deleteMany).toHaveBeenCalledWith({
        where: { subscription_id: { in: [1n] } },
      });
    },
  );

  it.each([400, 401, 403, 413, 429, 500, 503])(
    'keeps a device the push service answers %i for',
    async (status) => {
      devices(device(1n));
      send.mockRejectedValueOnce(
        Object.assign(new Error('refused'), { statusCode: status }),
      );
      const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

      await expect(pushToUsers([1n], notice)).resolves.toBe(0);
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );

  it('keeps a device when the push service cannot be reached', async () => {
    devices(device(1n));
    send.mockRejectedValueOnce(new Error('Socket timeout'));
    const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

    await expect(pushToUsers([1n], notice)).resolves.toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('records when the devices that took the message were last used', async () => {
    devices(device(1n), device(2n));
    send
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(new Error('down'));
    const updateMany = jest.spyOn(prisma.push_subscriptions, 'updateMany');

    await pushToUsers([1n], notice);

    expect(updateMany).toHaveBeenCalledWith({
      where: { subscription_id: { in: [1n] } },
      data: { last_used_at: expect.any(Date) as unknown },
    });
  });

  it('never rejects, even when the database does', async () => {
    jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockRejectedValue(new Error('connection lost'));

    await expect(pushToUsers([1n], notice)).resolves.toBe(0);
  });

  it('never logs a device address or its keys', async () => {
    devices(device(1n, FCM));
    send.mockRejectedValueOnce(
      Object.assign(new Error(`failed for ${FCM} with ${keys.auth}`), {
        statusCode: 500,
        endpoint: FCM,
        body: keys.p256dh,
      }),
    );
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await pushToUsers([1n], notice);

    expect(warn).toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('fcm.googleapis.com');
    expect(logged).not.toContain(keys.auth);
    expect(logged).not.toContain(keys.p256dh);
    expect(logged).not.toContain(vapid.privateKey);
  });
});

describe('sendTest', () => {
  it('sends a test to the caller own devices and says how many took it', async () => {
    const findMany = jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockResolvedValue([
        { subscription_id: 1n, endpoint: FCM, ...keys },
      ] as never);

    await expect(sendTest('auth0|a')).resolves.toEqual({ sent: 1 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: { in: [1n] } } }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports none when the person has no device set up', async () => {
    await expect(sendTest('auth0|a')).resolves.toEqual({ sent: 0 });
  });

  it('is refused while push is off', async () => {
    switchPushOff();
    await expect(sendTest('auth0|a')).rejects.toBeInstanceOf(NotFoundException);
  });
});
