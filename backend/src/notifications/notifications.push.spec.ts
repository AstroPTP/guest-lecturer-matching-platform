import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createECDH, randomBytes } from 'node:crypto';
import * as webPush from 'web-push';
import { prisma } from '../prisma';
import { NotificationsService } from './notifications.service';
import { pushToUsers } from './push';

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

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const device = {
  subscription_id: 1n,
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc:APA91bExample',
  p256dh: ecdh.getPublicKey().toString('base64url'),
  auth: randomBytes(16).toString('base64url'),
};

/** Lets the sending that a notification started in the background finish. */
async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('NotificationsService and pushed notifications', () => {
  let service: NotificationsService;
  let lookup: jest.SpyInstance;
  let saved: Record<string, string | undefined>;

  const dto = {
    recipientId: 'auth0|recipient',
    type: 'message' as const,
    title: 'New message',
    description: 'Ada Lee replied to you',
    actionLabel: 'Open',
    href: '/guest_lecturer/messages',
  };
  const row = {
    notification_id: 10n,
    user_id: 1n,
    type: 'message',
    title: dto.title,
    description: dto.description,
    action_label: dto.actionLabel,
    href: dto.href,
    read: false,
    created_at: new Date('2026-10-01T02:00:00.000Z'),
  };

  /** The text of each push made, as it left the server. */
  function messages() {
    return (send.mock.calls as [unknown, string][]).map(([, text]) => text);
  }

  /** What a device would have been sent, one entry per push made. */
  function sent() {
    return messages().map(
      (text) =>
        JSON.parse(text) as { title: string; body: string; href: string },
    );
  }

  beforeEach(async () => {
    saved = {
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    };
    process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:glmp@example.com';
    send.mockReset().mockResolvedValue({ statusCode: 201 });
    // A push that fails is logged as a warning; the tests below cause that on purpose.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    lookup = jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockResolvedValue([device] as never);
    jest.spyOn(prisma.notifications, 'create').mockResolvedValue(row);

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.restoreAllMocks();
  });

  it('sends a notice to the recipient as soon as create has stored it', async () => {
    await service.create(dto);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(sent()[0]).toEqual({
      title: 'New message',
      body: 'Ada Lee replied to you',
      href: '/guest_lecturer/messages',
    });
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: { in: [1n] }, users: { deletedat: null } },
      }),
    );
  });

  it('sends only the title, body and href, not who it was for or what kind it was', async () => {
    await service.create(dto);
    await settle();

    expect(Object.keys(sent()[0]).sort()).toEqual(['body', 'href', 'title']);
    expect(messages()[0]).not.toContain('auth0|recipient');
    expect(messages()[0]).not.toContain('actionLabel');
  });

  it('cuts a long description to 140 characters', async () => {
    await service.create({ ...dto, description: 'long '.repeat(80) });
    await settle();

    expect(Array.from(sent()[0].body).length).toBeLessThanOrEqual(140);
  });

  it('sends nothing while push is off', async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    await service.create(dto);
    await settle();

    expect(send).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('does not make the request wait for the push service', async () => {
    send.mockReturnValue(new Promise(() => undefined));

    await expect(service.create(dto)).resolves.toMatchObject({ id: '10' });
  });

  it('does not fail the request when sending fails', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('boom'), { statusCode: 500 }),
    );

    await expect(service.create(dto)).resolves.toMatchObject({ id: '10' });
    await settle();
  });

  it('does not fail the request when the device lookup fails', async () => {
    jest
      .spyOn(prisma.push_subscriptions, 'findMany')
      .mockRejectedValue(new Error('connection lost'));

    await expect(service.create(dto)).resolves.toMatchObject({ id: '10' });
    await settle();
  });

  it('does not push a notice that could not be stored', async () => {
    jest
      .spyOn(prisma.notifications, 'create')
      .mockRejectedValue(new Error('constraint'));

    await expect(service.create(dto)).rejects.toThrow('constraint');
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('deletes a device that has gone, once the push service says so', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('gone'), { statusCode: 410 }),
    );
    const deleteMany = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

    await service.create(dto);
    await settle();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { subscription_id: { in: [1n] } },
    });
  });

  describe('createUnlessRecent', () => {
    it('sends the notice when it is raised', async () => {
      await expect(service.createUnlessRecent(dto)).resolves.toBe(true);
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the same notice was raised in the last day', async () => {
      jest
        .spyOn(prisma.notifications, 'findFirst')
        .mockResolvedValue({ notification_id: 9n } as never);

      await expect(service.createUnlessRecent(dto)).resolves.toBe(false);
      await settle();

      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('createOrRefreshUnread', () => {
    // A clock the tests move, and a conversation of their own each, so that what
    // one test pushed is not remembered by the next.
    let clock = 1_800_000_000_000;
    let conversation = 0;
    const message = () => ({
      ...dto,
      href: `/guest_lecturer/messages?with=${conversation}`,
    });

    beforeEach(() => {
      clock += 60 * 60_000;
      conversation += 1;
      jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });

    /**
     * A transaction that behaves as the database does: the first message in a
     * conversation adds an unread notice, and each later one moves it, until
     * the person reads it.
     */
    function database() {
      const unread = new Set<string>();
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
          work({
            $executeRaw: () => Promise.resolve(0),
            notifications: {
              updateMany: (args: {
                where: { user_id: bigint; href: string };
              }) =>
                Promise.resolve({
                  count: unread.has(`${args.where.user_id}:${args.where.href}`)
                    ? 1
                    : 0,
                }),
              create: (args: { data: { user_id: bigint; href: string } }) => {
                unread.add(`${args.data.user_id}:${args.data.href}`);
                return Promise.resolve({});
              },
            },
          }),
        );
      return {
        read: (href: string) => unread.delete(`1:${href}`),
      };
    }

    it('sends the notice when it adds a new one', async () => {
      database();

      await service.createOrRefreshUnread(message());
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends one push for three quick messages in one conversation', async () => {
      database();

      await service.createOrRefreshUnread(message());
      await service.createOrRefreshUnread(message());
      await service.createOrRefreshUnread(message());
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      // The skipped ones did not so much as look for devices.
      expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('pushes again once five minutes have passed since the last push', async () => {
      database();

      await service.createOrRefreshUnread(message());
      clock += 4 * 60_000 + 59_000;
      await service.createOrRefreshUnread(message());
      await settle();
      expect(send).toHaveBeenCalledTimes(1);

      clock += 1_000;
      await service.createOrRefreshUnread(message());
      await settle();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('counts the five minutes from the last push, not from the first message', async () => {
      database();

      await service.createOrRefreshUnread(message());
      clock += 6 * 60_000;
      await service.createOrRefreshUnread(message());
      clock += 2 * 60_000;
      await service.createOrRefreshUnread(message());
      await settle();

      expect(send).toHaveBeenCalledTimes(2);
    });

    it('pushes each conversation separately', async () => {
      database();
      const first = message();
      conversation += 1;
      const second = message();

      await service.createOrRefreshUnread(first);
      await service.createOrRefreshUnread(second);
      await service.createOrRefreshUnread(first);
      await service.createOrRefreshUnread(second);
      await settle();

      expect(send).toHaveBeenCalledTimes(2);
    });

    it('pushes a message that arrives after the person read the last notice', async () => {
      const db = database();

      await service.createOrRefreshUnread(message());
      db.read(message().href);
      await service.createOrRefreshUnread(message());
      await settle();

      // Read, so the next message is a new notice and not a moved one.
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('sends nothing when the transaction fails', async () => {
      jest
        .spyOn(prisma, '$transaction')
        .mockRejectedValue(new Error('deadlock'));

      await expect(service.createOrRefreshUnread(message())).rejects.toThrow(
        'deadlock',
      );
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('does not hold back the next message because a push failed to send', async () => {
      database();
      send.mockRejectedValue(
        Object.assign(new Error('down'), { statusCode: 503 }),
      );

      await service.createOrRefreshUnread(message());
      await service.createOrRefreshUnread(message());
      await settle();

      // Pushed once, as the rule allows. The failure is the push service's to
      // recover from; the next push comes after the window.
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('createForAdmins', () => {
    const notice = {
      type: 'admin' as const,
      title: 'Session cancelled',
      description: 'A coordinator cancelled a session',
      actionLabel: 'Review',
      href: '/admin/events',
    };

    it('sends the notice to every administrator that was notified, in one lookup', async () => {
      jest
        .spyOn(prisma.users, 'findMany')
        .mockResolvedValue([{ userid: 7n }, { userid: 8n }] as never);
      jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 2 });

      await expect(service.createForAdmins(notice)).resolves.toBe(2);
      await settle();

      expect(lookup).toHaveBeenCalledTimes(1);
      expect(lookup).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: { in: [7n, 8n] }, users: { deletedat: null } },
        }),
      );
      expect(sent()[0]).toEqual({
        title: 'Session cancelled',
        body: 'A coordinator cancelled a session',
        href: '/admin/events',
      });
    });

    it('sends each of several notices to every administrator', async () => {
      jest
        .spyOn(prisma.users, 'findMany')
        .mockResolvedValue([{ userid: 7n }, { userid: 8n }] as never);
      jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 4 });

      await expect(
        service.createForAdmins([
          notice,
          { ...notice, title: 'Session withdrawn', href: '/admin/events/2' },
        ]),
      ).resolves.toBe(4);
      await settle();

      expect(sent().map((message) => message.title)).toEqual([
        'Session cancelled',
        'Session withdrawn',
      ]);
      expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('sends nothing when there is no active administrator', async () => {
      await expect(service.createForAdmins(notice)).resolves.toBe(0);
      await settle();

      expect(send).not.toHaveBeenCalled();
    });
  });

  it('pushToUsers is the only way out: nothing but the three fields is built from a notice', async () => {
    await pushToUsers([1n], {
      ...dto,
    });

    expect(Object.keys(sent()[0]).sort()).toEqual(['body', 'href', 'title']);
  });
});
