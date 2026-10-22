import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
import { UnitCoordinatorsService } from './unit-coordinators.service';

/**
 * What a guest lecturer sees when browsing unit coordinators: the same people
 * as ever, in an order that depends on the administrator's Suggested speakers
 * setting.
 */

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MATCHING_SUGGESTIONS_ENABLED;
});

const settings = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    suggestions_enabled: true,
    suggestions_fit_weight: 65,
    suggestions_rotation_weight: 20,
    suggestions_exposure_weight: 15,
    suggestions_half_life_days: 90,
    ...overrides,
  }) as never;

function coordinatorRow(id: number, joined: string, first: string) {
  return {
    coordinator_id: BigInt(id),
    user_id: BigInt(id + 200),
    profile_image_id: null,
    first_name: first,
    last_name: 'Coordinator',
    faculty: 'Business',
    role: 'Lecturer',
    bio: null,
    required_experience: null,
    discipline: null,
    learning_objective: null,
    location: null,
    duration: null,
    audience: null,
    created_at: new Date(joined),
  };
}

const week = (
  userId: bigint,
  days: number[],
  from: string | null,
  to: string | null,
) => ({
  user_id: userId,
  monday: days.includes(1),
  tuesday: days.includes(2),
  wednesday: days.includes(3),
  thursday: days.includes(4),
  friday: days.includes(5),
  available_from: from ? new Date(`1970-01-01T${from}:00Z`) : null,
  available_to: to ? new Date(`1970-01-01T${to}:00Z`) : null,
  frequency: null,
  notes: null,
});

const VIEWER_USER = 60n;

/**
 * The guest knows Accounting and Banking & Finance and is free Monday and
 * Wednesday, 09:00 to 12:00. Four coordinators, listed by id:
 *   1 Ada   needs Marketing Strategy                         fit 0
 *   2 Bea   needs Accounting, free Tuesday only              fit 0.71, no shared day
 *   3 Cy    needs Accounting, free Monday and Wednesday 10-13  fit 0.71, 2 days, 120 minutes
 *   4 Di    needs Accounting and Banking & Finance           fit 1
 */
function seed(
  options: { viewerIsGuest?: boolean; coordinators?: unknown[] } = {},
) {
  const rows = options.coordinators ?? [
    coordinatorRow(1, '2026-01-01', 'Ada'),
    coordinatorRow(2, '2026-02-01', 'Bea'),
    coordinatorRow(3, '2026-03-01', 'Cy'),
    coordinatorRow(4, '2026-04-01', 'Di'),
  ];
  const listing = jest
    .spyOn(prisma.coordinators, 'findMany')
    .mockResolvedValue(rows as never);
  const profile = jest
    .spyOn(prisma.guests, 'findFirst')
    .mockResolvedValue(
      options.viewerIsGuest === false
        ? null
        : ({ user_id: VIEWER_USER } as never),
    );
  jest.spyOn(prisma.user_expertise, 'findMany').mockImplementation(((args: {
    where: { user_id: bigint | { in: bigint[] } };
  }) => {
    if (typeof args.where.user_id === 'bigint') {
      return Promise.resolve([
        { user_id: VIEWER_USER, expertise: 'Accounting' },
        { user_id: VIEWER_USER, expertise: 'Banking & Finance' },
      ]);
    }
    return Promise.resolve([
      { user_id: 201n, expertise: 'Marketing Strategy' },
      { user_id: 202n, expertise: 'Accounting' },
      { user_id: 203n, expertise: 'Accounting' },
      { user_id: 204n, expertise: 'Accounting' },
      { user_id: 204n, expertise: 'Banking & Finance' },
    ]);
  }) as never);
  jest
    .spyOn(prisma.availability, 'findFirst')
    .mockResolvedValue(week(VIEWER_USER, [1, 3], '09:00', '12:00') as never);
  jest
    .spyOn(prisma.availability, 'findMany')
    .mockResolvedValue([
      week(202n, [2], '09:00', '12:00'),
      week(203n, [1, 3], '10:00', '13:00'),
    ] as never);
  const accepted = jest
    .spyOn(prisma.match_requests, 'findMany')
    .mockResolvedValue([] as never);
  return { listing, profile, accepted };
}

const names = (cards: { basicInformation: { fullName: string } }[]) =>
  cards.map((card) => card.basicInformation.fullName.split(' ')[0]);

