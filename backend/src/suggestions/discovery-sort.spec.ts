import { prisma } from '../prisma';
import {
  DISCOVERY_SORTS,
  activityBand,
  isManualSort,
  sortDiscovery,
  sortRows,
  startOfToday,
  type Placeable,
} from './discovery-sort';

afterEach(() => jest.restoreAllMocks());

interface Row {
  id: number;
  user: number | null;
  first: string | null;
  last: string | null;
}

const row = (
  id: number,
  first: string | null,
  last: string | null = null,
  user: number | null = id + 100,
): Row => ({ id, user, first, last });

const place = (r: Row): Placeable => ({
  id: BigInt(r.id),
  userId: r.user === null ? null : BigInt(r.user),
  firstName: r.first,
  lastName: r.last,
});

const ids = (rows: Row[]) => rows.map((r) => r.id);
/** An instant given as Australia/Perth wall-clock time, which is UTC+8. */
const perth = (local: string) => new Date(`${local}:00+08:00`);

const DAY = 86_400_000;

const topicsOf = (entries: [number, string[]][]) =>
  new Map(entries.map(([user, topics]) => [BigInt(user), topics]));

describe('the list of sorts', () => {
  it('has the five manual sorts and best, in that order', () => {
    expect([...DISCOVERY_SORTS]).toEqual([
      'joined',
      'newest',
      'name',
      'topics',
      'active',
      'best',
    ]);
  });

  it('treats everything but best, and a sort left out, as manual', () => {
    expect(isManualSort('joined')).toBe(true);
    expect(isManualSort('newest')).toBe(true);
    expect(isManualSort('name')).toBe(true);
    expect(isManualSort('topics')).toBe(true);
    expect(isManualSort('active')).toBe(true);
    expect(isManualSort('best')).toBe(false);
    expect(isManualSort(undefined)).toBe(false);
  });
});

describe('startOfToday', () => {
  it('is midnight at the start of the day in Perth, which is 16:00 UTC the day before', () => {
    expect(startOfToday(new Date('2026-10-26T15:00:00Z')).toISOString()).toBe(
      '2026-10-25T16:00:00.000Z',
    );
    expect(startOfToday(new Date('2026-10-25T16:00:00Z')).toISOString()).toBe(
      '2026-10-25T16:00:00.000Z',
    );
  });

  it('stays the same all day and moves on at Perth midnight', () => {
    const first = startOfToday(perth('2026-10-26T00:00')).toISOString();
    expect(startOfToday(perth('2026-10-26T12:30')).toISOString()).toBe(first);
    expect(startOfToday(perth('2026-10-26T23:59')).toISOString()).toBe(first);
    expect(startOfToday(perth('2026-10-27T00:00')).toISOString()).not.toBe(
      first,
    );
  });
});

describe('activityBand', () => {
  // Counted from the start of Monday 26 October in Perth.
  const REF = startOfToday(perth('2026-10-26T23:00'));

  it('is 1 for a sign-in in the last 7 days, before today', () => {
    expect(activityBand(perth('2026-10-25T23:59'), REF)).toBe(1);
    expect(activityBand(perth('2026-10-19T23:59'), REF)).toBe(1);
    expect(activityBand(perth('2026-10-19T00:00'), REF)).toBe(1);
  });

  it('is 2 from 8 to 30 days, 3 from 31 to 90 days, and 4 beyond that', () => {
    expect(activityBand(perth('2026-10-18T23:59'), REF)).toBe(2);
    expect(activityBand(perth('2026-09-26T00:00'), REF)).toBe(2);
    expect(activityBand(perth('2026-09-25T23:59'), REF)).toBe(3);
    expect(activityBand(perth('2026-07-28T00:00'), REF)).toBe(3);
    expect(activityBand(perth('2026-07-27T23:59'), REF)).toBe(4);
    expect(activityBand(perth('2020-01-01T00:00'), REF)).toBe(4);
  });

  it('is 4 for someone who has never signed in, and for a date it cannot read', () => {
    expect(activityBand(null, REF)).toBe(4);
    expect(activityBand(undefined, REF)).toBe(4);
    expect(activityBand(new Date('not a date'), REF)).toBe(4);
  });

  it('does not count a sign-in from today: it is the last band until tomorrow', () => {
    expect(activityBand(perth('2026-10-26T00:00'), REF)).toBe(4);
    expect(activityBand(perth('2026-10-26T22:59'), REF)).toBe(4);
    // Nor one in the future, from clock skew.
    expect(activityBand(perth('2026-10-28T09:00'), REF)).toBe(4);
  });

  it('counts whole Perth days, so the band cannot change in the middle of a day', () => {
    const early = perth('2026-10-19T00:01');
    const late = perth('2026-10-19T23:59');
    for (const reading of ['00:00', '06:30', '12:00', '23:59']) {
      const reference = startOfToday(perth(`2026-10-26T${reading}`));
      expect(activityBand(early, reference)).toBe(1);
      expect(activityBand(late, reference)).toBe(1);
    }
    // It moves on at Perth midnight, 7 days after that day.
    expect(activityBand(late, startOfToday(perth('2026-10-26T23:59')))).toBe(1);
    expect(activityBand(late, startOfToday(perth('2026-10-27T00:00')))).toBe(2);
  });
});

