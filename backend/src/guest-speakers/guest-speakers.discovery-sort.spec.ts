import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
import type { DiscoverySort } from '../suggestions/discovery-sort';
import { GuestSpeakersService } from './guest-speakers.service';

/**
 * What a coordinator sees when browsing guest lecturers and picks a sort: the
 * same people as ever, in the order asked for.
 */

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MATCHING_SUGGESTIONS_ENABLED;
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const settings = (on: boolean) =>
  ({
    id: 1,
    require_admin_approval: false,
    suggestions_enabled: on,
    suggestions_fit_weight: 65,
    suggestions_rotation_weight: 20,
    suggestions_exposure_weight: 15,
    suggestions_half_life_days: 90,
  }) as never;

function guestRow(id: number, first: string) {
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
    created_at: new Date(`2026-0${id}-01`),
    approved_at: null,
  };
}

const VIEWER_USER = 50n;

/**
 * Four guests, listed by id as the database gives them:
 *   1 Ada  Marketing only          never signed in
 *   2 Bea  Economics and Taxation  signed in 1 Sep, six sessions this week
 *   3 Cy   Economics               signed in 20 Oct
 *   4 Abe  Economics and Taxation  signed in 25 Oct
 * The coordinator needs Economics and Taxation Law.
 */
function seed(on: boolean) {
  jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings(on));
  const listing = jest
    .spyOn(prisma.guests, 'findMany')
    .mockResolvedValue([
      guestRow(1, 'Ada'),
      guestRow(2, 'Bea'),
      guestRow(3, 'Cy'),
      guestRow(4, 'Abe'),
    ] as never);
  jest
    .spyOn(prisma.coordinators, 'findFirst')
    .mockResolvedValue({ user_id: VIEWER_USER } as never);
  const accepted = jest.spyOn(prisma.match_requests, 'findMany');
  jest.spyOn(prisma.user_expertise, 'findMany').mockImplementation(((args: {
    where: { user_id?: bigint | { in: bigint[] } };
  }) => {
    // The viewer's own topics are asked for by id (best match) or by account
    // (topics sort); the cards' topics are asked for as a list of ids.
    const mine =
      args.where.user_id === undefined ||
      typeof args.where.user_id === 'bigint';
    if (mine) {
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
      { user_id: 104n, expertise: 'Economics' },
      { user_id: 104n, expertise: 'Taxation Law' },
    ]);
  }) as never);
  jest.spyOn(prisma.availability, 'findMany').mockResolvedValue([] as never);
  accepted.mockResolvedValue(
    [1, 2, 3, 4, 5, 6].map((n) => ({
      guest_id: 2n,
      requested_at: daysAgo(n),
      updated_at: daysAgo(n),
    })) as never,
  );
  const signIns = jest.spyOn(prisma.users, 'findMany').mockResolvedValue([
    { userid: 101n, lastloginat: null },
    { userid: 102n, lastloginat: new Date('2026-09-01T00:00:00Z') },
    { userid: 103n, lastloginat: new Date('2026-10-20T00:00:00Z') },
    { userid: 104n, lastloginat: new Date('2026-10-25T00:00:00Z') },
  ] as never);
  return { listing, signIns, accepted };
}

const names = (cards: { basicInformation: { fullName: string } }[]) =>
  cards.map((card) => card.basicInformation.fullName.split(' ')[0]);

const EXPECTED: Record<Exclude<DiscoverySort, 'best'>, string[]> = {
  joined: ['Ada', 'Bea', 'Cy', 'Abe'],
  newest: ['Abe', 'Cy', 'Bea', 'Ada'],
  name: ['Abe', 'Ada', 'Bea', 'Cy'],
  // Bea and Abe share two topics each, so the order they joined in decides.
  topics: ['Bea', 'Abe', 'Cy', 'Ada'],
  active: ['Abe', 'Cy', 'Bea', 'Ada'],
};

const BEST = ['Abe', 'Cy', 'Bea', 'Ada'];

