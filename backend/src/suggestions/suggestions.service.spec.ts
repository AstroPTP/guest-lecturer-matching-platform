// cspell:ignore deletedat
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../prisma';
import type { SuggestionsQueryDto } from './dto/suggestions-query.dto';
import { SuggestionsService } from './suggestions.service';

/**
 * The service against a small in-memory world.
 *
 * Each table is a plain array, and the Prisma double's reads are pointed at
 * them with just enough of the `where` clauses the service sends (id lists,
 * date, status) to prove those clauses select the right rows. Nothing here
 * touches a database; running the real queries is the smoke test's job.
 */

const COORDINATOR = 5n;
const NOW = new Date('2026-10-22T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

// 2026-10-28 is a Wednesday.
const query: SuggestionsQueryDto = {
  date: '2026-10-28',
  startTime: '10:00',
  endTime: '11:00',
  topics: ['Economics', 'Taxation Law'],
};

interface LecturerSpec {
  name: string;
  topics?: string[];
  days?: string[];
  from?: string | null;
  to?: string | null;
  consent?: boolean | null;
  deleted?: boolean;
  accepted?: Date[];
  completed?: number;
  broken?: number;
  hasProfileName?: boolean;
}

interface World {
  guests: unknown[];
  dismissals: { guest_id: bigint }[];
  ownMatches: {
    guest_id: bigint;
    status: string | null;
    requested_by: string | null;
  }[];
  accepted: { guest_id: bigint; requested_at: Date; updated_at: Date | null }[];
  availability: Record<string, unknown>[];
  expertise: { user_id: bigint; expertise: string }[];
  events: {
    date: string;
    status: string;
    start_time: string;
    end_time: string;
    responded_at: Date | null;
    match: { guest_id: bigint };
  }[];
}

function clock(value: string | null | undefined): Date | null {
  return value ? new Date(`1970-01-01T${value}:00Z`) : null;
}

/** guest ids run 1, 2, 3 in the order given; user ids are 100 more. */
function build(specs: LecturerSpec[]): World & { ids: Record<string, bigint> } {
  const world: World & { ids: Record<string, bigint> } = {
    guests: [],
    dismissals: [],
    ownMatches: [],
    accepted: [],
    availability: [],
    expertise: [],
    events: [],
    ids: {},
  };

  specs.forEach((spec, index) => {
    const guestId = BigInt(index + 1);
    const userId = guestId + 100n;
    world.ids[spec.name] = guestId;

    world.guests.push({
      guest_id: guestId,
      user_id: userId,
      first_name: spec.hasProfileName === false ? null : spec.name,
      last_name: 'Tester',
      field: 'Law',
      role: 'Partner',
      profile_image_id: null,
      users: {
        userid: userId,
        deletedat: spec.deleted ? NOW : null,
        consentstate: spec.consent === undefined ? true : spec.consent,
      },
    });

    const days = spec.days ?? ['wednesday'];
    const hasWindow = spec.from !== null;
    world.availability.push({
      user_id: userId,
      monday: days.includes('monday'),
      tuesday: days.includes('tuesday'),
      wednesday: days.includes('wednesday'),
      thursday: days.includes('thursday'),
      friday: days.includes('friday'),
      available_from: hasWindow ? clock(spec.from ?? '09:00') : null,
      available_to: hasWindow ? clock(spec.to ?? '17:00') : null,
    });

    for (const topic of spec.topics ?? ['Economics']) {
      world.expertise.push({ user_id: userId, expertise: topic });
    }
    for (const when of spec.accepted ?? []) {
      world.accepted.push({
        guest_id: guestId,
        requested_at: when,
        updated_at: when,
      });
    }
    for (let i = 0; i < (spec.completed ?? 0); i += 1) {
      world.events.push({
        date: '2026-03-01',
        status: 'completed',
        start_time: '09:00',
        end_time: '10:00',
        responded_at: NOW,
        match: { guest_id: guestId },
      });
    }
    for (let i = 0; i < (spec.broken ?? 0); i += 1) {
      world.events.push({
        date: '2026-04-01',
        status: 'cancelled',
        start_time: '09:00',
        end_time: '10:00',
        responded_at: NOW,
        match: { guest_id: guestId },
      });
    }
  });

  return world;
}

type Where = Record<string, unknown>;
const idList = (value: unknown): bigint[] =>
  (value as { in?: bigint[] } | undefined)?.in ?? [];

function install(world: World) {
  jest
    .spyOn(prisma.users, 'findUnique')
    .mockResolvedValue({ userid: 1n } as never);
  jest
    .spyOn(prisma.coordinators, 'findUnique')
    .mockResolvedValue({ coordinator_id: COORDINATOR } as never);
  jest
    .spyOn(prisma.guests, 'findMany')
    .mockResolvedValue(world.guests as never);
  jest
    .spyOn(prisma.dismissals, 'findMany')
    .mockResolvedValue(world.dismissals as never);

  jest.spyOn(prisma.match_requests, 'findMany').mockImplementation(((args: {
    where: Where;
  }) => {
    // The coordinator's own rows are asked for by coordinator_id; the rows
    // that count sessions are asked for by guest ids and ACCEPTED.
    if (args.where.coordinator_id !== undefined) {
      return Promise.resolve(world.ownMatches);
    }
    const wanted = idList(args.where.guest_id);
    return Promise.resolve(
      args.where.status === 'ACCEPTED'
        ? world.accepted.filter((row) => wanted.includes(row.guest_id))
        : [],
    );
  }) as never);

  jest.spyOn(prisma.availability, 'findMany').mockImplementation(((args: {
    where: Where;
  }) => {
    const wanted = idList(args.where.user_id);
    return Promise.resolve(
      world.availability.filter((row) =>
        wanted.includes(row.user_id as bigint),
      ),
    );
  }) as never);

  jest.spyOn(prisma.user_expertise, 'findMany').mockImplementation(((args: {
    where: Where;
  }) => {
    const wanted = idList(args.where.user_id);
    return Promise.resolve(
      world.expertise.filter((row) => wanted.includes(row.user_id)),
    );
  }) as never);

  jest.spyOn(prisma.events, 'findMany').mockImplementation(((args: {
    where: Where;
  }) => {
    const wanted = idList((args.where.match as Where).guest_id);
    const inScope = world.events.filter((row) =>
      wanted.includes(row.match.guest_id),
    );
    // The clash read names a date and the states that hold time; the record
    // read names completed sessions and answered, then cancelled, ones.
    if (typeof args.where.date === 'string') {
      const holding = (args.where.status as { in: string[] }).in;
      return Promise.resolve(
        inScope.filter(
          (row) => row.date === args.where.date && holding.includes(row.status),
        ),
      );
    }
    return Promise.resolve(
      inScope.filter(
        (row) =>
          row.status === 'completed' ||
          (row.status === 'cancelled' && row.responded_at !== null),
      ),
    );
  }) as never);
}

describe('SuggestionsService', () => {
  let service: SuggestionsService;
  const userId = 'auth0|coordinator-1';

  beforeEach(() => {
    service = new SuggestionsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const names = async (q: SuggestionsQueryDto = query) =>
    (await service.suggest(userId, q, NOW)).suggestions.map((s) =>
      s.name.replace(' Tester', ''),
    );

  describe('the caller', () => {
    it('refuses a user with no coordinator profile', async () => {
      install(build([]));
      jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValue(null);
      await expect(service.suggest(userId, query, NOW)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a token whose user row does not exist, without creating one', async () => {
      install(build([]));
      jest.spyOn(prisma.users, 'findUnique').mockResolvedValue(null);
      const upsert = jest.spyOn(prisma.users, 'upsert');
      const create = jest.spyOn(prisma.users, 'create');

      await expect(service.suggest(userId, query, NOW)).rejects.toThrow(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('only ever reads: it writes nothing', async () => {
      install(build([{ name: 'Ada' }]));
      const writes = [
        jest.spyOn(prisma.match_requests, 'create'),
        jest.spyOn(prisma.match_requests, 'update'),
        jest.spyOn(prisma.match_requests, 'upsert'),
        jest.spyOn(prisma.events, 'create'),
        jest.spyOn(prisma.events, 'update'),
        jest.spyOn(prisma.dismissals, 'create'),
      ];
      await service.suggest(userId, query, NOW);
      for (const write of writes) {
        expect(write).not.toHaveBeenCalled();
      }
    });
  });

  describe('the session', () => {
    it.each([
      ['an impossible date', { date: '2026-02-30' }],
      ['an end before the start', { startTime: '11:00', endTime: '10:00' }],
      ['a zero-length session', { startTime: '10:00', endTime: '10:00' }],
    ])('rejects %s with a 400', async (_label, override) => {
      install(build([{ name: 'Ada' }]));
      await expect(
        service.suggest(userId, { ...query, ...override }, NOW),
      ).rejects.toThrow(BadRequestException);
    });

    it('echoes the session it answered for', async () => {
      install(build([{ name: 'Ada' }]));
      const result = await service.suggest(userId, query, NOW);
      expect(result.session).toEqual({
        date: '2026-10-28',
        startTime: '10:00',
        endTime: '11:00',
        topics: ['Economics', 'Taxation Law'],
      });
    });
  });

  describe('rule 1, eligible', () => {
    it('leaves out lecturers who have not consented, are deactivated or have no name', async () => {
      install(
        build([
          { name: 'Ada' },
          { name: 'NoConsent', consent: false },
          { name: 'Unknown', consent: null },
          { name: 'Deactivated', deleted: true },
          { name: 'Nameless', hasProfileName: false },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      expect(result.suggestions.map((s) => s.guestId)).toEqual(['1']);
      expect(result.stages.considered).toBe(5);
      expect(result.stages.eligible).toBe(1);
    });

    it('leaves out a lecturer the coordinator dismissed', async () => {
      const world = build([{ name: 'Ada' }, { name: 'Ben' }]);
      world.dismissals.push({ guest_id: world.ids.Ben });
      install(world);
      expect(await names()).toEqual(['Ada']);
    });

    it('asks only for dismissals the coordinator made themselves', async () => {
      install(build([{ name: 'Ada' }]));
      const dismissals = jest.spyOn(prisma.dismissals, 'findMany');
      await service.suggest(userId, query, NOW);
      expect(dismissals).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coordinator_id: COORDINATOR, dismissed_by: 'coordinator' },
        }),
      );
    });

    it('leaves out a lecturer the coordinator has unmatched, but keeps one still pending', async () => {
      const world = build([
        { name: 'Ada' },
        { name: 'Ben' },
        { name: 'Cleo' },
        { name: 'Dev' },
      ]);
      world.ownMatches.push(
        {
          guest_id: world.ids.Ben,
          status: 'UNMATCHED',
          requested_by: 'coordinator',
        },
        { guest_id: world.ids.Cleo, status: 'REJECTED', requested_by: 'guest' },
        {
          guest_id: world.ids.Dev,
          status: 'PENDING',
          requested_by: 'coordinator',
        },
      );
      install(world);
      expect((await names()).sort()).toEqual(['Ada', 'Dev']);
    });
  });

  describe('rule 2, available for the session', () => {
    it('keeps only lecturers whose window holds the whole session on that weekday', async () => {
      install(
        build([
          { name: 'Fits' },
          { name: 'WrongDay', days: ['monday', 'friday'] },
          { name: 'EndsAsItStarts', from: '08:00', to: '10:00' },
          { name: 'StartsAsItEnds', from: '11:00', to: '17:00' },
          { name: 'LeavesEarly', from: '09:00', to: '10:30' },
          { name: 'NoHours', from: null },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      expect(result.suggestions.map((s) => s.name)).toEqual(['Fits Tester']);
      expect(result.stages.eligible).toBe(6);
      expect(result.stages.available).toBe(1);
    });

    it('finds nobody on a weekend, which the weekly table cannot hold', async () => {
      install(
        build([{ name: 'Ada', days: ['monday', 'wednesday', 'friday'] }]),
      );
      const result = await service.suggest(
        userId,
        { ...query, date: '2026-10-31' },
        NOW,
      );
      expect(result.stages.available).toBe(0);
      expect(result.suggestions).toEqual([]);
    });

    it('leaves out a lecturer who already has an open event that overlaps', async () => {
      const world = build([{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cleo' }]);
      const event = (
        guest: bigint,
        status: string,
        start: string,
        end: string,
        date = '2026-10-28',
      ) => ({
        date,
        status,
        start_time: start,
        end_time: end,
        responded_at: null,
        match: { guest_id: guest },
      });
      world.events.push(
        event(world.ids.Ada, 'accepted', '10:30', '12:00'),
        event(world.ids.Ben, 'invitation-sent', '09:00', '10:30'),
        // Next to the session, or on another day, or no longer holding time.
        event(world.ids.Cleo, 'accepted', '11:00', '12:00'),
      );
      world.events.push(
        event(world.ids.Cleo, 'accepted', '10:00', '11:00', '2026-10-29'),
        event(world.ids.Cleo, 'declined', '10:00', '11:00'),
        event(world.ids.Cleo, 'cancelled', '10:00', '11:00'),
      );
      install(world);
      expect(await names()).toEqual(['Cleo']);
    });

    it('ignores an event whose times it cannot read rather than failing', async () => {
      const world = build([{ name: 'Ada' }]);
      world.events.push({
        date: '2026-10-28',
        status: 'accepted',
        start_time: 'after lunch',
        end_time: 'late',
        responded_at: null,
        match: { guest_id: world.ids.Ada },
      });
      install(world);
      expect(await names()).toEqual(['Ada']);
    });
  });

  describe('rule 3, shares a topic', () => {
    it('leaves out a lecturer who shares none of the requested topics', async () => {
      install(
        build([
          { name: 'Match', topics: ['economics'] },
          { name: 'Other', topics: ['Accounting', 'Marketing Strategy'] },
          { name: 'Blank', topics: [] },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      expect(result.suggestions.map((s) => s.name)).toEqual(['Match Tester']);
      expect(result.stages.available).toBe(3);
      expect(result.stages.sharesTopic).toBe(1);
    });

    it('reports which requested topics each lecturer covers, in their own spelling', async () => {
      install(
        build([
          { name: 'Ada', topics: ['ECONOMICS', 'Taxation Law', 'Accounting'] },
        ]),
      );
      const [first] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(first.sharedTopics).toEqual(['ECONOMICS', 'Taxation Law']);
    });
  });

  describe('rule 4, reliable', () => {
    it('leaves out a lecturer whose accepted sessions keep being cancelled', async () => {
      install(
        build([
          { name: 'Steady', completed: 3 },
          { name: 'New' },
          { name: 'Flaky', broken: 2 },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      expect(
        result.suggestions.map((s) => s.name.replace(' Tester', '')).sort(),
      ).toEqual(['New', 'Steady']);
      expect(result.stages.sharesTopic).toBe(3);
      expect(result.stages.reliable).toBe(2);
    });

    it('lets a record of delivering outweigh one cancellation', async () => {
      install(build([{ name: 'Mixed', completed: 4, broken: 1 }]));
      expect(await names()).toEqual(['Mixed']);
    });

    it('does not count a cancelled invitation the lecturer never answered', async () => {
      const world = build([{ name: 'Ada' }]);
      world.events.push(
        {
          date: '2026-05-01',
          status: 'cancelled',
          start_time: '09:00',
          end_time: '10:00',
          responded_at: null,
          match: { guest_id: world.ids.Ada },
        },
        {
          date: '2026-05-02',
          status: 'cancelled',
          start_time: '09:00',
          end_time: '10:00',
          responded_at: null,
          match: { guest_id: world.ids.Ada },
        },
      );
      install(world);
      const [first] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(first.reliability).toBe(50);
    });

    it('keeps reliability out of the ordering', async () => {
      install(build([{ name: 'Proven', completed: 20 }, { name: 'New' }]));
      const result = await service.suggest(userId, query, NOW);
      // Same topics, same (empty) history of matches: the scores tie, so the
      // record of reliability must not have separated them.
      const [proven, fresh] = ['Proven', 'New'].map(
        (name) => result.suggestions.find((s) => s.name === `${name} Tester`)!,
      );
      expect(proven.score).toBe(fresh.score);
      expect(proven.reliability).toBeGreaterThan(fresh.reliability);
    });
  });

  describe('the order', () => {
    it('puts the better topic fit first', async () => {
      install(
        build([
          {
            name: 'Partial',
            topics: ['Economics', 'Accounting', 'Marketing Strategy'],
          },
          { name: 'Exact', topics: ['Economics', 'Taxation Law'] },
        ]),
      );
      expect(await names()).toEqual(['Exact', 'Partial']);
    });

    it('puts a lecturer untouched for a year above one engaged yesterday', async () => {
      // The defect this guards against: a recency term that rewarded being
      // used recently put the busiest lecturer first.
      install(
        build([
          { name: 'Yesterday', accepted: [new Date(NOW.getTime() - DAY)] },
          { name: 'LastYear', accepted: [new Date(NOW.getTime() - 365 * DAY)] },
        ]),
      );
      expect(await names()).toEqual(['LastYear', 'Yesterday']);
    });

    it('puts a lecturer with fewer sessions above one with more, other things equal', async () => {
      const longAgo = new Date(NOW.getTime() - 200 * DAY);
      install(
        build([
          { name: 'Busy', accepted: [longAgo, longAgo, longAgo, longAgo] },
          { name: 'Quiet', accepted: [longAgo] },
        ]),
      );
      expect(await names()).toEqual(['Quiet', 'Busy']);
    });

    it('never hides a very busy lecturer, they only rank lower', async () => {
      const recent = new Date(NOW.getTime() - 2 * DAY);
      install(
        build([
          {
            name: 'Popular',
            accepted: Array.from({ length: 40 }, () => recent),
          },
          { name: 'Fresh1' },
          { name: 'Fresh2' },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      expect(
        result.suggestions.map((s) => s.name.replace(' Tester', '')),
      ).toEqual(expect.arrayContaining(['Popular', 'Fresh1', 'Fresh2']));
      expect(result.suggestions.at(-1)?.name).toBe('Popular Tester');
      expect(result.suggestions.at(-1)?.sessionsSoFar).toBe(40);
      expect(result.stages.reliable).toBe(3);
    });

    it('still ranks a busy lecturer above a fresh one who is a poor topic fit', async () => {
      install(
        build([
          {
            name: 'BusyButExact',
            topics: ['Economics', 'Taxation Law'],
            accepted: [
              new Date(NOW.getTime() - 5 * DAY),
              new Date(NOW.getTime() - 9 * DAY),
            ],
          },
          {
            name: 'FreshButThin',
            topics: ['Economics', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
          },
        ]),
      );
      expect(await names()).toEqual(['BusyButExact', 'FreshButThin']);
    });

    it('breaks a tie the same way every time', async () => {
      install(build([{ name: 'B' }, { name: 'A' }, { name: 'C' }]));
      const first = await names();
      const second = await names();
      expect(first).toEqual(second);
      // Equal in every respect: lowest id first, which is the order given.
      expect(first).toEqual(['B', 'A', 'C']);
    });

    it("counts a lecturer's sessions with every coordinator, and uses the latest", async () => {
      const older = new Date('2026-01-10T00:00:00.000Z');
      const newer = new Date('2026-06-10T00:00:00.000Z');
      install(build([{ name: 'Ada', accepted: [older, newer] }]));
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada.sessionsSoFar).toBe(2);
      expect(ada.lastSessionAt).toBe(newer.toISOString());
    });

    it('falls back to requested_at when an old match has no updated_at', async () => {
      const world = build([{ name: 'Ada' }]);
      const requestedAt = new Date('2026-02-01T00:00:00.000Z');
      world.accepted.push({
        guest_id: world.ids.Ada,
        requested_at: requestedAt,
        updated_at: null,
      });
      install(world);
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada.lastSessionAt).toBe(requestedAt.toISOString());
    });

    it('counts only ACCEPTED matches as sessions', async () => {
      install(build([{ name: 'Ada' }]));
      const spy = jest.spyOn(prisma.match_requests, 'findMany');
      await service.suggest(userId, query, NOW);
      const wheres = spy.mock.calls.map(([args]) => args?.where);
      expect(wheres).toContainEqual({
        guest_id: { in: [1n] },
        status: 'ACCEPTED',
      });
    });
  });

  describe('the result', () => {
    it('reports a cumulative count after each rule', async () => {
      install(
        build([
          { name: 'Good' },
          { name: 'Good2', completed: 2 },
          { name: 'NoConsent', consent: false },
          { name: 'WrongDay', days: ['friday'] },
          { name: 'WrongTopic', topics: ['Accounting'] },
          { name: 'Flaky', broken: 2 },
        ]),
      );
      const { stages } = await service.suggest(userId, query, NOW);
      expect(stages).toEqual({
        considered: 6,
        eligible: 5,
        available: 4,
        sharesTopic: 3,
        reliable: 2,
      });
    });

    it('applies the limit to the list but not to the counts', async () => {
      install(build(Array.from({ length: 6 }, (_, i) => ({ name: `L${i}` }))));
      const result = await service.suggest(userId, { ...query, limit: 2 }, NOW);
      expect(result.suggestions).toHaveLength(2);
      expect(result.stages.reliable).toBe(6);
    });

    it('shows ten by default', async () => {
      install(build(Array.from({ length: 12 }, (_, i) => ({ name: `L${i}` }))));
      const result = await service.suggest(userId, query, NOW);
      expect(result.suggestions).toHaveLength(10);
    });

    it("describes the coordinator's standing with each lecturer", async () => {
      const world = build([
        { name: 'Stranger' },
        { name: 'Asked' },
        { name: 'AskedMe' },
        { name: 'Matched' },
        { name: 'OldRow' },
      ]);
      world.ownMatches.push(
        {
          guest_id: world.ids.Asked,
          status: 'PENDING',
          requested_by: 'coordinator',
        },
        {
          guest_id: world.ids.AskedMe,
          status: 'PENDING',
          requested_by: 'guest',
        },
        {
          guest_id: world.ids.Matched,
          status: 'ACCEPTED',
          requested_by: 'guest',
        },
        // Rows from before requested_by existed were sent by coordinators.
        { guest_id: world.ids.OldRow, status: null, requested_by: null },
      );
      install(world);

      const result = await service.suggest(userId, query, NOW);
      const status = Object.fromEntries(
        result.suggestions.map((s) => [
          s.name.replace(' Tester', ''),
          s.matchStatus,
        ]),
      );
      expect(status).toEqual({
        Stranger: 'none',
        Asked: 'interest-sent',
        AskedMe: 'interest-received',
        Matched: 'matched',
        OldRow: 'interest-sent',
      });
    });

    it('gives the score and its three parts as percentages', async () => {
      const lastMatched = new Date(NOW.getTime() - 90 * DAY);
      install(
        build([
          {
            name: 'Ada',
            topics: ['Economics', 'Taxation Law'],
            accepted: [lastMatched],
          },
        ]),
      );
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada).toMatchObject({
        guestId: '1',
        name: 'Ada Tester',
        field: 'Law',
        role: 'Partner',
        photoUrl: '',
        fit: 100,
        rotation: 50,
        exposure: 50,
        sessionsSoFar: 1,
        reliability: 50,
      });
      // 0.65 * 1 + 0.20 * 0.5 + 0.15 * 0.5 = 0.825
      expect(ada.score).toBe(82.5);
    });

    it('returns an empty list, not an error, when nobody qualifies', async () => {
      install(build([{ name: 'Ada', topics: ['Accounting'] }]));
      const result = await service.suggest(userId, query, NOW);
      expect(result.suggestions).toEqual([]);
      expect(result.stages).toEqual({
        considered: 1,
        eligible: 1,
        available: 1,
        sharesTopic: 0,
        reliable: 0,
      });
    });

    it('works with no lecturers at all', async () => {
      install(build([]));
      const result = await service.suggest(userId, query, NOW);
      expect(result.stages).toEqual({
        considered: 0,
        eligible: 0,
        available: 0,
        sharesTopic: 0,
        reliable: 0,
      });
    });
  });
});
