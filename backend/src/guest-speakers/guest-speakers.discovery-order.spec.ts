import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
import { GuestSpeakersService } from './guest-speakers.service';

/**
 * What a coordinator sees when browsing guest lecturers: the same people as
 * ever, in an order that depends on the administrator's Suggested speakers
 * setting.
 */

afterEach(() => jest.restoreAllMocks());

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const settings = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    require_admin_approval: false,
    suggestions_enabled: true,
    suggestions_fit_weight: 65,
    suggestions_rotation_weight: 20,
    suggestions_exposure_weight: 15,
    suggestions_half_life_days: 90,
    ...overrides,
  }) as never;

function guestRow(id: number, joined: string, first: string) {
  return {
    guest_id: BigInt(id),
    user_id: BigInt(id + 100),
    profile_image_id: null,
    first_name: first,
    last_name: 'Speaker',
    field: 'Law',
    role: 'Partner',
    experience: null,
    bio: null,
    prior_details: null,
    international_details: null,
    linkedIn_profile: null,
    location: null,
    duration: null,
    audience: null,
    created_at: new Date(joined),
    approved_at: null,
  };
}

/** The viewer's own topics are the Economics and Taxation Law the coordinator needs. */
const VIEWER_USER = 50n;

/**
 * Three guests, listed by id as the database gives them:
 *   1 Ada    shares no topic, no sessions            (lowest)
 *   2 Bea    shares both topics, six recent sessions (middle with the default weights)
 *   3 Cy     shares one topic, no sessions           (first with the default weights)
 * With the weights below that favour topic fit, Bea comes before Cy.
 */
function seed(
  options: { viewerIsCoordinator?: boolean; guests?: unknown[] } = {},
) {
  const rows = options.guests ?? [
    guestRow(1, '2026-01-01', 'Ada'),
    guestRow(2, '2026-02-01', 'Bea'),
    guestRow(3, '2026-03-01', 'Cy'),
  ];
  const listing = jest
    .spyOn(prisma.guests, 'findMany')
    .mockResolvedValue(rows as never);
  const profile = jest
    .spyOn(prisma.coordinators, 'findFirst')
    .mockResolvedValue(
      options.viewerIsCoordinator === false
        ? null
        : ({ user_id: VIEWER_USER } as never),
    );
  jest.spyOn(prisma.user_expertise, 'findMany').mockImplementation(((args: {
    where: { user_id: bigint | { in: bigint[] } };
  }) => {
    if (typeof args.where.user_id === 'bigint') {
      return Promise.resolve([
        { user_id: VIEWER_USER, expertise: 'Economics' },
        { user_id: VIEWER_USER, expertise: 'Taxation Law' },
      ]);
    }
    return Promise.resolve([
      { user_id: 101n, expertise: 'Marketing Strategy' },
      { user_id: 102n, expertise: 'Economics' },
      { user_id: 102n, expertise: 'Taxation Law' },
      { user_id: 103n, expertise: 'Economics' },
    ]);
  }) as never);
  jest.spyOn(prisma.availability, 'findMany').mockResolvedValue([] as never);
  const accepted = jest
    .spyOn(prisma.match_requests, 'findMany')
    .mockResolvedValue(
      [1, 2, 3, 4, 5, 6].map((n) => ({
        guest_id: 2n,
        requested_at: daysAgo(n),
        updated_at: daysAgo(n),
      })) as never,
    );
  return { listing, profile, accepted };
}

const names = (cards: { basicInformation: { fullName: string } }[]) =>
  cards.map((card) => card.basicInformation.fullName.split(' ')[0]);