describe('GuestSpeakersService.findAll sort', () => {
  const service = new GuestSpeakersService();

  describe.each([
    ['off', false],
    ['on', true],
  ])('with ranked matching %s', (_label, on) => {
    it.each(Object.entries(EXPECTED))(
      'orders by %s as asked',
      async (sort, expected) => {
        seed(on);
        expect(
          names(await service.findAll('auth0|coord', sort as DiscoverySort)),
        ).toEqual(expected);
      },
    );
  });

  it('is the order people joined by default while ranked matching is off', async () => {
    seed(false);
    expect(names(await service.findAll('auth0|coord'))).toEqual(
      EXPECTED.joined,
    );
  });

  it('is the best match first by default while ranked matching is on', async () => {
    seed(true);
    // Abe: fit 1 and no sessions. Cy: fit 0.71, no sessions. Bea: fit 1 but six sessions this week.
    expect(names(await service.findAll('auth0|coord'))).toEqual(BEST);
  });

  it('gives best explicitly the same order as the default while it is on', async () => {
    seed(true);
    expect(names(await service.findAll('auth0|coord', 'best'))).toEqual(BEST);
  });

  it('falls back to the order people joined when best is asked for while ranked matching is off', async () => {
    const { signIns, accepted } = seed(false);
    expect(names(await service.findAll('auth0|coord', 'best'))).toEqual(
      EXPECTED.joined,
    );
    // Nothing is scored, and nothing about the guests' activity is read.
    expect(accepted).not.toHaveBeenCalled();
    expect(signIns).not.toHaveBeenCalled();
  });

  it('falls back to the order people joined for best when the server has ranked matching switched off', async () => {
    process.env.MATCHING_SUGGESTIONS_ENABLED = 'false';
    seed(true);
    expect(names(await service.findAll('auth0|coord', 'best'))).toEqual(
      EXPECTED.joined,
    );
  });

  it('reads sign-in times only for the active sort', async () => {
    const { signIns } = seed(true);
    for (const sort of [
      'joined',
      'newest',
      'name',
      'topics',
      'best',
    ] as const) {
      await service.findAll('auth0|coord', sort);
    }
    expect(signIns).not.toHaveBeenCalled();
    await service.findAll('auth0|coord', 'active');
    expect(signIns).toHaveBeenCalledTimes(1);
  });

  it('asks the database for the same people whichever sort is chosen', async () => {
    const { listing } = seed(true);
    for (const sort of [...Object.keys(EXPECTED), 'best'] as DiscoverySort[]) {
      await service.findAll('auth0|coord', sort);
    }
    const first = listing.mock.calls[0][0];
    for (const call of listing.mock.calls) {
      expect(call[0]).toEqual(first);
    }
    expect(first).toMatchObject({ orderBy: { guest_id: 'asc' } });
  });

  it('never adds anyone: a guest the database leaves out stays out of every sort', async () => {
    // Two people reported someone, so the database query leaves them out.
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
    const { listing } = seed(true);
    listing.mockResolvedValue([
      guestRow(1, 'Ada'),
      guestRow(2, 'Bea'),
    ] as never);

    for (const sort of [...Object.keys(EXPECTED), 'best'] as DiscoverySort[]) {
      expect(names(await service.findAll('auth0|coord', sort))).toHaveLength(2);
    }
    expect(listing.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [103n] } }] }],
      },
    });
  });

  it('returns no sign-in time, count or date on any card, for any sort', async () => {
    seed(true);
    for (const sort of [...Object.keys(EXPECTED), 'best'] as DiscoverySort[]) {
      const cards = await service.findAll('auth0|coord', sort);
      const text = JSON.stringify(cards);
      for (const banned of [
        'lastloginat',
        'lastLogin',
        'lastSignIn',
        'signedIn',
        'sharedTopics',
        'createdAt',
        'created_at',
        '2026-09-01',
        '2026-10-20',
        '2026-10-25',
      ]) {
        expect(text).not.toContain(banned);
      }
      expect(Object.keys(cards[0]).sort()).toEqual([
        'basicInformation',
        'consentPreferences',
        'engagementProfile',
        'expertise',
        'id',
      ]);
    }
  });
});
