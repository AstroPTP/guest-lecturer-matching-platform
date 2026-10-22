import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
import {
  MAX_NOTICE_RECIPIENTS,
  NEW_COORDINATOR_NOTICE,
  NEW_GUEST_NOTICE,
  noticeCoordinatorsOfNewGuest,
  noticeGuestsOfNewCoordinator,
} from './new-profile-notices';

jest.mock('../notifications/push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

afterEach(() => jest.restoreAllMocks());

/** The warning a failed notice leaves, without printing it into the test output. */
function silenceLog() {
  return jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
}

const settings = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    require_admin_approval: false,
    suggestions_enabled: true,
    ...overrides,
  }) as never;

/** The notice and push tables, empty: nobody has been told yet. */
function notices(options: { alreadyTold?: bigint[] } = {}) {
  const earlier = jest
    .spyOn(prisma.notifications, 'findMany')
    .mockResolvedValue(
      (options.alreadyTold ?? []).map((user_id) => ({ user_id })) as never,
    );
  const insert = jest
    .spyOn(prisma.notifications, 'createMany')
    .mockImplementation(
      (args: unknown) =>
        Promise.resolve({
          count: (args as { data: unknown[] }).data.length,
        }) as never,
    );
  const single = jest.spyOn(prisma.notifications, 'create');
  return { earlier, insert, single };
}

const topicRows = (...topics: string[]) =>
  topics.map((expertise) => ({ expertise }));

const written = (insert: jest.SpyInstance) =>
  (insert.mock.calls as [{ data: { user_id: bigint }[] }][]).flatMap(([args]) =>
    args.data.map((row) => row.user_id),
  );

