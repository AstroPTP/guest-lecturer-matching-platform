import { prisma } from '../prisma';
import {
  useLockingNoticeTable,
  useNoticeTransaction,
} from '../testing/notice-transaction';
import { restoreRealTimers } from '../testing/timers';
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

  it('writes one row for each person in a single insert, inside the transaction', async () => {
    const { earlier, insert, transaction } = useNoticeTransaction();
    const outside = jest.spyOn(prisma.notifications, 'createMany');

    await expect(
      service.createUnlessRecentForUsers([4n, 5n, 6n], notice),
    ).resolves.toBe(3);

    expect(transaction).toHaveBeenCalledTimes(1);
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
    // Nothing was written outside the transaction, where the lock does not reach.
    expect(outside).not.toHaveBeenCalled();
  });

  it('takes a lock on the notice before it reads, so the read and the write are one step', async () => {
    const order: string[] = [];
    const { earlier, insert, lock } = useNoticeTransaction();
    lock.mockImplementation(() => {
      order.push('lock');
      return Promise.resolve(0);
    });
    earlier.mockImplementation(() => {
      order.push('read');
      return Promise.resolve([]);
    });
    insert.mockImplementation((args) => {
      order.push('write');
      return Promise.resolve({ count: args.data.length });
    });

    await service.createUnlessRecentForUsers([4n], notice);

    expect(order).toEqual(['lock', 'read', 'write']);
    const [strings, namespace, key] = lock.mock.calls[0] as unknown as [
      string[],
      number,
      string,
    ];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(typeof namespace).toBe('number');
    expect(key).toBe(
      'match|New suggested speakers match your topics|/unit_coordinator/suggestions',
    );
  });

  it('uses the same number of queries for three people as for three hundred', async () => {
    const many = Array.from({ length: 300 }, (_, i) => BigInt(i + 1));
    const { earlier, insert, transaction } = useNoticeTransaction();
    const single = jest.spyOn(prisma.notifications, 'create');
    const lookup = jest.spyOn(prisma.notifications, 'findFirst');

    await service.createUnlessRecentForUsers(many, notice);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(earlier).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('asks about the same type, title and link, within the last day, for these people only', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T10:00:00Z'));
    try {
      const { earlier } = useNoticeTransaction();

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
      restoreRealTimers();
    }
  });

  it('skips people who were sent the same notice in the last day and writes for the rest', async () => {
    const { insert } = useNoticeTransaction({ alreadyTold: [5n] });

    await expect(
      service.createUnlessRecentForUsers([4n, 5n, 6n], notice),
    ).resolves.toBe(2);

    expect(insert.mock.calls[0][0].data.map((row) => row.user_id)).toEqual([
      4n,
      6n,
    ]);
  });

  it('writes nothing, and sends no push, when everyone has already been told', async () => {
    const { insert } = useNoticeTransaction({ alreadyTold: [4n, 5n] });

    await expect(
      service.createUnlessRecentForUsers([4n, 5n], notice),
    ).resolves.toBe(0);

    expect(insert).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing at all for an empty list', async () => {
    const { transaction } = useNoticeTransaction();

    await expect(service.createUnlessRecentForUsers([], notice)).resolves.toBe(
      0,
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it('gives a person named twice one notice', async () => {
    const { insert } = useNoticeTransaction();

    await service.createUnlessRecentForUsers([4n, 4n, 5n], notice);

    expect(insert.mock.calls[0][0].data.map((row) => row.user_id)).toEqual([
      4n,
      5n,
    ]);
  });

  it('sends the push to the people it wrote for, and only them, once the transaction has committed', async () => {
    const { insert } = useNoticeTransaction({ alreadyTold: [5n] });
    let pushedBeforeCommit = true;
    insert.mockImplementation((args) => {
      pushedBeforeCommit = push.mock.calls.length > 0;
      return Promise.resolve({ count: args.data.length });
    });

    await service.createUnlessRecentForUsers([4n, 5n, 6n], notice);

    expect(pushedBeforeCommit).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith([4n, 6n], notice);
  });

  it('sends no push, and lets the error out, when the insert fails', async () => {
    const { insert } = useNoticeTransaction();
    insert.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.createUnlessRecentForUsers([4n, 5n], notice),
    ).rejects.toThrow('connection lost');

    expect(push).not.toHaveBeenCalled();
  });

  it('writes once when the same notice is raised twice at the same moment', async () => {
    const { rows } = useLockingNoticeTable();

    const [first, second] = await Promise.all([
      service.createUnlessRecentForUsers([4n, 5n], notice),
      service.createUnlessRecentForUsers([4n, 5n], notice),
    ]);

    expect([first, second].sort()).toEqual([0, 2]);
    expect(rows.map((row) => row.user_id).sort()).toEqual([4n, 5n]);
    // The second one was pushed nothing, because it wrote nothing.
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('lets two different notices run at once without waiting on each other’s rows', async () => {
    const { rows } = useLockingNoticeTable();

    await Promise.all([
      service.createUnlessRecentForUsers([4n], notice),
      service.createUnlessRecentForUsers([4n], {
        ...notice,
        title: 'New units match your expertise',
        href: '/guest_lecturer/discovery',
      }),
    ]);

    // Different titles are different notices: each person may have one of each.
    expect(rows).toHaveLength(2);
  });
});
