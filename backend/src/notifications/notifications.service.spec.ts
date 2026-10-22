import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { prisma } from '../prisma';

describe('NotificationsService', () => {
  let service: NotificationsService;

  // The double's resolveUserId maps every Auth0 id to user 1n.
  const recipientId = 'auth0|recipient';
  const createdAt = new Date('2026-10-01T02:00:00.000Z');
  const row = {
    notification_id: 10n,
    user_id: 1n,
    type: 'match',
    title: 'New match',
    description: 'You matched with a coordinator',
    action_label: 'View match',
    href: '/matches',
    read: false,
    created_at: createdAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores a notification against the recipient and returns it unread', async () => {
    const create = jest
      .spyOn(prisma.notifications, 'create')
      .mockResolvedValue(row);

    await expect(
      service.create({
        recipientId,
        type: 'match',
        title: 'New match',
        description: 'You matched with a coordinator',
        actionLabel: 'View match',
        href: '/matches',
      }),
    ).resolves.toEqual({
      id: '10',
      recipientId,
      type: 'match',
      title: 'New match',
      description: 'You matched with a coordinator',
      actionLabel: 'View match',
      href: '/matches',
      read: false,
      createdAt: createdAt.toISOString(),
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 1n,
        action_label: 'View match',
      }) as unknown,
    });
  });

  describe('createUnlessRecent', () => {
    const dto = {
      recipientId,
      type: 'match' as const,
      title: 'New interest',
      description: 'Ada Lee is interested in working with you',
      actionLabel: 'View',
      href: '/guest_lecturer/discovery?from=5',
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stores the notice when the person has not had it recently', async () => {
      const create = jest.spyOn(prisma.notifications, 'create');

      await expect(service.createUnlessRecent(dto)).resolves.toBe(true);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 1n,
          title: 'New interest',
          href: '/guest_lecturer/discovery?from=5',
        }) as unknown,
      });
    });

    it('skips the notice when the same one arrived in the last day', async () => {
      jest
        .spyOn(prisma.notifications, 'findFirst')
        .mockResolvedValue({ notification_id: 10n } as never);
      const create = jest.spyOn(prisma.notifications, 'create');

      await expect(service.createUnlessRecent(dto)).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
    });

    it("looks back exactly a day, at this person's notices about this href", async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-10T09:00:00.000Z'));
      const findFirst = jest.spyOn(prisma.notifications, 'findFirst');

      await service.createUnlessRecent(dto);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user_id: 1n,
            type: 'match',
            title: 'New interest',
            href: '/guest_lecturer/discovery?from=5',
            created_at: { gte: new Date('2026-10-09T09:00:00.000Z') },
          },
        }),
      );
    });
  });

  describe('createOrRefreshUnread', () => {
    const dto = {
      recipientId,
      type: 'message' as const,
      title: 'New message',
      description: 'Ada Lee sent you a message',
      actionLabel: 'Reply',
      href: '/guest_lecturer/messages?with=5',
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    function inTransaction(refreshed: number) {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        notifications: {
          updateMany: jest.fn().mockResolvedValue({ count: refreshed }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(((run: (client: typeof tx) => Promise<unknown>) =>
          run(tx)) as never);
      return tx;
    }

    it('moves the unread notice to the top instead of adding another', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-10T09:00:00.000Z'));
      const tx = inTransaction(1);

      await service.createOrRefreshUnread(dto);
      expect(tx.notifications.updateMany).toHaveBeenCalledWith({
        where: {
          user_id: 1n,
          type: 'message',
          href: '/guest_lecturer/messages?with=5',
          read: false,
        },
        data: { created_at: new Date('2026-10-10T09:00:00.000Z') },
      });
      expect(tx.notifications.create).not.toHaveBeenCalled();
    });

    it('adds a notice when none is waiting unread', async () => {
      const tx = inTransaction(0);

      await service.createOrRefreshUnread(dto);
      expect(tx.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 1n,
          type: 'message',
          title: 'New message',
          description: 'Ada Lee sent you a message',
          action_label: 'Reply',
          href: '/guest_lecturer/messages?with=5',
        }) as unknown,
      });
    });

    it('locks on the person and conversation before it looks, for the transaction only', async () => {
      const tx = inTransaction(0);

      await service.createOrRefreshUnread(dto);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [sql, namespace, lockKey] = tx.$executeRaw.mock.calls[0] as [
        string[],
        number,
        string,
      ];
      // The transaction-level form, which the end of the transaction releases.
      expect(sql.join('?')).toContain('pg_advisory_xact_lock(');
      expect(sql.join('?')).toContain('xact');
      // A two-part key: this feature's number, then the person and conversation.
      expect(Number.isInteger(namespace)).toBe(true);
      expect(namespace).toBeLessThanOrEqual(2 ** 31 - 1);
      expect(lockKey).toBe('1:/guest_lecturer/messages?with=5');
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.notifications.updateMany.mock.invocationCallOrder[0],
      );
    });
  });

  it("returns only the recipient's notifications, newest first", async () => {
    const findMany = jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([row] as never);

    await expect(service.findByRecipient(recipientId)).resolves.toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { user_id: 1n },
      orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
      take: 100,
    });
  });

  it('lists at most 100 notifications, the newest of them', async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({
      ...row,
      notification_id: BigInt(500 - index),
    }));
    const findMany = jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue(many);

    const listed = await service.findByRecipient(recipientId);

    expect(listed).toHaveLength(100);
    expect(listed[0].id).toBe('500');
    // The limit is applied by the query, not after fetching everything.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('breaks a tie in time by id, so rows written together come back newest first', async () => {
    const findMany = jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([] as never);

    await service.findByRecipient(recipientId);

    const { orderBy } = findMany.mock.calls[0][0] as {
      orderBy: Record<string, string>[];
    };
    expect(orderBy).toEqual([
      { created_at: 'desc' },
      { notification_id: 'desc' },
    ]);
  });

  it('marks a notification as read when the caller is the recipient', async () => {
    jest.spyOn(prisma.notifications, 'findUnique').mockResolvedValue(row);
    jest
      .spyOn(prisma.notifications, 'update')
      .mockResolvedValue({ ...row, read: true });

    await expect(service.markAsRead('10', recipientId)).resolves.toEqual(
      expect.objectContaining({ read: true }),
    );
  });

  it('throws ForbiddenException when the caller is not the recipient', async () => {
    jest
      .spyOn(prisma.notifications, 'findUnique')
      .mockResolvedValue({ ...row, user_id: 2n });

    await expect(service.markAsRead('10', recipientId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for an unknown id', async () => {
    await expect(service.markAsRead('999', recipientId)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('countUnread', () => {
    it("counts only the caller's own unread notifications", async () => {
      const find = jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 7n } as never);
      const count = jest
        .spyOn(prisma.notifications, 'count')
        .mockResolvedValue(3);

      await expect(service.countUnread(recipientId)).resolves.toBe(3);
      expect(find).toHaveBeenCalledWith({
        where: { auth0Id: recipientId },
        select: { userid: true },
      });
      expect(count).toHaveBeenCalledWith({
        where: { user_id: 7n, read: false },
      });
    });

    it('reports zero when nothing is unread', async () => {
      jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 7n } as never);

      await expect(service.countUnread(recipientId)).resolves.toBe(0);
    });

    it('reports zero without creating a user row for someone who has none', async () => {
      jest.spyOn(prisma.users, 'findUnique').mockResolvedValue(null);
      const upsert = jest.spyOn(prisma.users, 'upsert');
      const create = jest.spyOn(prisma.users, 'create');
      const count = jest.spyOn(prisma.notifications, 'count');

      await expect(service.countUnread(recipientId)).resolves.toBe(0);
      expect(count).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });
  });

  it("marks only the caller's unread notifications as read", async () => {
    const updateMany = jest.spyOn(prisma.notifications, 'updateMany');

    await service.markAllAsRead(recipientId);
    expect(updateMany).toHaveBeenCalledWith({
      where: { user_id: 1n, read: false },
      data: { read: true },
    });
  });

  describe('createForAdmins', () => {
    const notice = {
      type: 'event' as const,
      title: 'Guest lecture confirmed',
      description: 'Talk, 2026-10-15 10:00 to 11:00, Dr. Smith with Jane Doe',
      actionLabel: 'View events',
      href: '/dashboard/events',
    };

    it('gives every active administrator the notice in one insert', async () => {
      const findMany = jest
        .spyOn(prisma.users, 'findMany')
        .mockResolvedValue([{ userid: 7n }, { userid: 8n }] as never);
      const createMany = jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 2 });

      await expect(service.createForAdmins(notice)).resolves.toBe(2);

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(createMany).toHaveBeenCalledTimes(1);
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            user_id: 7n,
            type: 'event',
            title: 'Guest lecture confirmed',
            description: notice.description,
            action_label: 'View events',
            href: '/dashboard/events',
          },
          {
            user_id: 8n,
            type: 'event',
            title: 'Guest lecture confirmed',
            description: notice.description,
            action_label: 'View events',
            href: '/dashboard/events',
          },
        ],
      });
    });

    it('asks only for administrators whose account has not been deleted', async () => {
      const findMany = jest
        .spyOn(prisma.users, 'findMany')
        .mockResolvedValue([{ userid: 7n }] as never);
      jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 1 });

      await service.createForAdmins(notice);

      expect(findMany).toHaveBeenCalledWith({
        where: { role: 'ccae_admin', deletedat: null },
        select: { userid: true },
      });
    });

    it('writes for the administrators it is given and nobody else', async () => {
      // The query leaves out a deleted administrator, so only these two arrive.
      jest
        .spyOn(prisma.users, 'findMany')
        .mockResolvedValue([{ userid: 7n }, { userid: 9n }] as never);
      const createMany = jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 2 });

      await service.createForAdmins(notice);

      const { data } = createMany.mock.calls[0][0] as {
        data: { user_id: bigint }[];
      };
      expect(data.map((row) => row.user_id)).toEqual([7n, 9n]);
    });

    it('writes every notice for every administrator after looking them up once', async () => {
      const findMany = jest
        .spyOn(prisma.users, 'findMany')
        .mockResolvedValue([{ userid: 7n }, { userid: 8n }] as never);
      const createMany = jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 4 });

      await expect(
        service.createForAdmins([
          notice,
          { ...notice, title: 'Guest lecture cancelled' },
        ]),
      ).resolves.toBe(4);

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(createMany).toHaveBeenCalledTimes(1);
      const { data } = createMany.mock.calls[0][0] as {
        data: { user_id: bigint; title: string }[];
      };
      expect(data.map((row) => [row.user_id, row.title])).toEqual([
        [7n, 'Guest lecture confirmed'],
        [7n, 'Guest lecture cancelled'],
        [8n, 'Guest lecture confirmed'],
        [8n, 'Guest lecture cancelled'],
      ]);
    });

    it('does not even look for administrators when it has no notices', async () => {
      const findMany = jest.spyOn(prisma.users, 'findMany');
      const createMany = jest.spyOn(prisma.notifications, 'createMany');

      await expect(service.createForAdmins([])).resolves.toBe(0);
      expect(findMany).not.toHaveBeenCalled();
      expect(createMany).not.toHaveBeenCalled();
    });

    it('writes nothing when there is no administrator to tell', async () => {
      jest.spyOn(prisma.users, 'findMany').mockResolvedValue([]);
      const createMany = jest.spyOn(prisma.notifications, 'createMany');

      await expect(service.createForAdmins(notice)).resolves.toBe(0);
      expect(createMany).not.toHaveBeenCalled();
    });
  });
});
