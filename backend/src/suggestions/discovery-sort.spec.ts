import { prisma } from '../prisma';
import {
  DISCOVERY_SORTS,
  activityBand,
  isManualSort,
  sortDiscovery,
  sortRows,
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
const topicsOf = (entries: [number, string[]][]) =>
  new Map(entries.map(([user, topics]) => [BigInt(user), topics]));
const signedInAt = (entries: [number, string | null][]) =>
  new Map(
    entries.map(([user, when]) => [
      BigInt(user),
      when === null ? null : new Date(when),
    ]),
  );

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

describe('activityBand', () => {
  const NOW = new Date('2026-10-26T15:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('is 1 for a sign-in within the last 7 days, today included', () => {
    expect(activityBand(at('2026-10-26T14:59:00Z'), NOW)).toBe(1);
    expect(activityBand(at('2026-10-20T00:00:00Z'), NOW)).toBe(1);
    expect(activityBand(at('2026-10-19T23:59:59Z'), NOW)).toBe(1);
  });

  it('is 2 from 8 to 30 days, 3 from 31 to 90 days, and 4 beyond that', () => {
    expect(activityBand(at('2026-10-18T23:59:59Z'), NOW)).toBe(2);
    expect(activityBand(at('2026-09-26T00:00:00Z'), NOW)).toBe(2);
    expect(activityBand(at('2026-09-25T23:59:59Z'), NOW)).toBe(3);
    expect(activityBand(at('2026-07-28T00:00:00Z'), NOW)).toBe(3);
    expect(activityBand(at('2026-07-27T23:59:59Z'), NOW)).toBe(4);
    expect(activityBand(at('2020-01-01T00:00:00Z'), NOW)).toBe(4);
  });

  it('is 4 for someone who has never signed in, and for a date it cannot read', () => {
    expect(activityBand(null, NOW)).toBe(4);
    expect(activityBand(undefined, NOW)).toBe(4);
    expect(activityBand(new Date('not a date'), NOW)).toBe(4);
  });

  it('puts a time in the future, from clock skew, in the best band rather than the worst', () => {
    expect(activityBand(at('2026-10-27T01:00:00Z'), NOW)).toBe(1);
  });

  it('counts whole calendar days, so the band cannot change in the middle of a day', () => {
    // Someone who signed in at 00:01 and someone at 23:59 on the same day are
    // always in the same band, whichever minute the list is read in.
    const early = at('2026-10-19T00:01:00Z');
    const late = at('2026-10-19T23:59:00Z');
    for (const minute of ['00:00:00', '06:30:00', '12:00:00', '23:59:59']) {
      const reading = new Date(`2026-10-26T${minute}Z`);
      expect(activityBand(early, reading)).toBe(activityBand(late, reading));
    }
    // And it moves on at midnight, not 7 days after the minute of the sign-in.
    expect(activityBand(late, new Date('2026-10-26T23:59:59Z'))).toBe(1);
    expect(activityBand(late, new Date('2026-10-27T00:00:00Z'))).toBe(2);
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
    // Counted from a fixed moment, so every case below is the same on any day.
    const NOW = new Date('2026-10-26T15:00:00Z');
    const ago = (days: number, time = '12:00:00') => {
      const day = new Date(NOW.getTime() - days * 86_400_000);
      return `${day.toISOString().slice(0, 10)}T${time}Z`;
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
    const lastSignIn = signedInAt([
      [101, null],
      [102, ago(60)],
      [103, ago(2)],
      [104, ago(61)],
      [106, null],
      [107, ago(20)],
      [108, ago(200)],
    ]);

    it('puts the most recent band first, and the longest ago or never last', () => {
      expect(
        ids(sortRows(activeRows, 'active', place, { lastSignIn, now: NOW })),
      ).toEqual([3, 7, 2, 4, 1, 5, 6, 8]);
    });

    it('keeps the order people joined in inside a band, so the exact time cannot be read from the order', () => {
      // All signed in within the same week, at different times. The one who
      // signed in last (row 3, a minute ago) is not placed first.
      const sameWeek = [row(1, 'A'), row(2, 'B'), row(3, 'C'), row(4, 'D')];
      const times = signedInAt([
        [101, ago(6, '09:00:00')],
        [102, ago(0, '14:59:00')],
        [103, ago(3, '23:59:59')],
        [104, ago(1, '00:00:00')],
      ]);
      expect(
        ids(
          sortRows(sameWeek, 'active', place, { lastSignIn: times, now: NOW }),
        ),
      ).toEqual([1, 2, 3, 4]);

      // Reversing who signed in when changes nothing.
      const reversed = signedInAt([
        [101, ago(0, '14:59:00')],
        [102, ago(6, '09:00:00')],
        [103, ago(1, '00:00:00')],
        [104, ago(3, '23:59:59')],
      ]);
      expect(
        ids(
          sortRows(sameWeek, 'active', place, {
            lastSignIn: reversed,
            now: NOW,
          }),
        ),
      ).toEqual([1, 2, 3, 4]);
    });

    it('does the same inside the month and the three-month bands', () => {
      const rowsInBands = [row(1, 'A'), row(2, 'B'), row(3, 'C'), row(4, 'D')];
      const times = signedInAt([
        [101, ago(29)],
        [102, ago(10)],
        [103, ago(89)],
        [104, ago(31)],
      ]);
      // 2 and 1 are in the month band (join order 1, 2); 4 and 3 are in the three-month band (join order 3, 4).
      expect(
        ids(
          sortRows(rowsInBands, 'active', place, {
            lastSignIn: times,
            now: NOW,
          }),
        ),
      ).toEqual([1, 2, 3, 4]);
    });

    it('is plain joined order when nobody has a sign-in time', () => {
      expect(ids(sortRows(activeRows, 'active', place, { now: NOW }))).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
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
  const NOW = new Date('2026-10-26T15:00:00Z');
  const DAY = 86_400_000;
  const rows = [row(1, 'Ada'), row(2, 'Bea'), row(3, 'Cy')];

  function stubReads() {
    const own = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([{ user_id: 50n, expertise: 'Economics' }] as never);
    const people = jest.spyOn(prisma.users, 'findMany').mockResolvedValue([
      { userid: 101n, lastloginat: new Date(NOW.getTime() - 2 * DAY) },
      { userid: 102n, lastloginat: null },
      { userid: 103n, lastloginat: new Date(NOW.getTime() - 10 * DAY) },
    ] as never);
    return { own, people };
  }

  it('reads nothing for joined, newest and name', async () => {
    const { own, people } = stubReads();
    for (const sort of ['joined', 'newest', 'name'] as const) {
      await sortDiscovery(rows, sort, place, [], 'auth0|viewer');
    }
    expect(own).not.toHaveBeenCalled();
    expect(people).not.toHaveBeenCalled();
  });

  it('reads the viewer’s own topics, and only those, for topics', async () => {
    const { own, people } = stubReads();
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

  it('reads the sign-in times in one query for active, and asks only about the people listed', async () => {
    const { own, people } = stubReads();
    const sorted = await sortDiscovery(
      [...rows, row(4, 'No account', null, null)],
      'active',
      place,
      [],
      'auth0|viewer',
      NOW,
    );
    // Cy signed in 10 days ago and Ada 2 days ago, so Ada's band is the better one;
    // Bea never signed in, and the one with no account goes after.
    expect(ids(sorted)).toEqual([1, 3, 2, 4]);
    expect(people).toHaveBeenCalledTimes(1);
    expect(people.mock.calls[0][0]).toEqual({
      where: { userid: { in: [101n, 102n, 103n] } },
      select: { userid: true, lastloginat: true },
    });
    expect(own).not.toHaveBeenCalled();
  });

  it('returns the rows untouched, and reads nothing, for fewer than two', async () => {
    const { own, people } = stubReads();
    const one = [row(1, 'Ada')];
    expect(await sortDiscovery(one, 'active', place, [], 'a')).toBe(one);
    expect(await sortDiscovery(one, 'topics', place, [], 'a')).toBe(one);
    expect(own).not.toHaveBeenCalled();
    expect(people).not.toHaveBeenCalled();
  });
});