describe('noticeCoordinatorsOfNewGuest', () => {
  function guestAppears(options: {
    topics?: string[];
    coordinators?: bigint[];
    visible?: boolean;
    alreadyTold?: bigint[];
    settings?: Record<string, unknown>;
  }) {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settings(options.settings));
    const subject = jest
      .spyOn(prisma.guests, 'findFirst')
      .mockResolvedValue(
        options.visible === false ? null : ({ user_id: 31n } as never),
      );
    const topics = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue(
        topicRows(
          ...(options.topics ?? ['Economics', 'Taxation Law']),
        ) as never,
      );
    const recipients = jest
      .spyOn(prisma.coordinators, 'findMany')
      .mockResolvedValue(
        (options.coordinators ?? [11n, 12n]).map((user_id) => ({
          user_id,
        })) as never,
      );
    return { subject, topics, recipients, ...notices(options) };
  }

  it('tells every coordinator who shares a topic, with the notice and link the coordinator needs', async () => {
    const { insert, recipients } = guestAppears({
      coordinators: [11n, 12n, 13n],
    });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(3);

    expect(written(insert)).toEqual([11n, 12n, 13n]);
    const { data } = insert.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(data[0]).toMatchObject({
      type: 'match',
      title: 'New suggested speakers match your topics',
      href: '/unit_coordinator/suggestions',
    });
    expect(NEW_GUEST_NOTICE.title).toBe(
      'New suggested speakers match your topics',
    );
    expect(recipients).toHaveBeenCalledTimes(1);
  });

  it('finds recipients with one read, however many there are, and writes them in one insert', async () => {
    const many = Array.from({ length: 250 }, (_, i) => BigInt(i + 100));
    const { recipients, earlier, insert, single } = guestAppears({
      coordinators: many,
    });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    expect(recipients).toHaveBeenCalledTimes(1);
    expect(earlier).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    expect(written(insert)).toHaveLength(250);
  });

  it('bounds the number of people one new profile can notify', async () => {
    const { recipients } = guestAppears({});

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    expect(recipients.mock.calls[0][0]).toMatchObject({
      take: MAX_NOTICE_RECIPIENTS,
      orderBy: { user_id: 'asc' },
      select: { user_id: true },
    });
    expect(MAX_NOTICE_RECIPIENTS).toBeLessThanOrEqual(1000);
  });

  it('asks only for coordinators who name one of the guest’s topics, whatever the case', async () => {
    const { recipients } = guestAppears({
      topics: ['Economics', 'Taxation Law'],
    });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    expect(where.AND).toContainEqual({
      users: {
        is: {
          user_expertise: {
            some: {
              OR: [
                { expertise: { equals: 'Economics', mode: 'insensitive' } },
                { expertise: { equals: 'Taxation Law', mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    });
    // A coordinator with no account row cannot be told.
    expect(where.AND).toContainEqual({ user_id: { not: null } });
  });

  it('treats % and _ in a topic as ordinary characters, so a topic cannot match everyone', async () => {
    const { recipients } = guestAppears({ topics: ['100%', 'a_b', 'c\\d'] });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const where = JSON.stringify(
      (recipients.mock.calls[0][0] as { where: unknown }).where,
    );
    expect(where).toContain('"equals":"100\\\\%"');
    expect(where).toContain('"equals":"a\\\\_b"');
    expect(where).toContain('"equals":"c\\\\\\\\d"');
  });

  it('leaves out deactivated coordinators, coordinators on hold, and anyone with an open report with the guest', async () => {
    // Two people reported coordinator 41, so they are held. The guest and
    // coordinator 42 have a report open between them.
    stubOpenReports(
      [
        {
          entry_id: 51n,
          actor_user_id: 8n,
          target_id: '41',
          detail: { reason: 'rude', matchId: '1' },
        },
        {
          entry_id: 52n,
          actor_user_id: 9n,
          target_id: '41',
          detail: { reason: 'rude', matchId: '2' },
        },
        {
          entry_id: 53n,
          actor_user_id: 42n,
          target_id: '1',
          detail: { reason: 'rude' },
        },
      ],
      [
        {
          entry_id: 51n,
          actor_user_id: 8n,
          target_id: '41',
          detail: { reason: 'rude', matchId: '1' },
        },
        {
          entry_id: 52n,
          actor_user_id: 9n,
          target_id: '41',
          detail: { reason: 'rude', matchId: '2' },
        },
        {
          entry_id: 53n,
          actor_user_id: 42n,
          target_id: '1',
          detail: { reason: 'rude' },
        },
      ],
    );
    const { recipients } = guestAppears({});

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    const visibility = where.AND[0] as {
      OR: unknown[];
      AND: { OR: unknown[] }[];
    };
    // Deactivated accounts.
    expect(visibility.OR).toEqual([
      { user_id: null },
      { users: { is: { deletedat: null } } },
    ]);
    // Held (41), and the one reported by the guest's own pair (42).
    const hidden = (visibility.AND[0].OR[1] as { user_id: { notIn: bigint[] } })
      .user_id.notIn;
    expect(hidden).toEqual(expect.arrayContaining([41n, 42n]));
  });

  it('tells no one when the guest’s profile is not one Discovery lists and Suggested speakers could suggest', async () => {
    const { subject, recipients, insert } = guestAppears({ visible: false });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    // The profile must be finished, active and named; approval and holds come from the shared rule.
    expect(subject.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [
          {},
          {
            first_name: { not: null },
            NOT: { first_name: '' },
            users: {
              is: {
                auth0Id: 'auth0|guest',
                deletedat: null,
                consentstate: true,
              },
            },
          },
        ],
      },
    });
  });

  it('applies the approval rule to the guest while approval is required', async () => {
    const { subject } = guestAppears({
      settings: { require_admin_approval: true },
    });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const where = subject.mock.calls[0][0] as { where: { AND: unknown[] } };
    expect(where.where.AND[0]).toMatchObject({ approved_at: { not: null } });
  });

  it('does not apply the approval rule while approval is off', async () => {
    const { subject } = guestAppears({});

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const where = subject.mock.calls[0][0] as { where: { AND: unknown[] } };
    expect(where.where.AND[0]).not.toHaveProperty('approved_at');
  });

  it('sends nothing when Suggested speakers is off, and reads nothing else', async () => {
    const { subject, recipients, earlier, insert } = guestAppears({
      settings: { suggestions_enabled: false },
    });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(earlier).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends nothing for a guest who names no topic', async () => {
    const { recipients, insert } = guestAppears({ topics: [] });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends nothing when no coordinator shares a topic', async () => {
    const { insert, earlier } = guestAppears({ coordinators: [] });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(earlier).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends a coordinator at most one in 24 hours', async () => {
    const { insert } = guestAppears({
      coordinators: [11n, 12n, 13n],
      alreadyTold: [12n],
    });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(2);

    expect(written(insert)).toEqual([11n, 13n]);
  });

  it('announces an approval only while approval is required', async () => {
    const off = guestAppears({});
    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'approved'),
    ).resolves.toBe(0);
    expect(off.subject).not.toHaveBeenCalled();
    expect(off.insert).not.toHaveBeenCalled();

    jest.restoreAllMocks();
    const on = guestAppears({ settings: { require_admin_approval: true } });
    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'approved'),
    ).resolves.toBe(2);
    expect(on.insert).toHaveBeenCalledTimes(1);
  });

  it('never throws: a failure while looking for recipients is swallowed, and only its name is logged', async () => {
    const warn = silenceLog();
    const { insert, recipients } = guestAppears({});
    recipients.mockRejectedValue(
      new Error('connection lost for ada@example.com'),
    );

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain('ada@example.com');
  });

  it('never throws: a failure while writing is swallowed', async () => {
    silenceLog();
    const { insert } = guestAppears({});
    insert.mockRejectedValue(new Error('connection lost'));

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);
  });
});

