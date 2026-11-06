import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
import type { DiscoverySort } from '../suggestions/discovery-sort';
import { UnitCoordinatorsService } from './unit-coordinators.service';

/**
 * What a guest lecturer sees when browsing unit coordinators and picks a sort:
 * the same people as ever, in the order asked for.
 */

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MATCHING_SUGGESTIONS_ENABLED;
});

const settings = (on: boolean) =>
  ({
    id: 1,
    suggestions_enabled: on,
    suggestions_fit_weight: 65,
    suggestions_rotation_weight: 20,
    suggestions_exposure_weight: 15,
    suggestions_half_life_days: 90,
  }) as never;

function coordinatorRow(id: number, first: string) {
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
    created_at: new Date(`2026-0${id}-01`),
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

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const SIGNED_IN = {
  bea: daysAgo(2),
  cy: daysAgo(20),
  abe: daysAgo(60),
};

/**
 * Four coordinators, listed by id as the database gives them:
 *   1 Dot  needs Marketing Strategy           never signed in       (band 4)
 *   2 Bea  needs Accounting, free Tuesday     signed in 2 days ago  (band 1)
 *   3 Cy   needs Accounting and Banking       signed in 20 days ago (band 2)
 *   4 Abe  needs Accounting, free Mon and Wed signed in 60 days ago (band 3)
 * The guest knows Accounting and Banking & Finance and is free Monday and
 * Wednesday, 09:00 to 12:00.
 */
function seed(on: boolean) {
  jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(settings(on));
  const listing = jest
    .spyOn(prisma.coordinators, 'findMany')
    .mockResolvedValue([
      coordinatorRow(1, 'Dot'),
      coordinatorRow(2, 'Bea'),
      coordinatorRow(3, 'Cy'),
      coordinatorRow(4, 'Abe'),
    ] as never);
  jest
    .spyOn(prisma.guests, 'findFirst')
    .mockResolvedValue({ user_id: VIEWER_USER } as never);
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
        { user_id: VIEWER_USER, expertise: 'Accounting' },
        { user_id: VIEWER_USER, expertise: 'Banking & Finance' },
      ]);
    }
    return Promise.resolve([
      { user_id: 201n, expertise: 'Marketing Strategy' },
      { user_id: 202n, expertise: 'Accounting' },
      { user_id: 203n, expertise: 'Accounting' },
      { user_id: 203n, expertise: 'Banking & Finance' },
      { user_id: 204n, expertise: 'Accounting' },
    ]);
  }) as never);
  const own = jest
    .spyOn(prisma.availability, 'findFirst')
    .mockResolvedValue(week(VIEWER_USER, [1, 3], '09:00', '12:00') as never);
  jest
    .spyOn(prisma.availability, 'findMany')
    .mockResolvedValue([
      week(202n, [2], '09:00', '12:00'),
      week(204n, [1, 3], '10:00', '13:00'),
    ] as never);
  // The record of sign-ins, which the active sort reads...
  const signIns = jest
    .spyOn(prisma.audit_entries, 'groupBy')
    .mockResolvedValue([
      { actor_user_id: 202n, _max: { occurred_at: SIGNED_IN.bea } },
      { actor_user_id: 203n, _max: { occurred_at: SIGNED_IN.cy } },
      { actor_user_id: 204n, _max: { occurred_at: SIGNED_IN.abe } },
    ] as never);
  // ...and the stored last sign-in column, which it must never read. It says
  // everyone signed in today, so a sort that used it would show.
  const stored = jest.spyOn(prisma.users, 'findMany').mockResolvedValue(
    [201n, 202n, 203n, 204n].map((userid) => ({
      userid,
      lastloginat: new Date(),
    })) as never,
  );
  return { listing, signIns, stored, own };
}

const names = (cards: { basicInformation: { fullName: string } }[]) =>
  cards.map((card) => card.basicInformation.fullName.split(' ')[0]);

const EXPECTED: Record<Exclude<DiscoverySort, 'best'>, string[]> = {
  joined: ['Dot', 'Bea', 'Cy', 'Abe'],
  newest: ['Abe', 'Cy', 'Bea', 'Dot'],
  name: ['Abe', 'Bea', 'Cy', 'Dot'],
  // Cy shares two topics; Bea and Abe share one each, so the order they joined in decides.
  topics: ['Cy', 'Bea', 'Abe', 'Dot'],
  active: ['Bea', 'Cy', 'Abe', 'Dot'],
};

// Cy fits best. Abe and Bea fit equally, and Abe shares more of the guest's time.
const BEST = ['Cy', 'Abe', 'Bea', 'Dot'];

