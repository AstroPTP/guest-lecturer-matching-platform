import { prisma } from '../prisma';
import {
  availabilityOverlap,
  orderCoordinatorsForViewer,
  orderGuestsForViewer,
  rankCoordinators,
  rankGuests,
  summariseSessions,
  type RankableCoordinator,
  type RankableGuest,
} from './discovery-ranking';
import {
  DEFAULT_WEIGHTS,
  exposureScore,
  fitScore,
  rankScore,
  recordedAvailability,
  rotationScore,
  type RecordedAvailability,
  type WeeklyAvailability,
} from './scoring';

afterEach(() => jest.restoreAllMocks());

const NOW = new Date('2026-10-22T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const guest = (
  id: number,
  joined: string,
  user: number | null = id + 100,
): RankableGuest => ({
  guest_id: BigInt(id),
  user_id: user === null ? null : BigInt(user),
  created_at: new Date(joined),
});

const coordinator = (
  id: number,
  joined: string,
  user: number | null = id + 200,
): RankableCoordinator => ({
  coordinator_id: BigInt(id),
  user_id: user === null ? null : BigInt(user),
  created_at: new Date(joined),
});

const topicsOf = (entries: [number, string[]][]) =>
  new Map(entries.map(([user, topics]) => [BigInt(user), topics]));

const noHistory = summariseSessions([]);

const ids = (rows: { guest_id: bigint }[]) =>
  rows.map((r) => Number(r.guest_id));
const coordinatorIds = (rows: { coordinator_id: bigint }[]) =>
  rows.map((r) => Number(r.coordinator_id));

const guestContext = (
  overrides: Partial<Parameters<typeof rankGuests>[1]> = {},
) => ({
  viewerTopics: ['Economics', 'Taxation Law'],
  topicsByUser: topicsOf([]),
  history: noHistory,
  weights: DEFAULT_WEIGHTS,
  halfLifeDays: 90,
  now: NOW,
  ...overrides,
});

describe('summariseSessions', () => {
  it('counts accepted matches per guest and keeps the latest date', () => {
    const history = summariseSessions([
      { guest_id: 1n, requested_at: daysAgo(50), updated_at: daysAgo(40) },
      { guest_id: 1n, requested_at: daysAgo(20), updated_at: daysAgo(10) },
      { guest_id: 2n, requested_at: daysAgo(5), updated_at: null },
    ]);
    expect(history.sessions.get(1n)).toBe(2);
    expect(history.lastSessionAt.get(1n)).toEqual(daysAgo(10));
    // updated_at is when the second side agreed; older rows fall back to requested_at.
    expect(history.lastSessionAt.get(2n)).toEqual(daysAgo(5));
    expect(history.sessions.get(3n)).toBeUndefined();
  });

  it('counts a match with no dates at all, without inventing a date', () => {
    const history = summariseSessions([
      { guest_id: 4n, requested_at: null, updated_at: null },
    ]);
    expect(history.sessions.get(4n)).toBe(1);
    expect(history.lastSessionAt.has(4n)).toBe(false);
  });
});