describe('GuestSpeakersService.findAll order', () => {
  const service = new GuestSpeakersService();

  it('lists the best match first for a coordinator while the setting is on', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed();

    // Cy: fit 0.71 and never matched. Bea: fit 1 but six sessions this week.
    expect(names(await service.findAll('auth0|coord'))).toEqual([
      'Cy',
      'Bea',
      'Ada',
    ]);
  });

  it('keeps today’s order exactly while the setting is off', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settings({ suggestions_enabled: false }));
    const { profile, accepted } = seed();

    expect(names(await service.findAll('auth0|coord'))).toEqual([
      'Ada',
      'Bea',
      'Cy',
    ]);
    expect(profile).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled();
  });

  it('changes the order when the administrator changes the weights', async () => {
    const upsert = jest.spyOn(prisma.admin_settings, 'upsert');
    seed();

    upsert.mockResolvedValue(settings());
    const balanced = names(await service.findAll('auth0|coord'));

    upsert.mockResolvedValue(
      settings({
        suggestions_fit_weight: 90,
        suggestions_rotation_weight: 5,
        suggestions_exposure_weight: 5,
      }),
    );
    const topicFirst = names(await service.findAll('auth0|coord'));

    expect(balanced).toEqual(['Cy', 'Bea', 'Ada']);
    expect(topicFirst).toEqual(['Bea', 'Cy', 'Ada']);
  });

  it('falls back to the order guests joined in when scores are equal', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed({
      // Same topics, no sessions. Listed by id, but Dee joined first and Eve second.
      guests: [
        guestRow(7, '2026-05-01', 'Fay'),
        guestRow(8, '2026-02-01', 'Eve'),
        guestRow(9, '2026-01-01', 'Dee'),
      ],
    });
    jest.spyOn(prisma.user_expertise, 'findMany').mockImplementation(((args: {
      where: { user_id: bigint | { in: bigint[] } };
    }) =>
      Promise.resolve(
        typeof args.where.user_id === 'bigint'
          ? [{ user_id: VIEWER_USER, expertise: 'Economics' }]
          : [107n, 108n, 109n].map((user_id) => ({
              user_id,
              expertise: 'Economics',
            })),
      )) as never);
    jest
      .spyOn(prisma.match_requests, 'findMany')
      .mockResolvedValue([] as never);

    expect(names(await service.findAll('auth0|coord'))).toEqual([
      'Dee',
      'Eve',
      'Fay',
    ]);
  });

  it('does not reorder for a viewer who is not a coordinator', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed({ viewerIsCoordinator: false });

    expect(names(await service.findAll('auth0|admin'))).toEqual([
      'Ada',
      'Bea',
      'Cy',
    ]);
  });

  it('does not reorder when nobody is signed in to ask', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed();

    expect(names(await service.findAll())).toEqual(['Ada', 'Bea', 'Cy']);
  });

  it('asks the database for the same people, in the same way, whether ranking is on or off', async () => {
    const upsert = jest.spyOn(prisma.admin_settings, 'upsert');
    const { listing } = seed();

    upsert.mockResolvedValue(settings());
    await service.findAll('auth0|coord');
    upsert.mockResolvedValue(settings({ suggestions_enabled: false }));
    await service.findAll('auth0|coord');

    expect(listing).toHaveBeenCalledTimes(2);
    expect(listing.mock.calls[0][0]).toEqual(listing.mock.calls[1][0]);
    expect(listing.mock.calls[0][0]).toMatchObject({
      orderBy: { guest_id: 'asc' },
    });
  });

  it('never adds anyone: a guest the database leaves out stays out', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    // Two people reported Cy, so the database query leaves Cy out.
    stubOpenReports([
      {
        entry_id: 41n,
        actor_user_id: 8n,
        target_id: '103',
        detail: { reason: 'rude', matchId: '1' },
      },
      {
        entry_id: 42n,
        actor_user_id: 9n,
        target_id: '103',
        detail: { reason: 'rude', matchId: '2' },
      },
    ]);
    const { listing } = seed({
      guests: [
        guestRow(1, '2026-01-01', 'Ada'),
        guestRow(2, '2026-02-01', 'Bea'),
      ],
    });

    const cards = await service.findAll('auth0|coord');

    expect(names(cards)).toHaveLength(2);
    expect(listing.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [103n] } }] }],
      },
    });
  });

  it('returns no score, rank or activity field on any card', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings());
    seed();

    const cards = await service.findAll('auth0|coord');

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
      'rotation',
      'exposure',
      'total',
      'sessions',
      'lastSessionAt',
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
