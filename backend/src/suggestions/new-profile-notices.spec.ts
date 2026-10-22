import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { type ReportFixture } from '../testing/open-reports';
import {
  answerTopicQuery,
  topicQueries,
  useNoticeTransaction,
} from '../testing/notice-transaction';
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

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MATCHING_SUGGESTIONS_ENABLED;
});

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

/** The notice table and its transaction, empty: nobody has been told yet. */
function notices(options: { alreadyTold?: bigint[] } = {}) {
  const { earlier, insert } = useNoticeTransaction(options);
  const single = jest.spyOn(prisma.notifications, 'create');
  return { earlier, insert, single };
}

const topicRows = (...topics: string[]) =>
  topics.map((expertise) => ({ expertise }));

const written = (insert: jest.Mock) =>
  (insert.mock.calls as [{ data: { user_id: bigint }[] }][]).flatMap(([args]) =>
    args.data.map((row) => row.user_id),
  );

describe('noticeCoordinatorsOfNewGuest', () => {
  function guestAppears(options: {
    topics?: string[];
    coordinators?: bigint[];
    visible?: boolean;
    alreadyTold?: bigint[];
    reports?: ReportFixture[];
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
    const coordinators = options.coordinators ?? [11n, 12n];
    const shared = answerTopicQuery(coordinators, options.reports);
    const recipients = jest
      .spyOn(prisma.coordinators, 'findMany')
      .mockResolvedValue(
        coordinators.map((user_id) => ({
          user_id,
        })) as never,
      );
    return { subject, topics, shared, recipients, ...notices(options) };
  }

  it('tells every coordinator who shares a topic, with the notice and link the coordinator needs', async () => {
    const { insert } = guestAppears({ coordinators: [11n, 12n, 13n] });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(3);

    expect(written(insert)).toEqual([11n, 12n, 13n]);
    const { data } = insert.mock.calls[0][0] as unknown as {
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
  });

  it('finds recipients with a fixed number of reads, however many there are, and writes them in one insert', async () => {
    const many = Array.from({ length: 250 }, (_, i) => BigInt(i + 100));
    const { shared, recipients, earlier, insert, single } = guestAppears({
      coordinators: many,
    });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    expect(topicQueries(shared)).toHaveLength(1);
    expect(recipients).toHaveBeenCalledTimes(1);
    expect(earlier).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    expect(written(insert)).toHaveLength(250);
  });

  it('bounds the number of people one new profile can notify', async () => {
    const { shared, recipients } = guestAppears({});

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    expect(recipients.mock.calls[0][0]).toMatchObject({
      take: MAX_NOTICE_RECIPIENTS,
      orderBy: { user_id: 'asc' },
      select: { user_id: true },
    });
    expect(MAX_NOTICE_RECIPIENTS).toBeLessThanOrEqual(1000);
    // The topic query is bounded too, and the bound is a parameter.
    const [{ sql, values }] = topicQueries(shared);
    expect(sql).toContain('LIMIT');
    expect(values).toContain(5 * MAX_NOTICE_RECIPIENTS);
  });

  it('compares topics the way Suggested speakers does: trimmed, spaces collapsed, case ignored', async () => {
    const { shared } = guestAppears({
      topics: ['  ECONOMICS ', 'Taxation \t  Law', 'economics'],
    });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const [{ sql, values }] = topicQueries(shared);
    // The guest's topics are normalised once, with no repeat.
    expect(values[0]).toEqual(['economics', 'taxation law']);
    // The stored topics are normalised the same way inside the query.
    expect(sql).toContain(
      "lower(btrim(regexp_replace(e.expertise, '\\s+', ' ', 'g'))) = ANY(?::text[])",
    );
    expect(sql).toContain('JOIN coordinators');
  });

  it('sends topics as a parameter, never inside the statement, whatever characters they hold', async () => {
    const hostile = "x'; DROP TABLE users; --";
    const { shared } = guestAppears({
      topics: ['100%', 'a_b', 'c\\d', hostile],
    });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const [{ sql, values }] = topicQueries(shared);
    expect(values[0]).toEqual(['100%', 'a_b', 'c\\d', hostile.toLowerCase()]);
    for (const text of ['100%', 'a_b', 'DROP', 'drop']) {
      expect(sql).not.toContain(text);
    }
  });

  it('asks the database only about people who share a topic, and shows the guest only those Discovery would', async () => {
    const { recipients } = guestAppears({ coordinators: [11n, 12n] });

    await noticeCoordinatorsOfNewGuest('auth0|guest', 'completed');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    expect(where.AND).toContainEqual({ user_id: { in: [11n, 12n] } });
  });

  it('leaves out deactivated coordinators, coordinators on hold, and anyone with an open report with the guest', async () => {
    // Two people reported coordinator 41, so they are held. The guest and
    // coordinator 42 have a report open between them.
    const reports = [
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
    ];
    const { recipients } = guestAppears({ reports });

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
    // Held (41), and the one with a report open against the guest (42).
    const hidden = (visibility.AND[0].OR[1] as { user_id: { notIn: bigint[] } })
      .user_id.notIn;
    expect(hidden).toEqual(expect.arrayContaining([41n, 42n]));
  });

  it('tells no one when the guest’s profile is not one Discovery lists and Suggested speakers could suggest', async () => {
    const { subject, shared, recipients, insert } = guestAppears({
      visible: false,
    });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(topicQueries(shared)).toHaveLength(0);
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

  it('sends nothing when the administrator has Suggested speakers off, and reads nothing else', async () => {
    const { subject, shared, recipients, earlier, insert } = guestAppears({
      settings: { suggestions_enabled: false },
    });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(subject).not.toHaveBeenCalled();
    expect(topicQueries(shared)).toHaveLength(0);
    expect(recipients).not.toHaveBeenCalled();
    expect(earlier).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(['false', 'FALSE', ' false '])(
    'sends nothing when the server has MATCHING_SUGGESTIONS_ENABLED=%j, even with the setting on',
    async (value) => {
      process.env.MATCHING_SUGGESTIONS_ENABLED = value;
      const { subject, recipients, insert } = guestAppears({});
      const settingsRead = jest.spyOn(prisma.admin_settings, 'upsert');

      await expect(
        noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
      ).resolves.toBe(0);

      expect(subject).not.toHaveBeenCalled();
      expect(recipients).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      // The hard switch is answered without reading the database.
      expect(settingsRead).not.toHaveBeenCalled();
    },
  );

  it('treats a misspelled server switch as on', async () => {
    process.env.MATCHING_SUGGESTIONS_ENABLED = 'flase';
    const { insert } = guestAppears({});

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(2);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a guest who names no topic', async () => {
    const { shared, recipients, insert } = guestAppears({ topics: [] });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(topicQueries(shared)).toHaveLength(0);
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends nothing when no coordinator shares a topic', async () => {
    const { recipients, insert, earlier } = guestAppears({ coordinators: [] });

    await expect(
      noticeCoordinatorsOfNewGuest('auth0|guest', 'completed'),
    ).resolves.toBe(0);

    expect(recipients).not.toHaveBeenCalled();
    expect(earlier).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends nothing when Discovery would show the guest none of those coordinators', async () => {
    const { recipients, earlier, insert } = guestAppears({
      coordinators: [11n],
    });
    recipients.mockResolvedValue([] as never);

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
    reports?: ReportFixture[];
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
    const guests = options.guests ?? [71n, 72n];
    const shared = answerTopicQuery(guests, options.reports);
    const recipients = jest
      .spyOn(prisma.guests, 'findMany')
      .mockResolvedValue(guests.map((user_id) => ({ user_id })) as never);
    return { subject, shared, recipients, ...notices(options) };
  }

  it('tells every guest lecturer who shares a topic, with a link to Discovery', async () => {
    const { insert } = coordinatorAppears({ guests: [71n, 72n, 73n] });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(3);

    expect(written(insert)).toEqual([71n, 72n, 73n]);
    const { data } = insert.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>[];
    };
    expect(data[0]).toMatchObject({
      type: 'match',
      title: 'New units match your expertise',
      href: '/guest_lecturer/discovery',
    });
    expect(NEW_COORDINATOR_NOTICE.title).toBe('New units match your expertise');
  });

  it('finds recipients with a fixed number of reads and writes them in one insert', async () => {
    const many = Array.from({ length: 250 }, (_, i) => BigInt(i + 100));
    const { shared, recipients, earlier, insert, single } = coordinatorAppears({
      guests: many,
    });

    await noticeGuestsOfNewCoordinator('auth0|coord');

    expect(topicQueries(shared)).toHaveLength(1);
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
    const { recipients } = coordinatorAppears({
      reports: twoReportersAboutGuest81,
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
    expect(where.AND).toContainEqual({ user_id: { in: [71n, 72n] } });
  });

  it('does not ask for approval while approval is off', async () => {
    const { recipients } = coordinatorAppears({});

    await noticeGuestsOfNewCoordinator('auth0|coord');

    const where = (recipients.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    expect(where.AND[0]).not.toHaveProperty('approved_at');
  });

  it('compares topics the way Suggested speakers does, as a parameter', async () => {
    const { shared } = coordinatorAppears({
      topics: ['  ACCOUNTING', 'accounting '],
    });

    await noticeGuestsOfNewCoordinator('auth0|coord');

    const [{ sql, values }] = topicQueries(shared);
    expect(values[0]).toEqual(['accounting']);
    expect(sql).toContain(
      "lower(btrim(regexp_replace(e.expertise, '\\s+', ' ', 'g'))) = ANY(?::text[])",
    );
    expect(sql).toContain('JOIN guests');
    expect(sql).not.toContain('accounting');
  });

  it('tells no one when the coordinator’s profile is not finished, is deactivated, or is on hold', async () => {
    const { subject, shared, recipients, insert } = coordinatorAppears({
      visible: false,
    });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(topicQueries(shared)).toHaveLength(0);
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

  it('sends nothing when the administrator has Suggested speakers off', async () => {
    const { subject, recipients, insert } = coordinatorAppears({
      settings: { suggestions_enabled: false },
    });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(['false', 'FALSE', ' false '])(
    'sends nothing when the server has MATCHING_SUGGESTIONS_ENABLED=%j, even with the setting on',
    async (value) => {
      process.env.MATCHING_SUGGESTIONS_ENABLED = value;
      const { subject, recipients, insert } = coordinatorAppears({});
      const settingsRead = jest.spyOn(prisma.admin_settings, 'upsert');

      await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(
        0,
      );

      expect(subject).not.toHaveBeenCalled();
      expect(recipients).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(settingsRead).not.toHaveBeenCalled();
    },
  );

  it('sends a guest at most one in 24 hours', async () => {
    const { insert } = coordinatorAppears({
      guests: [71n, 72n],
      alreadyTold: [71n],
    });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(1);

    expect(written(insert)).toEqual([72n]);
  });

  it('sends nothing for a coordinator who names no topic', async () => {
    const { shared, recipients } = coordinatorAppears({ topics: [] });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(topicQueries(shared)).toHaveLength(0);
    expect(recipients).not.toHaveBeenCalled();
  });

  it('sends nothing when no guest lecturer shares a topic', async () => {
    const { recipients, insert } = coordinatorAppears({ guests: [] });

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    silenceLog();
    const { recipients } = coordinatorAppears({});
    recipients.mockRejectedValue(new Error('connection lost'));

    await expect(noticeGuestsOfNewCoordinator('auth0|coord')).resolves.toBe(0);
  });
});
