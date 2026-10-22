import { prisma } from '../prisma';
import { NotificationsService } from './notifications.service';
import { pushToUsers } from './push';

jest.mock('./push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

const push = pushToUsers as jest.Mock;

const notice = {
  type: 'match' as const,
  title: 'New suggested speakers match your topics',
  description: 'Guest lecturers who share your topics have joined.',
  actionLabel: 'View suggestions',
  href: '/unit_coordinator/suggestions',
};

describe('NotificationsService.createUnlessRecentForUsers', () => {
  const service = new NotificationsService();

  afterEach(() => {
    jest.restoreAllMocks();
    push.mockClear();
  });

  it('writes one row for each person in a single insert', async () => {
    const earlier = jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([] as never);
    const insert = jest
      .spyOn(prisma.notifications, 'createMany')
      .mockResolvedValue({ count: 3 });

    await expect(
      service.createUnlessRecentForUsers([4n, 5n, 6n], notice),
    ).resolves.toBe(3);

    expect(earlier).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      data: [4n, 5n, 6n].map((user_id) => ({
        user_id,
        type: 'match',
        title: notice.title,
        description: notice.description,
        action_label: 'View suggestions',
        href: '/unit_coordinator/suggestions',
      })),
    });
  });

  it('uses the same number of queries for three people as for three hundred', async () => {
    const many = Array.from({ length: 300 }, (_, i) => BigInt(i + 1));
    const earlier = jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([] as never);
    const insert = jest
      .spyOn(prisma.notifications, 'createMany')
      .mockResolvedValue({ count: 300 });
    const single = jest.spyOn(prisma.notifications, 'create');
    const lookup = jest.spyOn(prisma.notifications, 'findFirst');

    await service.createUnlessRecentForUsers(many, notice);

    expect(earlier).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('asks about the same type, title and link, within the last day, for these people only', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T10:00:00Z'));
    try {
      const earlier = jest
        .spyOn(prisma.notifications, 'findMany')
        .mockResolvedValue([] as never);
      jest
        .spyOn(prisma.notifications, 'createMany')
        .mockResolvedValue({ count: 1 });

      await service.createUnlessRecentForUsers([4n], notice);

      expect(earlier).toHaveBeenCalledWith({
        where: {
          user_id: { in: [4n] },
          type: 'match',
          title: notice.title,
          href: '/unit_coordinator/suggestions',
          created_at: { gte: new Date('2026-10-21T10:00:00Z') },
        },
        select: { user_id: true },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips people who were sent the same notice in the last day and writes for the rest', async () => {
    jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([{ user_id: 5n }] as never);
    const insert = jest
      .spyOn(prisma.notifications, 'createMany')
      .mockResolvedValue({ count: 2 });

    await expect(
      service.createUnlessRecentForUsers([4n, 5n, 6n], notice),
    ).resolves.toBe(2);

    const { data } = insert.mock.calls[0][0] as { data: { user_id: bigint }[] };
    expect(data.map((row) => row.user_id)).toEqual([4n, 6n]);
  });

  it('writes nothing, and sends no push, when everyone has already been told', async () => {
    jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([{ user_id: 4n }, { user_id: 5n }] as never);
    const insert = jest.spyOn(prisma.notifications, 'createMany');

    await expect(
      service.createUnlessRecentForUsers([4n, 5n], notice),
    ).resolves.toBe(0);

    expect(insert).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing at all for an empty list', async () => {
    const earlier = jest.spyOn(prisma.notifications, 'findMany');
    const insert = jest.spyOn(prisma.notifications, 'createMany');

    await expect(service.createUnlessRecentForUsers([], notice)).resolves.toBe(
      0,
    );

    expect(earlier).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('gives a person named twice one notice', async () => {
    jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([] as never);
    const insert = jest
      .spyOn(prisma.notifications, 'createMany')
      .mockResolvedValue({ count: 2 });

    await service.createUnlessRecentForUsers([4n, 4n, 5n], notice);

    const { data } = insert.mock.calls[0][0] as { data: { user_id: bigint }[] };
    expect(data.map((row) => row.user_id)).toEqual([4n, 5n]);
  });

  it('sends the push to the people it wrote for, and only them', async () => {
    jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([{ user_id: 5n }] as never);
    jest
      .spyOn(prisma.notifications, 'createMany')
      .mockResolvedValue({ count: 2 });

    await service.createUnlessRecentForUsers([4n, 5n, 6n], notice);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith([4n, 6n], notice);
  });
});