describe('noticeGuestsOfNewCoordinator', () => {
  function coordinatorAppears(options: {
    topics?: string[];
    guests?: bigint[];
    visible?: boolean;
    alreadyTold?: bigint[];
    settings?: Record<string, unknown>;
  }) {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settings(options.settings));
    const subject = jest
      .spyOn(prisma.coordinators, 'findFirst')
      .mockResolvedValue(
        options.visible === false ? null : ({ user_id: 21n } as never),
      );
    jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue(
        topicRows(...(options.topics ?? ['Accounting'])) as never,
      );
    const recipients = jest.spyOn(prisma.guests, 'findMany').mockResolvedValue(
      (options.guests ?? [71n, 72n]).map((user_id) => ({
        user_id,
      })) as never,
    );
    return { subject, recipients, ...notices(options) };
  }

  it('tells every guest lecturer who shares a topic, with a link to Discovery', async () => {
    const { insert } = coordinatorAppears({ guests: [71n, 72n, 73n] });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(3);

    expect(written(insert)).toEqual([71n, 72n, 73n]);
    const { data } = insert.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(data[0]).toMatchObject({
      type: 'match',
      title: 'New units match your expertise',
      href: '/guest_lecturer/discovery',
    });
    expect(NEW_COORDINATOR_NOTICE.title).toBe('New units match your expertise');
  });

  it('finds recipients with one read and writes them in one insert', async () => {
    const many = Array.from({ length: 250 }, (_, i) => BigInt(i + 100));
    const { recipients, earlier, insert, single } = coordinatorAppears({
      guests: many,
    });

    await noticeGuestsOfNewCoordinator('auth0|coord');

    expect(recipients).toHaveBeenCalledTimes(1);
    expect(earlier).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    expect(recipients.mock.calls[0][0]).toMatchObject({
      take: MAX_NOTICE_RECIPIENTS,
    });
  });

  it('leaves out unapproved guests while approval is required, and deactivated guests and guests on hold', async () => {
    const twoReportersAboutGuest81 = [
      {
        entry_id: 51n,
        actor_user_id: 8n,
        target_id: '81',
        detail: { reason: 'rude', matchId: '1' },
      },
      {
        entry_id: 52n,
        actor_user_id: 9n,
        target_id: '81',
        detail: { reason: 'rude', matchId: '2' },
      },
    ];
    // Read once to check the coordinator, once to find the guests.
    stubOpenReports(twoReportersAboutGuest81, twoReportersAboutGuest81);
    const { recipients } = coordinatorAppears({
      settings: { require_admin_approval: true },
    });

    await noticeGuestsOfNewCoordinator('auth0|coord');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    const visibility = where.AND[0] as {
      OR: unknown[];
      AND: { OR: unknown[] }[];
      approved_at: unknown;
    };
    expect(visibility.approved_at).toEqual({ not: null });
    expect(visibility.OR).toEqual([
      { user_id: null },
      { users: { is: { deletedat: null } } },
    ]);
    expect(
      (visibility.AND[0].OR[1] as { user_id: { notIn: bigint[] } }).user_id
        .notIn,
    ).toContain(81n);
    expect(where.AND).toContainEqual({ user_id: { not: null } });
  });

  it('does not ask for approval while approval is off', async () => {
    const { recipients } = coordinatorAppears({});

    await noticeGuestsOfNewCoordinator('auth0|coord');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    expect(where.AND[0]).not.toHaveProperty('approved_at');
  });

  it('asks only for guests who name one of the coordinator’s topics, whatever the case', async () => {
    const { recipients } = coordinatorAppears({ topics: ['Accounting'] });

    await noticeGuestsOfNewCoordinator('auth0|coord');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    expect(where.AND).toContainEqual({
      users: {
        is: {
          user_expertise: {
            some: {
              OR: [
                { expertise: { equals: 'Accounting', mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    });
  });

  it('tells no one when the coordinator’s profile is not finished, is deactivated, or is on hold', async () => {
    const { subject, recipients, insert } = coordinatorAppears({
      visible: false,
    });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(subject.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [
          {
            OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
          },
          {
            users: {
              is: {
                auth0Id: 'auth0|coord',
                deletedat: null,
                consentstate: true,
              },
            },
          },
        ],
      },
    });
  });

  it('sends nothing when Suggested speakers is off', async () => {
    const { subject, recipients, insert } = coordinatorAppears({
      settings: { suggestions_enabled: false },
    });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends a guest at most one in 24 hours', async () => {
    const { insert } = coordinatorAppears({
      guests: [71n, 72n],
      alreadyTold: [71n],
    });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(1);

    expect(written(insert)).toEqual([72n]);
  });

  it('sends nothing for a coordinator who names no topic', async () => {
    const { recipients } = coordinatorAppears({ topics: [] });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(recipients).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    silenceLog();
    const { recipients } = coordinatorAppears({});
    recipients.mockRejectedValue(new Error('connection lost'));

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);
  });
});