describe('UnitCoordinatorsService.findAll order', () => {
  const service = new UnitCoordinatorsService();

  it('lists the best topic match first for a guest, then the most overlapping time, while the setting is on', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed();

    expect(names(await service.findAll('auth0|guest'))).toEqual([
      'Di',
      'Cy',
      'Bea',
      'Ada',
    ]);
  });

  it('keeps today’s order exactly while the setting is off', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settings({ suggestions_enabled: false }));
    const { profile } = seed();

    expect(names(await service.findAll('auth0|guest'))).toEqual([
      'Ada',
      'Bea',
      'Cy',
      'Di',
    ]);
    expect(profile).not.toHaveBeenCalled();
  });

  it('keeps today’s order exactly when the server has Suggested speakers off, whatever the setting says', async () => {
    process.env.MATCHING_SUGGESTIONS_ENABLED = 'false';
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    const { profile } = seed();

    expect(names(await service.findAll('auth0|guest'))).toEqual([
      'Ada',
      'Bea',
      'Cy',
      'Di',
    ]);
    expect(profile).not.toHaveBeenCalled();
  });

  it('does not use how busy a coordinator is: the matches table is not read', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    const { accepted } = seed();

    await service.findAll('auth0|guest');

    expect(accepted).not.toHaveBeenCalled();
  });

  it('does not depend on the administrator’s weights, which are about lecturers', async () => {
    const upsert = jest.spyOn(prisma.admin_settings, 'upsert');
    seed();

    upsert.mockResolvedValue(settings());
    const balanced = names(await service.findAll('auth0|guest'));
    upsert.mockResolvedValue(
      settings({
        suggestions_fit_weight: 50,
        suggestions_rotation_weight: 0,
        suggestions_exposure_weight: 50,
        suggestions_half_life_days: 365,
      }),
    );
    const other = names(await service.findAll('auth0|guest'));

    expect(other).toEqual(balanced);
  });

  it('falls back to the order coordinators joined in when fit and time are equal', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed({
      // Listed by id, but Dee joined first and Eve second.
      coordinators: [
        coordinatorRow(7, '2026-05-01', 'Fay'),
        coordinatorRow(8, '2026-02-01', 'Eve'),
        coordinatorRow(9, '2026-01-01', 'Dee'),
      ],
    });
    jest.spyOn(prisma.user_expertise, 'findMany').mockImplementation(((args: {
      where: { user_id: bigint | { in: bigint[] } };
    }) =>
      Promise.resolve(
        typeof args.where.user_id === 'bigint'
          ? [{ user_id: VIEWER_USER, expertise: 'Accounting' }]
          : [207n, 208n, 209n].map((user_id) => ({
              user_id,
              expertise: 'Accounting',
            })),
      )) as never);
    jest.spyOn(prisma.availability, 'findMany').mockResolvedValue([] as never);

    expect(names(await service.findAll('auth0|guest'))).toEqual([
      'Dee',
      'Eve',
      'Fay',
    ]);
  });

  it('does not reorder for a viewer who is not a guest lecturer', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed({ viewerIsGuest: false });

    expect(names(await service.findAll('auth0|admin'))).toEqual([
      'Ada',
      'Bea',
      'Cy',
      'Di',
    ]);
  });

  it('does not reorder when nobody is signed in to ask', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed();

    expect(names(await service.findAll())).toEqual(['Ada', 'Bea', 'Cy', 'Di']);
  });

  it('asks the database for the same people, in the same way, whether ranking is on or off', async () => {
    const upsert = jest.spyOn(prisma.admin_settings, 'upsert');
    const { listing } = seed();

    upsert.mockResolvedValue(settings());
    await service.findAll('auth0|guest');
    upsert.mockResolvedValue(settings({ suggestions_enabled: false }));
    await service.findAll('auth0|guest');

    expect(listing).toHaveBeenCalledTimes(2);
    expect(listing.mock.calls[0][0]).toEqual(listing.mock.calls[1][0]);
    expect(listing.mock.calls[0][0]).toMatchObject({
      orderBy: { coordinator_id: 'asc' },
    });
  });

  it('never adds anyone: a coordinator the database leaves out stays out', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    // Two people reported coordinator 203, so the database query leaves them out.
    stubOpenReports([
      {
        entry_id: 41n,
        actor_user_id: 8n,
        target_id: '203',
        detail: { reason: 'rude', matchId: '1' },
      },
      {
        entry_id: 42n,
        actor_user_id: 9n,
        target_id: '203',
        detail: { reason: 'rude', matchId: '2' },
      },
    ]);
    const { listing } = seed({
      coordinators: [
        coordinatorRow(1, '2026-01-01', 'Ada'),
        coordinatorRow(2, '2026-02-01', 'Bea'),
      ],
    });

    const cards = await service.findAll('auth0|guest');

    expect(names(cards)).toHaveLength(2);
    expect(listing.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [203n] } }] }],
      },
    });
  });

  it('returns no score, rank or activity field on any card', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed();

    const cards = await service.findAll('auth0|guest');

    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          walk(inner);
        }
      }
    };
    walk(cards);

    for (const banned of [
      'score',
      'fit',
      'rank',
      'overlap',
      'total',
      'createdAt',
      'created_at',
    ]) {
      expect(keys).not.toContain(banned);
    }
    expect(Object.keys(cards[0]).sort()).toEqual([
      'basicInformation',
      'consentPreferences',
      'engagementProfile',
      'expertise',
      'id',
    ]);
  });
});