describe('rankGuests', () => {
  it('puts the best topic match first and keeps guests who share no topic', () => {
    const guests = [
      guest(1, '2026-01-01'),
      guest(2, '2026-01-02'),
      guest(3, '2026-01-03'),
    ];
    const ranked = rankGuests(
      guests,
      guestContext({
        topicsByUser: topicsOf([
          [101, ['Marketing Strategy']],
          [102, ['Economics']],
          [103, ['Economics', 'Taxation Law']],
        ]),
      }),
    );
    expect(ids(ranked)).toEqual([3, 2, 1]);
    expect(ranked).toHaveLength(3);
  });

  it('scores a guest exactly as Suggested speakers does', () => {
    // Three guests with different fit, sessions and last sessions. The expected
    // order is worked out here from the shared scoring functions.
    const guests = [
      guest(1, '2026-01-01'),
      guest(2, '2026-01-02'),
      guest(3, '2026-01-03'),
    ];
    const topicsByUser = topicsOf([
      [101, ['Economics']],
      [102, ['Economics', 'Taxation Law']],
      [103, ['Taxation Law']],
    ]);
    const history = summariseSessions([
      { guest_id: 2n, requested_at: daysAgo(3), updated_at: daysAgo(2) },
      { guest_id: 2n, requested_at: daysAgo(9), updated_at: daysAgo(8) },
      { guest_id: 3n, requested_at: daysAgo(300), updated_at: daysAgo(299) },
    ]);
    const expected = guests
      .map((g) => {
        const offered = topicsByUser.get(g.user_id as bigint) ?? [];
        const total = rankScore(
          fitScore(['Economics', 'Taxation Law'], offered),
          rotationScore(history.lastSessionAt.get(g.guest_id) ?? null, NOW, 90),
          exposureScore(history.sessions.get(g.guest_id) ?? 0),
          DEFAULT_WEIGHTS,
        );
        return { id: Number(g.guest_id), total };
      })
      .sort((a, b) => b.total - a.total)
      .map((entry) => entry.id);

    expect(
      ids(rankGuests(guests, guestContext({ topicsByUser, history }))),
    ).toEqual(expected);
  });

  it('ranks a guest with fewer sessions, or a longer wait, above an equal fit', () => {
    const guests = [
      guest(1, '2026-01-01'),
      guest(2, '2026-01-02'),
      guest(3, '2026-01-03'),
    ];
    const same = ['Economics', 'Taxation Law'];
    const history = summariseSessions([
      // Guest 1: five recent sessions. Guest 2: one, long ago. Guest 3: none.
      ...[1, 2, 3, 4, 5].map((n) => ({
        guest_id: 1n,
        requested_at: daysAgo(n),
        updated_at: daysAgo(n),
      })),
      { guest_id: 2n, requested_at: daysAgo(400), updated_at: daysAgo(400) },
    ]);
    const ranked = rankGuests(
      guests,
      guestContext({
        topicsByUser: topicsOf([
          [101, same],
          [102, same],
          [103, same],
        ]),
        history,
      }),
    );
    expect(ids(ranked)).toEqual([3, 2, 1]);
  });

  it('follows the administrator weights and half-life', () => {
    const guests = [guest(1, '2026-01-01'), guest(2, '2026-01-02')];
    // Guest 1 fits perfectly but is busy; guest 2 fits half as well and is new.
    const topicsByUser = topicsOf([
      [101, ['Economics', 'Taxation Law']],
      [102, ['Economics']],
    ]);
    const history = summariseSessions(
      [1, 2, 3, 4, 5, 6].map((n) => ({
        guest_id: 1n,
        requested_at: daysAgo(n),
        updated_at: daysAgo(n),
      })),
    );
    const topicFirst = { fit: 0.9, rotation: 0.05, exposure: 0.05 };
    const shareTheWork = { fit: 0.5, rotation: 0.25, exposure: 0.25 };

    expect(
      ids(
        rankGuests(
          guests,
          guestContext({ topicsByUser, history, weights: topicFirst }),
        ),
      ),
    ).toEqual([1, 2]);
    expect(
      ids(
        rankGuests(
          guests,
          guestContext({ topicsByUser, history, weights: shareTheWork }),
        ),
      ),
    ).toEqual([2, 1]);
  });

  it('follows the half-life: a shorter one lets a long wait outweigh a busy record', () => {
    const guests = [guest(1, '2026-01-01'), guest(2, '2026-01-02')];
    const topicsByUser = topicsOf([
      [101, ['Economics']],
      [102, ['Economics']],
    ]);
    // Guest 1 has had six sessions, the last 60 days ago. Guest 2 has had one, 20 days ago.
    const history = summariseSessions([
      ...[60, 70, 80, 90, 100, 110].map((n) => ({
        guest_id: 1n,
        requested_at: daysAgo(n),
        updated_at: daysAgo(n),
      })),
      { guest_id: 2n, requested_at: daysAgo(20), updated_at: daysAgo(20) },
    ]);
    const weights = { fit: 0, rotation: 0.5, exposure: 0.5 };
    const rank = (halfLifeDays: number) =>
      ids(
        rankGuests(
          guests,
          guestContext({ topicsByUser, history, weights, halfLifeDays }),
        ),
      );

    expect(rank(90)).toEqual([2, 1]);
    expect(rank(30)).toEqual([1, 2]);
  });

  it('breaks a tie by the date guests joined, then by id', () => {
    // Identical on every term. 5 joined first although it has the higher id.
    const guests = [
      guest(4, '2026-05-01'),
      guest(5, '2026-04-01'),
      guest(6, '2026-04-01'),
      guest(2, '2026-06-01'),
    ];
    const same = ['Economics'];
    const ranked = rankGuests(
      guests,
      guestContext({
        topicsByUser: topicsOf([
          [104, same],
          [105, same],
          [106, same],
          [102, same],
        ]),
      }),
    );
    expect(ids(ranked)).toEqual([5, 6, 4, 2]);
  });

  it('treats scores that differ only by floating point noise as a tie', () => {
    // Both fit the viewer's three topics equally well, 1 / sqrt(3) and
    // 3 / sqrt(27), but the two sums differ in the last bit. Guest 2 joined
    // first, so it must come first.
    const guests = [guest(1, '2026-03-01'), guest(2, '2026-01-01')];
    expect(1 / Math.sqrt(3)).not.toBe(3 / Math.sqrt(27));
    const ranked = rankGuests(
      guests,
      guestContext({
        viewerTopics: ['t1', 't2', 't3'],
        topicsByUser: topicsOf([
          [101, ['t1']],
          [102, ['t1', 't2', 't3', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6']],
        ]),
        weights: { fit: 1, rotation: 0, exposure: 0 },
      }),
    );
    expect(ids(ranked)).toEqual([2, 1]);
  });

  it('orders by rotation and exposure alone when the viewer names no topics', () => {
    const guests = [guest(1, '2026-01-01'), guest(2, '2026-01-02')];
    const history = summariseSessions([
      { guest_id: 1n, requested_at: daysAgo(2), updated_at: daysAgo(2) },
    ]);
    const ranked = rankGuests(
      guests,
      guestContext({
        viewerTopics: [],
        topicsByUser: topicsOf([
          [101, ['Economics']],
          [102, ['Economics']],
        ]),
        history,
      }),
    );
    expect(ids(ranked)).toEqual([2, 1]);
  });

  it('places a guest with no account by their profile alone, and keeps them', () => {
    const guests = [guest(1, '2026-01-01', null), guest(2, '2026-01-02')];
    const ranked = rankGuests(
      guests,
      guestContext({ topicsByUser: topicsOf([[102, ['Economics']]]) }),
    );
    expect(ids(ranked)).toEqual([2, 1]);
  });

  it('returns a new array and leaves the input as it was', () => {
    const guests = [guest(1, '2026-01-01'), guest(2, '2026-01-02')];
    const before = [...guests];
    const ranked = rankGuests(
      guests,
      guestContext({ topicsByUser: topicsOf([[102, ['Economics']]]) }),
    );
    expect(guests).toEqual(before);
    expect(ranked).not.toBe(guests);
  });

  it('adds no field to the rows it returns', () => {
    const guests = [guest(1, '2026-01-01'), guest(2, '2026-01-02')];
    const ranked = rankGuests(guests, guestContext());
    for (const row of ranked) {
      expect(Object.keys(row).sort()).toEqual([
        'created_at',
        'guest_id',
        'user_id',
      ]);
    }
  });
});

describe('availabilityOverlap', () => {
  const at = (
    days: number[],
    from?: string,
    to?: string,
  ): RecordedAvailability =>
    recordedAvailability({
      monday: days.includes(1),
      tuesday: days.includes(2),
      wednesday: days.includes(3),
      thursday: days.includes(4),
      friday: days.includes(5),
      available_from: from ? new Date(`1970-01-01T${from}:00Z`) : null,
      available_to: to ? new Date(`1970-01-01T${to}:00Z`) : null,
    });

  it('counts shared weekdays and the minutes their hours have in common', () => {
    expect(
      availabilityOverlap(
        at([1, 3, 5], '09:00', '12:00'),
        at([3, 4, 5], '10:00', '13:00'),
      ),
    ).toEqual({ days: 2, minutes: 120 });
  });

  it('counts days alone when either side recorded no hours', () => {
    expect(availabilityOverlap(at([1, 2]), at([2], '09:00', '10:00'))).toEqual({
      days: 1,
      minutes: 0,
    });
  });

  it('counts no minutes when no day is shared, even if the hours overlap', () => {
    expect(
      availabilityOverlap(at([1], '09:00', '12:00'), at([2], '09:00', '12:00')),
    ).toEqual({ days: 0, minutes: 0 });
  });

  it('counts nothing for someone who recorded no days', () => {
    expect(availabilityOverlap(at([]), at([1, 2, 3]))).toEqual({
      days: 0,
      minutes: 0,
    });
  });

  it('gives no negative minutes for hours that do not meet', () => {
    expect(
      availabilityOverlap(at([1], '09:00', '10:00'), at([1], '11:00', '12:00')),
    ).toEqual({ days: 1, minutes: 0 });
  });
});

describe('rankCoordinators', () => {
  const week = (
    userId: number,
    days: number[],
    from: string | null,
    to: string | null,
  ): [bigint, WeeklyAvailability] => [
    BigInt(userId),
    {
      monday: days.includes(1),
      tuesday: days.includes(2),
      wednesday: days.includes(3),
      thursday: days.includes(4),
      friday: days.includes(5),
      available_from: from ? new Date(`1970-01-01T${from}:00Z`) : null,
      available_to: to ? new Date(`1970-01-01T${to}:00Z`) : null,
    },
  ];

  const viewerAvailability = recordedAvailability(
    week(0, [1, 3], '09:00', '12:00')[1],
  );

  it('orders by topic fit first', () => {
    const rows = [
      coordinator(1, '2026-01-01'),
      coordinator(2, '2026-01-02'),
      coordinator(3, '2026-01-03'),
    ];
    const ranked = rankCoordinators(rows, {
      viewerTopics: ['Accounting', 'Banking & Finance'],
      viewerAvailability,
      topicsByUser: topicsOf([
        [201, ['Marketing Strategy']],
        [202, ['Accounting']],
        [203, ['Accounting', 'Banking & Finance']],
      ]),
      availabilityByUser: new Map(),
    });
    expect(coordinatorIds(ranked)).toEqual([3, 2, 1]);
  });

  it('breaks a tie on fit by shared days, then shared minutes', () => {
    const rows = [
      coordinator(1, '2026-01-01'),
      coordinator(2, '2026-01-02'),
      coordinator(3, '2026-01-03'),
      coordinator(4, '2026-01-04'),
    ];
    const same = ['Accounting'];
    const ranked = rankCoordinators(rows, {
      viewerTopics: ['Accounting'],
      viewerAvailability,
      topicsByUser: topicsOf([
        [201, same],
        [202, same],
        [203, same],
        [204, same],
      ]),
      availabilityByUser: new Map([
        week(201, [], null, null), // nothing recorded
        week(202, [1], '11:00', '13:00'), // 1 day, 60 minutes
        week(203, [1, 3], '09:00', '10:00'), // 2 days, 60 minutes
        week(204, [1, 3], '09:00', '12:00'), // 2 days, 180 minutes
      ]),
    });
    expect(coordinatorIds(ranked)).toEqual([4, 3, 2, 1]);
  });

  it('lets a better fit beat a better overlap', () => {
    const rows = [coordinator(1, '2026-01-01'), coordinator(2, '2026-01-02')];
    const ranked = rankCoordinators(rows, {
      viewerTopics: ['Accounting', 'Banking & Finance'],
      viewerAvailability,
      topicsByUser: topicsOf([
        [201, ['Accounting']],
        [202, ['Accounting', 'Banking & Finance']],
      ]),
      availabilityByUser: new Map([week(201, [1, 3], '09:00', '12:00')]),
    });
    expect(coordinatorIds(ranked)).toEqual([2, 1]);
  });

  it('falls back to the order coordinators joined in, then to id', () => {
    const rows = [
      coordinator(4, '2026-05-01'),
      coordinator(5, '2026-04-01'),
      coordinator(6, '2026-04-01'),
    ];
    const ranked = rankCoordinators(rows, {
      viewerTopics: [],
      viewerAvailability,
      topicsByUser: topicsOf([]),
      availabilityByUser: new Map(),
    });
    expect(coordinatorIds(ranked)).toEqual([5, 6, 4]);
  });

  it('keeps a coordinator who shares no topic, and one with no account', () => {
    const rows = [
      coordinator(1, '2026-01-01', null),
      coordinator(2, '2026-01-02'),
    ];
    const ranked = rankCoordinators(rows, {
      viewerTopics: ['Accounting'],
      viewerAvailability,
      topicsByUser: topicsOf([[202, ['Marketing Strategy']]]),
      availabilityByUser: new Map(),
    });
    expect(ranked).toHaveLength(2);
  });
});

describe('orderGuestsForViewer', () => {
  const guests = [
    guest(1, '2026-01-01'),
    guest(2, '2026-01-02'),
    guest(3, '2026-01-03'),
  ];
  const expertise = [
    { user_id: 101n, expertise: 'Marketing Strategy' },
    { user_id: 102n, expertise: 'Economics' },
    { user_id: 103n, expertise: 'Economics' },
    { user_id: 103n, expertise: 'Taxation Law' },
  ];

  function stub(
    options: { enabled?: boolean | null; viewer?: bigint | null } = {},
  ) {
    const settings = jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue({
        id: 1,
        suggestions_enabled: options.enabled ?? true,
        suggestions_fit_weight: 65,
        suggestions_rotation_weight: 20,
        suggestions_exposure_weight: 15,
        suggestions_half_life_days: 90,
      } as never);
    const profile = jest
      .spyOn(prisma.coordinators, 'findFirst')
      .mockResolvedValue(
        options.viewer === null
          ? null
          : ({ user_id: options.viewer ?? 50n } as never),
      );
    const topics = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([
        { user_id: 50n, expertise: 'Economics' },
        { user_id: 50n, expertise: 'Taxation Law' },
      ] as never);
    const accepted = jest
      .spyOn(prisma.match_requests, 'findMany')
      .mockResolvedValue([] as never);
    return { settings, profile, topics, accepted };
  }

  it('orders the guests for a coordinator while the setting is on', async () => {
    stub();
    const ordered = await orderGuestsForViewer(
      guests,
      expertise,
      'auth0|coord',
      NOW,
    );
    expect(ids(ordered)).toEqual([3, 2, 1]);
  });

  it('returns the guests exactly as given while the setting is off, and reads nothing more', async () => {
    const { profile, topics, accepted } = stub({ enabled: false });
    const ordered = await orderGuestsForViewer(
      guests,
      expertise,
      'auth0|coord',
      NOW,
    );
    expect(ordered).toBe(guests);
    expect(ids(ordered)).toEqual([1, 2, 3]);
    expect(profile).not.toHaveBeenCalled();
    expect(topics).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled();
  });

  it('treats a missing setting as on, as Suggested speakers does', async () => {
    stub();
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue({ id: 1 } as never);
    const ordered = await orderGuestsForViewer(
      guests,
      expertise,
      'auth0|coord',
      NOW,
    );
    expect(ids(ordered)).toEqual([3, 2, 1]);
  });

  it('leaves the order alone for a viewer who is not a coordinator', async () => {
    const { topics, accepted } = stub({ viewer: null });
    const ordered = await orderGuestsForViewer(
      guests,
      expertise,
      'auth0|admin',
      NOW,
    );
    expect(ordered).toBe(guests);
    expect(topics).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled();
  });

  it('leaves the order alone with no viewer, or fewer than two guests, without any read', async () => {
    const { settings } = stub();
    expect(await orderGuestsForViewer(guests, expertise, undefined, NOW)).toBe(
      guests,
    );
    const one = [guests[0]];
    expect(await orderGuestsForViewer(one, expertise, 'auth0|coord', NOW)).toBe(
      one,
    );
    expect(settings).not.toHaveBeenCalled();
  });

  it('reads the accepted matches of every guest in one query, never one per guest', async () => {
    const { accepted, topics, profile } = stub();
    await orderGuestsForViewer(guests, expertise, 'auth0|coord', NOW);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(accepted).toHaveBeenCalledWith({
      where: { guest_id: { in: [1n, 2n, 3n] }, status: 'ACCEPTED' },
      select: { guest_id: true, requested_at: true, updated_at: true },
    });
    // The guests' own topics were already read for the cards; only the viewer's are added.
    expect(topics).toHaveBeenCalledTimes(1);
    expect(topics).toHaveBeenCalledWith({ where: { user_id: 50n } });
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it('uses the administrator weights from the settings', async () => {
    stub();
    // Fit counts for almost nothing here, so the guest who has had no session comes first.
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
      id: 1,
      suggestions_enabled: true,
      suggestions_fit_weight: 50,
      suggestions_rotation_weight: 0,
      suggestions_exposure_weight: 50,
      suggestions_half_life_days: 90,
    } as never);
    jest.spyOn(prisma.match_requests, 'findMany').mockResolvedValue([
      { guest_id: 3n, requested_at: daysAgo(1), updated_at: daysAgo(1) },
      { guest_id: 3n, requested_at: daysAgo(2), updated_at: daysAgo(2) },
      { guest_id: 3n, requested_at: daysAgo(3), updated_at: daysAgo(3) },
      { guest_id: 3n, requested_at: daysAgo(4), updated_at: daysAgo(4) },
    ] as never);
    const ordered = await orderGuestsForViewer(
      guests,
      expertise,
      'auth0|coord',
      NOW,
    );
    // Guest 3 fits best but has had four sessions; guest 2 fits less and has had none.
    expect(ids(ordered)).toEqual([2, 3, 1]);
  });
});

describe('orderCoordinatorsForViewer', () => {
  const coordinators = [
    coordinator(1, '2026-01-01'),
    coordinator(2, '2026-01-02'),
    coordinator(3, '2026-01-03'),
  ];
  const expertise = [
    { user_id: 201n, expertise: 'Marketing Strategy' },
    { user_id: 202n, expertise: 'Accounting' },
    { user_id: 203n, expertise: 'Accounting' },
    { user_id: 203n, expertise: 'Banking & Finance' },
  ];
  const availability = [
    {
      user_id: 202n,
      monday: true,
      tuesday: false,
      wednesday: false,
      thursday: false,
      friday: false,
      available_from: null,
      available_to: null,
    },
  ];

  function stub(options: { enabled?: boolean; viewer?: bigint | null } = {}) {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
      id: 1,
      suggestions_enabled: options.enabled ?? true,
    } as never);
    const profile = jest
      .spyOn(prisma.guests, 'findFirst')
      .mockResolvedValue(
        options.viewer === null
          ? null
          : ({ user_id: options.viewer ?? 60n } as never),
      );
    const topics = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([
        { user_id: 60n, expertise: 'Accounting' },
        { user_id: 60n, expertise: 'Banking & Finance' },
      ] as never);
    jest.spyOn(prisma.availability, 'findFirst').mockResolvedValue({
      user_id: 60n,
      monday: true,
      tuesday: false,
      wednesday: false,
      thursday: false,
      friday: false,
      available_from: null,
      available_to: null,
    } as never);
    const accepted = jest
      .spyOn(prisma.match_requests, 'findMany')
      .mockResolvedValue([] as never);
    return { profile, topics, accepted };
  }

  it('orders the coordinators for a guest while the setting is on', async () => {
    stub();
    const ordered = await orderCoordinatorsForViewer(
      coordinators,
      expertise,
      availability,
      'auth0|guest',
    );
    expect(coordinatorIds(ordered)).toEqual([3, 2, 1]);
  });

  it('returns them exactly as given while the setting is off', async () => {
    const { profile } = stub({ enabled: false });
    const ordered = await orderCoordinatorsForViewer(
      coordinators,
      expertise,
      availability,
      'auth0|guest',
    );
    expect(ordered).toBe(coordinators);
    expect(profile).not.toHaveBeenCalled();
  });

  it('leaves the order alone for a viewer who is not a guest', async () => {
    stub({ viewer: null });
    const ordered = await orderCoordinatorsForViewer(
      coordinators,
      expertise,
      availability,
      'auth0|admin',
    );
    expect(ordered).toBe(coordinators);
  });

  it('never reads the matches of coordinators, so how busy they are cannot matter', async () => {
    const { accepted } = stub();
    await orderCoordinatorsForViewer(
      coordinators,
      expertise,
      availability,
      'auth0|guest',
    );
    expect(accepted).not.toHaveBeenCalled();
  });

  it('reads only the viewer’s own profile, topics and hours', async () => {
    const { profile, topics } = stub();
    await orderCoordinatorsForViewer(
      coordinators,
      expertise,
      availability,
      'auth0|guest',
    );
    expect(profile).toHaveBeenCalledTimes(1);
    expect(topics).toHaveBeenCalledTimes(1);
    expect(topics).toHaveBeenCalledWith({ where: { user_id: 60n } });
  });
});