describe('UnitCoordinatorsService.findAll sort', () => {
  const service = new UnitCoordinatorsService();

  describe.each([
    ['off', false],
    ['on', true],
  ])('with ranked matching %s', (_label, on) => {
    it.each(Object.entries(EXPECTED))(
      'orders by %s as asked',
      async (sort, expected) => {
        seed(on);
        expect(
          names(await service.findAll('auth0|guest', sort as DiscoverySort)),
        ).toEqual(expected);
      },
    );
  });

  it('is the order people joined by default while ranked matching is off', async () => {
    seed(false);
    expect(names(await service.findAll('auth0|guest'))).toEqual(
      EXPECTED.joined,
    );
  });

  it('is the best match first by default while ranked matching is on', async () => {
    seed(true);
    expect(names(await service.findAll('auth0|guest'))).toEqual(BEST);
  });

  it('gives best explicitly the same order as the default while it is on', async () => {
    seed(true);
    expect(names(await service.findAll('auth0|guest', 'best'))).toEqual(BEST);
  });

  it('falls back to the order people joined when best is asked for while ranked matching is off', async () => {
    const { signIns, own } = seed(false);
    expect(names(await service.findAll('auth0|guest', 'best'))).toEqual(
      EXPECTED.joined,
    );
    // Nothing is scored, and nothing about the coordinators' activity is read.
    expect(own).not.toHaveBeenCalled();
    expect(signIns).not.toHaveBeenCalled();
  });

  it('falls back to the order people joined for best when the server has ranked matching switched off', async () => {
    process.env.MATCHING_SUGGESTIONS_ENABLED = 'false';
    seed(true);
    expect(names(await service.findAll('auth0|guest', 'best'))).toEqual(
      EXPECTED.joined,
    );
  });

  it('keeps the order people joined in for people who signed in on different days within the same week', async () => {
    const { signIns } = seed(true);
    // Everyone signed in within the last week, on different days: the same
    // band, so the order they joined in decides and the day cannot be read from it.
    signIns.mockResolvedValue([
      { actor_user_id: 201n, _max: { occurred_at: daysAgo(3) } },
      { actor_user_id: 202n, _max: { occurred_at: daysAgo(1) } },
      { actor_user_id: 203n, _max: { occurred_at: daysAgo(6) } },
      { actor_user_id: 204n, _max: { occurred_at: daysAgo(1) } },
    ] as never);
    expect(names(await service.findAll('auth0|guest', 'active'))).toEqual(
      EXPECTED.joined,
    );

    signIns.mockResolvedValue([
      { actor_user_id: 201n, _max: { occurred_at: daysAgo(1) } },
      { actor_user_id: 202n, _max: { occurred_at: daysAgo(6) } },
      { actor_user_id: 203n, _max: { occurred_at: daysAgo(1) } },
      { actor_user_id: 204n, _max: { occurred_at: daysAgo(3) } },
    ] as never);
    expect(names(await service.findAll('auth0|guest', 'active'))).toEqual(
      EXPECTED.joined,
    );
  });

  it('does not move anyone for a sign-in today: it counts from the next day', async () => {
    const { signIns, stored } = seed(true);
    const before = names(await service.findAll('auth0|guest', 'active'));
    // Dot, who had never signed in, signs in now, and so does Bea, who signed
    // in a couple of days ago. The stored last sign-in moves to now for both,
    // and the record of sign-ins before today is what it was.
    expect(stored).not.toHaveBeenCalled();
    stored.mockResolvedValue([
      { userid: 201n, lastloginat: new Date() },
      { userid: 202n, lastloginat: new Date() },
    ] as never);
    expect(names(await service.findAll('auth0|guest', 'active'))).toEqual(
      before,
    );
    expect(signIns).toHaveBeenCalledTimes(2);
  });

  it('keeps someone who has only signed in today, with nothing recorded before today, in the last band', async () => {
    const { signIns } = seed(true);
    // Only Cy has a recorded sign-in before today. Everyone else, including
    // Bea whose stored last sign-in is today, has none and is in the last band.
    signIns.mockResolvedValue([
      { actor_user_id: 203n, _max: { occurred_at: daysAgo(40) } },
    ] as never);
    expect(names(await service.findAll('auth0|guest', 'active'))).toEqual([
      'Cy',
      'Dot',
      'Bea',
      'Abe',
    ]);
  });

  it('reads the record of sign-ins only for the active sort, and never the stored last sign-in', async () => {
    const { signIns, stored } = seed(true);
    for (const sort of [
      'joined',
      'newest',
      'name',
      'topics',
      'best',
    ] as const) {
      await service.findAll('auth0|guest', sort);
    }
    expect(signIns).not.toHaveBeenCalled();
    await service.findAll('auth0|guest', 'active');
    expect(signIns).toHaveBeenCalledTimes(1);
    expect(stored).not.toHaveBeenCalled();
  });

  it('asks the database for the same people whichever sort is chosen', async () => {
    const { listing } = seed(true);
    for (const sort of [...Object.keys(EXPECTED), 'best'] as DiscoverySort[]) {
      await service.findAll('auth0|guest', sort);
    }
    const first = listing.mock.calls[0][0];
    for (const call of listing.mock.calls) {
      expect(call[0]).toEqual(first);
    }
    expect(first).toMatchObject({ orderBy: { coordinator_id: 'asc' } });
  });

  it('never adds anyone: a coordinator the database leaves out stays out of every sort', async () => {
    // Two people reported someone, so the database query leaves them out.
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
    const { listing } = seed(true);
    listing.mockResolvedValue([
      coordinatorRow(1, 'Dot'),
      coordinatorRow(2, 'Bea'),
    ] as never);

    for (const sort of [...Object.keys(EXPECTED), 'best'] as DiscoverySort[]) {
      expect(names(await service.findAll('auth0|guest', sort))).toHaveLength(2);
    }
    expect(listing.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [203n] } }] }],
      },
    });
  });

  it('returns no sign-in time, count or date on any card, for any sort', async () => {
    seed(true);
    for (const sort of [...Object.keys(EXPECTED), 'best'] as DiscoverySort[]) {
      const cards = await service.findAll('auth0|guest', sort);
      const text = JSON.stringify(cards);
      for (const banned of [
        'lastloginat',
        'lastLogin',
        'lastSignIn',
        'signedIn',
        'sharedTopics',
        'createdAt',
        'created_at',
        ...Object.values(SIGNED_IN).map((when) =>
          when.toISOString().slice(0, 10),
        ),
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