describe('sortRows', () => {
  const rows = [
    row(3, 'Cara', 'Young'),
    row(1, 'Zed', 'Adams'),
    row(2, 'Abe', 'Zimmer'),
  ];

  it('joined puts the lowest id first, whatever order the rows came in', () => {
    expect(ids(sortRows(rows, 'joined', place))).toEqual([1, 2, 3]);
  });

  it('newest is joined reversed', () => {
    expect(ids(sortRows(rows, 'newest', place))).toEqual([3, 2, 1]);
  });

  it('does not change the list it was given', () => {
    const before = ids(rows);
    sortRows(rows, 'newest', place);
    expect(ids(rows)).toEqual(before);
  });

  describe('name', () => {
    it('goes A to Z by full name', () => {
      expect(ids(sortRows(rows, 'name', place))).toEqual([2, 3, 1]);
    });

    it('ignores case, and keeps joined order for the same name', () => {
      const same = [
        row(5, 'mia', 'Ng'),
        row(4, 'Mia', 'NG'),
        row(6, 'Mia', 'Ng'),
        row(7, 'Ana', 'Ng'),
      ];
      expect(ids(sortRows(same, 'name', place))).toEqual([7, 4, 5, 6]);
    });

    it('puts a profile with no name last', () => {
      const withBlank = [
        row(1, null, null),
        row(2, 'Bea', 'Cho'),
        row(3, '', ''),
        row(4, 'Abe', 'Cho'),
      ];
      expect(ids(sortRows(withBlank, 'name', place))).toEqual([4, 2, 1, 3]);
    });

    it('uses only a first name when there is no last name', () => {
      const partial = [row(1, 'Bea', null), row(2, 'Abe', null)];
      expect(ids(sortRows(partial, 'name', place))).toEqual([2, 1]);
    });
  });

  describe('topics', () => {
    const topicRows = [
      row(1, 'A'), // shares nothing
      row(2, 'B'), // shares two
      row(3, 'C'), // shares one
      row(4, 'D'), // shares two, joined after B
      row(5, 'E', null, null), // no account
    ];
    const topicsByUser = topicsOf([
      [101, ['Marketing']],
      [102, ['Economics', 'Taxation Law', 'Marketing']],
      [103, ['Economics']],
      [104, ['Taxation Law', 'Economics']],
    ]);

    it('puts the most shared topics first, and ties go to the order people joined', () => {
      expect(
        ids(
          sortRows(topicRows, 'topics', place, {
            viewerTopics: ['Economics', 'Taxation Law'],
            topicsByUser,
          }),
        ),
      ).toEqual([2, 4, 3, 1, 5]);
    });

    it('counts a topic once and ignores case and spacing, as Suggested speakers does', () => {
      const messy = [row(1, 'A'), row(2, 'B')];
      const sorted = sortRows(messy, 'topics', place, {
        viewerTopics: ['economics', 'Taxation  Law'],
        topicsByUser: topicsOf([
          [101, ['ECONOMICS']],
          [102, ['Economics', 'economics', 'taxation law']],
        ]),
      });
      expect(ids(sorted)).toEqual([2, 1]);
    });

    it('is plain joined order when the viewer has named no topics', () => {
      expect(
        ids(
          sortRows(topicRows, 'topics', place, {
            viewerTopics: [],
            topicsByUser,
          }),
        ),
      ).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('active', () => {
    // Counted from the start of Monday 26 October in Perth.
    const REF = startOfToday(perth('2026-10-26T23:00'));
    const ago = (days: number, time = '12:00') => {
      const day = new Date(REF.getTime() - days * DAY + 8 * 3_600_000);
      return perth(`${day.toISOString().slice(0, 10)}T${time}`);
    };

    const activeRows = [
      row(1, 'A'), // never signed in
      row(2, 'B'), // 60 days ago: band 3
      row(3, 'C'), // 2 days ago: band 1
      row(4, 'D'), // 61 days ago, joined after B: band 3
      row(5, 'E', null, null), // no account: band 4
      row(6, 'F'), // never signed in, joined after A: band 4
      row(7, 'G'), // 20 days ago: band 2
      row(8, 'H'), // 200 days ago: band 4
    ];
    const lastSignIn = new Map<bigint, Date | null>([
      [101n, null],
      [102n, ago(60)],
      [103n, ago(2)],
      [104n, ago(61)],
      [106n, null],
      [107n, ago(20)],
      [108n, ago(200)],
    ]);

    it('puts the most recent band first, and the longest ago or never last', () => {
      expect(
        ids(
          sortRows(activeRows, 'active', place, {
            lastSignIn,
            reference: REF,
          }),
        ),
      ).toEqual([3, 7, 2, 4, 1, 5, 6, 8]);
    });

    it('keeps the order people joined in inside a band, so the exact time cannot be read from the order', () => {
      // All signed in within the same week, at different times of different
      // days. Whoever signed in last is not placed first.
      const sameWeek = [row(1, 'A'), row(2, 'B'), row(3, 'C'), row(4, 'D')];
      const times = new Map<bigint, Date | null>([
        [101n, ago(6, '09:00')],
        [102n, ago(1, '23:59')],
        [103n, ago(3, '23:59')],
        [104n, ago(1, '00:00')],
      ]);
      expect(
        ids(
          sortRows(sameWeek, 'active', place, {
            lastSignIn: times,
            reference: REF,
          }),
        ),
      ).toEqual([1, 2, 3, 4]);

      // Reversing who signed in when changes nothing.
      const reversed = new Map<bigint, Date | null>([
        [101n, ago(1, '23:59')],
        [102n, ago(6, '09:00')],
        [103n, ago(1, '00:00')],
        [104n, ago(3, '23:59')],
      ]);
      expect(
        ids(
          sortRows(sameWeek, 'active', place, {
            lastSignIn: reversed,
            reference: REF,
          }),
        ),
      ).toEqual([1, 2, 3, 4]);
    });

    it('does the same inside the month and the three-month bands', () => {
      const rowsInBands = [row(1, 'A'), row(2, 'B'), row(3, 'C'), row(4, 'D')];
      const times = new Map<bigint, Date | null>([
        [101n, ago(29)],
        [102n, ago(10)],
        [103n, ago(89)],
        [104n, ago(31)],
      ]);
      // 2 and 1 are in the month band (join order 1, 2); 4 and 3 are in the three-month band (join order 3, 4).
      expect(
        ids(
          sortRows(rowsInBands, 'active', place, {
            lastSignIn: times,
            reference: REF,
          }),
        ),
      ).toEqual([1, 2, 3, 4]);
    });

    it('is plain joined order when nobody has a sign-in time', () => {
      expect(
        ids(sortRows(activeRows, 'active', place, { reference: REF })),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  it('handles an empty list and a list of one', () => {
    for (const sort of [
      'joined',
      'newest',
      'name',
      'topics',
      'active',
    ] as const) {
      expect(sortRows([], sort, place)).toEqual([]);
      expect(ids(sortRows([row(9, 'Only')], sort, place))).toEqual([9]);
    }
  });
});

describe('sortDiscovery', () => {
  // Monday 26 October, 23:00 in Perth. Today started at 00:00 that day.
  const NOW = perth('2026-10-26T23:00');
  const REF = startOfToday(NOW);
  const rows = [row(1, 'Ada'), row(2, 'Bea'), row(3, 'Cy')];

  /** The viewer's topics, and the stored last sign-in of each of the three people. */
  function stubReads(
    lastLogin: [bigint, Date | null][] = [
      [101n, new Date(REF.getTime() - 2 * DAY)],
      [102n, null],
      [103n, new Date(REF.getTime() - 10 * DAY)],
    ],
  ) {
    const own = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([{ user_id: 50n, expertise: 'Economics' }] as never);
    const people = jest.spyOn(prisma.users, 'findMany').mockResolvedValue(
      lastLogin.map(([userid, lastloginat]) => ({
        userid,
        lastloginat,
      })) as never,
    );
    const audit = jest.spyOn(prisma.audit_entries, 'groupBy');
    return { own, people, audit };
  }

  /**
   * Stands in for the database's grouped query over a list of sign-in entries:
   * it honours the action, the people asked about and the time window, so a
   * test can see what the query leaves out.
   */
  function auditEntries(entries: [bigint, Date][]) {
    type Args = {
      where: {
        action: string;
        actor_user_id: { in: bigint[] };
        occurred_at: { gte: Date; lt: Date };
      };
    };
    return jest.spyOn(prisma.audit_entries, 'groupBy').mockImplementation(((
      args: Args,
    ) => {
      const { where } = args;
      const latest = new Map<bigint, Date>();
      for (const [actor, at] of entries) {
        const inWindow =
          at.getTime() >= where.occurred_at.gte.getTime() &&
          at.getTime() < where.occurred_at.lt.getTime();
        if (
          where.action === 'user.signed_in' &&
          where.actor_user_id.in.includes(actor) &&
          inWindow &&
          (latest.get(actor)?.getTime() ?? -Infinity) < at.getTime()
        ) {
          latest.set(actor, at);
        }
      }
      return Promise.resolve(
        [...latest].map(([actor_user_id, occurred_at]) => ({
          actor_user_id,
          _max: { occurred_at },
        })),
      );
    }) as never);
  }

  it('reads nothing for joined, newest and name', async () => {
    const { own, people, audit } = stubReads();
    for (const sort of ['joined', 'newest', 'name'] as const) {
      await sortDiscovery(rows, sort, place, [], 'auth0|viewer');
    }
    expect(own).not.toHaveBeenCalled();
    expect(people).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('reads the viewer’s own topics, and only those, for topics', async () => {
    const { own, people, audit } = stubReads();
    const sorted = await sortDiscovery(
      rows,
      'topics',
      place,
      [
        { user_id: 101n, expertise: 'Marketing' },
        { user_id: 103n, expertise: 'Economics' },
      ],
      'auth0|viewer',
    );
    expect(ids(sorted)).toEqual([3, 1, 2]);
    expect(own).toHaveBeenCalledTimes(1);
    expect(own.mock.calls[0][0]).toEqual({
      where: { users: { is: { auth0Id: 'auth0|viewer' } } },
    });
    expect(people).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('is joined order for topics when nobody is signed in to ask', async () => {
    const { own } = stubReads();
    const sorted = await sortDiscovery(
      rows,
      'topics',
      place,
      [{ user_id: 103n, expertise: 'Economics' }],
      undefined,
    );
    expect(ids(sorted)).toEqual([1, 2, 3]);
    expect(own).not.toHaveBeenCalled();
  });

  describe('active', () => {
    it('asks for the recorded sign-ins in one grouped query, bounded to the days that matter and to before today, and only about the people listed', async () => {
      const { own, people, audit } = stubReads();
      await sortDiscovery(
        [...rows, row(4, 'No account', null, null)],
        'active',
        place,
        [],
        'auth0|viewer',
        NOW,
      );
      expect(audit).toHaveBeenCalledTimes(1);
      expect(audit.mock.calls[0][0]).toEqual({
        by: ['actor_user_id'],
        where: {
          action: 'user.signed_in',
          actor_user_id: { in: [101n, 102n, 103n] },
          occurred_at: {
            gte: new Date(REF.getTime() - 90 * DAY),
            lt: REF,
          },
        },
        _max: { occurred_at: true },
      });
      expect(people).toHaveBeenCalledTimes(1);
      expect(people.mock.calls[0][0]).toEqual({
        where: { userid: { in: [101n, 102n, 103n] } },
        select: { userid: true, lastloginat: true },
      });
      expect(own).not.toHaveBeenCalled();
    });

    it('falls back to the stored last sign-in for someone with no recorded one', async () => {
      stubReads();
      const sorted = await sortDiscovery(
        [...rows, row(4, 'No account', null, null)],
        'active',
        place,
        [],
        'auth0|viewer',
        NOW,
      );
      // Ada 2 days ago is band 1, Cy 10 days ago band 2, Bea never signed in, and no account goes after.
      expect(ids(sorted)).toEqual([1, 3, 2, 4]);
    });

    it('lets a recorded sign-in win over the stored one', async () => {
      // Cy's stored time is 10 days ago, but the trail says 60 days ago.
      stubReads();
      auditEntries([[103n, new Date(REF.getTime() - 60 * DAY)]]);
      const sorted = await sortDiscovery(rows, 'active', place, [], 'a', NOW);
      // Ada band 1, Cy band 3, Bea never.
      expect(ids(sorted)).toEqual([1, 3, 2]);
    });

    it('does not use a stored last sign-in from today: that person is in the last band until tomorrow', async () => {
      stubReads([
        [101n, new Date(REF.getTime() + 3 * 3_600_000)],
        [102n, new Date(REF.getTime() - 10 * DAY)],
        [103n, null],
      ]);
      const sorted = await sortDiscovery(rows, 'active', place, [], 'a', NOW);
      // Bea 10 days ago is band 2; Ada (today) and Cy (never) are band 4, in join order.
      expect(ids(sorted)).toEqual([2, 1, 3]);
    });

    it('does not move anyone when they sign in today, and moves them the next day', async () => {
      // Before today: Ada last signed in 3 days ago (band 1), Bea 60 days ago
      // (band 3), Cy 20 days ago (band 2).
      const before: [bigint, Date][] = [
        [101n, new Date(REF.getTime() - 3 * DAY)],
        [102n, new Date(REF.getTime() - 60 * DAY)],
        [103n, new Date(REF.getTime() - 20 * DAY)],
      ];
      stubReads([
        [101n, before[0][1]],
        [102n, before[1][1]],
        [103n, before[2][1]],
      ]);
      auditEntries(before);
      const quietDay = await sortDiscovery(rows, 'active', place, [], 'a', NOW);
      expect(ids(quietDay)).toEqual([1, 3, 2]);

      // Today the dormant Bea signs in, and so does Ada. The stored time
      // moves to now and a new entry is written, and neither changes a position.
      const signedInToday = new Date(REF.getTime() + 20 * 3_600_000);
      jest.restoreAllMocks();
      stubReads([
        [101n, signedInToday],
        [102n, signedInToday],
        [103n, before[2][1]],
      ]);
      auditEntries([...before, [101n, signedInToday], [102n, signedInToday]]);
      const lateToday = new Date(REF.getTime() + 23 * 3_600_000);
      const sameDay = await sortDiscovery(
        rows,
        'active',
        place,
        [],
        'a',
        lateToday,
      );
      expect(ids(sameDay)).toEqual(ids(quietDay));

      // From the next day it counts: Bea is now in band 1, with Ada, and moves
      // ahead of Cy.
      const tomorrow = new Date(REF.getTime() + DAY + 3_600_000);
      const nextDay = await sortDiscovery(
        rows,
        'active',
        place,
        [],
        'a',
        tomorrow,
      );
      expect(ids(nextDay)).toEqual([1, 2, 3]);
    });
  });

  it('returns the rows untouched, and reads nothing, for fewer than two', async () => {
    const { own, people, audit } = stubReads();
    const one = [row(1, 'Ada')];
    expect(await sortDiscovery(one, 'active', place, [], 'a')).toBe(one);
    expect(await sortDiscovery(one, 'topics', place, [], 'a')).toBe(one);
    expect(own).not.toHaveBeenCalled();
    expect(people).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
