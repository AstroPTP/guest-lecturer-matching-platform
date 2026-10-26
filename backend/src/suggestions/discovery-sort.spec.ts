import { prisma } from '../prisma';
import {
  DISCOVERY_SORTS,
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
    const activeRows = [
      row(1, 'A'), // never signed in
      row(2, 'B'), // oldest sign-in
      row(3, 'C'), // newest sign-in
      row(4, 'D'), // same moment as B, joined later
      row(5, 'E', null, null), // no account
      row(6, 'F'), // never signed in, joined later than A
    ];
    const lastSignIn = signedInAt([
      [101, null],
      [102, '2026-09-01T00:00:00Z'],
      [103, '2026-10-20T00:00:00Z'],
      [104, '2026-09-01T00:00:00Z'],
      [106, null],
    ]);

    it('puts the most recent sign-in first, and never signed in last, ties by the order people joined', () => {
      expect(
        ids(sortRows(activeRows, 'active', place, { lastSignIn })),
      ).toEqual([3, 2, 4, 1, 5, 6]);
    });

    it('is plain joined order when nobody has a sign-in time', () => {
      expect(ids(sortRows(activeRows, 'active', place))).toEqual([
        1, 2, 3, 4, 5, 6,
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
  const rows = [row(1, 'Ada'), row(2, 'Bea'), row(3, 'Cy')];

  function stubReads() {
    const own = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([{ user_id: 50n, expertise: 'Economics' }] as never);
    const people = jest.spyOn(prisma.users, 'findMany').mockResolvedValue([
      { userid: 101n, lastloginat: new Date('2026-09-01T00:00:00Z') },
      { userid: 102n, lastloginat: null },
      { userid: 103n, lastloginat: new Date('2026-10-01T00:00:00Z') },
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
    );
    // Cy signed in last, then Ada, then Bea never did; no account goes after.
    expect(ids(sorted)).toEqual([3, 1, 2, 4]);
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
