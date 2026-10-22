// cspell:ignore deletedat
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as platformRules from '../admin/platform-rules';
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
  /** A name that is present but empty. */
  blankName?: boolean;
  /** Not yet approved by an administrator. */
  unapproved?: boolean;
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
  /** The signed-in coordinator is user 1. Their own topics. */
  coordinatorTopics: string[];
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
    coordinatorTopics: [],
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
      first_name:
        spec.hasProfileName === false ? null : spec.blankName ? '' : spec.name,
      approved_at: spec.unapproved ? null : NOW,
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

/**
 * Just enough of Prisma's `where` to run the shapes the service sends: AND, OR,
 * NOT, `{ not: x }`, `{ in: [...] }`, `{ notIn: [...] }`, `{ is: {...} }` on a
 * relation, and plain equality. Anything
 * else throws, so a new clause cannot slip past the fake unnoticed.
 */
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((inner) => matches(row, inner));
    }
    if (key === 'OR') {
      return (condition as Where[]).some((inner) => matches(row, inner));
    }
    if (key === 'NOT') {
      return !matches(row, condition as Where);
    }
    const value = row[key];
    if (condition !== null && typeof condition === 'object') {
      if ('is' in condition) {
        return (
          value !== null &&
          value !== undefined &&
          matches(value as Record<string, unknown>, condition.is as Where)
        );
      }
      if ('not' in condition) {
        return value !== condition.not;
      }
      // The visibility rule may also use in and notIn.
      if ('notIn' in condition) {
        return !(condition.notIn as unknown[]).includes(value);
      }
      if ('in' in condition) {
        return (condition.in as unknown[]).includes(value);
      }
      throw new Error(
        `the fake does not understand ${key}: ${JSON.stringify(condition)}`,
      );
    }
    return value === condition;
  });
}

function install(world: World) {
  jest
    .spyOn(prisma.users, 'findUnique')
    .mockResolvedValue({ userid: 1n } as never);
  jest
    .spyOn(prisma.coordinators, 'findUnique')
    .mockResolvedValue({ coordinator_id: COORDINATOR } as never);
  jest
    .spyOn(prisma.guests, 'findMany')
    .mockImplementation(((args: { where: Where }) =>
      Promise.resolve(
        world.guests.filter((row) =>
          matches(row as Record<string, unknown>, args.where),
        ),
      )) as never);
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
    // The coordinator's own topics are asked for by a single user id; the
    // lecturers' by a list.
    if (typeof args.where.user_id === 'bigint') {
      return Promise.resolve(
        world.coordinatorTopics.map((expertise) => ({
          user_id: 1n,
          expertise,
        })),
      );
    }
    const wanted = idList(args.where.user_id);
    return Promise.resolve(
      world.expertise.filter((row) => wanted.includes(row.user_id)),
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
    it('refuses a user with no coordinator profile, in the API error shape', async () => {
      install(build([]));
      jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValue(null);
      const failure = await service
        .suggest(userId, query, NOW)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ForbiddenException);
      expect((failure as ForbiddenException).getResponse()).toEqual({
        code: 'AUTHZ_INSUFFICIENT_ROLE',
        message: 'Complete your profile before asking for suggested speakers.',
      });
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
      ['a start time with no end time', { endTime: undefined }],
      ['an end time with no start time', { startTime: undefined }],
    ])('rejects %s with a 400', async (_label, override) => {
      install(build([{ name: 'Ada' }]));
      await expect(
        service.suggest(userId, { ...query, ...override }, NOW),
      ).rejects.toThrow(BadRequestException);
    });

    it('echoes what the search used', async () => {
      install(build([{ name: 'Ada' }]));
      const result = await service.suggest(userId, query, NOW);
      expect(result.session).toEqual({
        date: '2026-10-28',
        startTime: '10:00',
        endTime: '11:00',
        topics: ['Economics', 'Taxation Law'],
        topicsFrom: 'request',
      });
    });

    it('reports a null for anything it was not given', async () => {
      const world = build([{ name: 'Ada' }]);
      world.coordinatorTopics = ['Economics'];
      install(world);
      const result = await service.suggest(userId, {}, NOW);
      expect(result.session).toEqual({
        date: null,
        startTime: null,
        endTime: null,
        topics: ['Economics'],
        topicsFrom: 'profile',
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
      // Considered is who this coordinator may see, so a deactivated account
      // is not counted; eligible then needs consent and a name as well.
      expect(result.stages.considered).toBe(4);
      expect(result.stages.eligible).toBe(1);
    });

    it('leaves out a lecturer whose name is present but empty', async () => {
      install(build([{ name: 'Ada' }, { name: 'Blank', blankName: true }]));
      expect(await names()).toEqual(['Ada']);
    });

    it('pushes the account, consent and name checks into the query rather than reading everyone', async () => {
      install(build([{ name: 'Ada' }]));
      const read = jest.spyOn(prisma.guests, 'findMany');
      await service.suggest(userId, query, NOW);
      const candidates = read.mock.calls
        .map(([args]) => args?.where)
        .find((where) => JSON.stringify(where).includes('consentstate'));
      expect(JSON.stringify(candidates)).toContain('"consentstate":true');
      expect(JSON.stringify(candidates)).toContain('"deletedat":null');
      expect(JSON.stringify(candidates)).toContain('"first_name":{"not":null}');
    });

    describe("the platform's visibility rule", () => {
      afterEach(() => jest.restoreAllMocks());

      it("is the shared visibleGuestsWhere, called with the coordinator's own Auth0 id", async () => {
        const world = build([{ name: 'Ada' }, { name: 'Hidden' }]);
        (world.guests[1] as { field: string }).field = 'Hidden by the rule';
        install(world);
        const rule = jest
          .spyOn(platformRules, 'visibleGuestsWhere')
          .mockResolvedValue({ field: { not: 'Hidden by the rule' } });

        // Whatever the shared rule says is hidden stays hidden here.
        expect(await names()).toEqual(['Ada']);
        expect(rule).toHaveBeenCalledWith(userId);
      });

      it('leaves out an unapproved lecturer while approval is required', async () => {
        install(
          build([{ name: 'Approved' }, { name: 'Pending', unapproved: true }]),
        );
        jest
          .spyOn(prisma.admin_settings, 'upsert')
          .mockResolvedValue({ require_admin_approval: true } as never);

        const result = await service.suggest(userId, query, NOW);
        expect(result.suggestions.map((s) => s.name)).toEqual([
          'Approved Tester',
        ]);
        expect(result.stages.considered).toBe(1);
      });

      it('lists an unapproved lecturer when approval is not required', async () => {
        install(
          build([{ name: 'Approved' }, { name: 'Pending', unapproved: true }]),
        );
        jest
          .spyOn(prisma.admin_settings, 'upsert')
          .mockResolvedValue({ require_admin_approval: false } as never);

        expect(await names()).toEqual(['Approved', 'Pending']);
      });

      it("applies together with the coordinator's own checks", async () => {
        install(
          build([
            { name: 'Ok' },
            { name: 'PendingAndConsented', unapproved: true },
            { name: 'ApprovedNoConsent', consent: false },
          ]),
        );
        jest
          .spyOn(prisma.admin_settings, 'upsert')
          .mockResolvedValue({ require_admin_approval: true } as never);
        expect(await names()).toEqual(['Ok']);
      });
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
    it('keeps only lecturers whose hours hold the whole session on that weekday', async () => {
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

    it('removes everyone who has recorded a day on a weekend, which the table has no column for', async () => {
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

    describe('an unspecified requirement is not a clash', () => {
      const lecturers = [
        { name: 'Fits' },
        { name: 'WrongDay', days: ['monday', 'friday'] },
        { name: 'OutsideHours', from: '13:00', to: '17:00' },
        { name: 'NoHours', from: null },
        { name: 'NoDays', days: [] },
      ];
      const everyone = { topics: ['Economics'] };

      it('removes nobody when no date and no times are given', async () => {
        install(build(lecturers));
        const result = await service.suggest(userId, everyone, NOW);
        expect(result.stages.eligible).toBe(5);
        expect(result.stages.available).toBe(5);
        expect(result.suggestions).toHaveLength(5);
      });

      it('applies only the day check when only a date is given, and does not remove a lecturer with no hours', async () => {
        install(build(lecturers));
        const result = await service.suggest(
          userId,
          { ...everyone, date: '2026-10-28' },
          NOW,
        );
        expect(
          result.suggestions.map((s) => s.name.replace(' Tester', '')).sort(),
        ).toEqual(['Fits', 'NoDays', 'NoHours', 'OutsideHours']);
      });

      it('applies only the hours check when only times are given, and then removes a lecturer with no hours', async () => {
        install(build(lecturers));
        const result = await service.suggest(
          userId,
          { ...everyone, startTime: '10:00', endTime: '11:00' },
          NOW,
        );
        // WrongDay is kept because no day was asked for.
        expect(
          result.suggestions.map((s) => s.name.replace(' Tester', '')).sort(),
        ).toEqual(['Fits', 'NoDays', 'WrongDay']);
      });

      it('does not remove a lecturer who has recorded no days when a day is given', async () => {
        install(build([{ name: 'NoDays', days: [] }]));
        expect(await names({ ...everyone, date: '2026-10-31' })).toEqual([
          'NoDays',
        ]);
      });

      it('removes a lecturer with no availability row at all only when times are given', async () => {
        const world = build([{ name: 'Ghost' }]);
        world.availability = [];
        install(world);
        expect(await names(everyone)).toEqual(['Ghost']);
        expect(
          await names({ ...everyone, startTime: '10:00', endTime: '11:00' }),
        ).toEqual([]);
      });
    });

    describe("other coordinators' bookings", () => {
      const booking = (guest: bigint) => ({
        date: '2026-10-28',
        status: 'accepted',
        start_time: '10:00',
        end_time: '11:00',
        responded_at: null,
        match: { guest_id: guest },
      });

      it('are not consulted: a lecturer with an overlapping event is still listed, and events are never read', async () => {
        const world = build([{ name: 'Ada' }]);
        world.events.push(booking(world.ids.Ada));
        install(world);
        const read = jest.spyOn(prisma.events, 'findMany');

        expect(await names()).toEqual(['Ada']);
        expect(read).not.toHaveBeenCalled();
      });

      it('cannot be probed: the same search with and without a booking gives the same answer', async () => {
        const free = build([{ name: 'Ada' }]);
        install(free);
        const without = await service.suggest(userId, query, NOW);
        jest.restoreAllMocks();

        const booked = build([{ name: 'Ada' }]);
        booked.events.push(booking(booked.ids.Ada));
        install(booked);
        const withBooking = await service.suggest(userId, query, NOW);

        expect(withBooking).toEqual(without);
      });
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

    describe('with no topics given', () => {
      it("uses the coordinator's own expertise", async () => {
        const world = build([
          { name: 'Econ', topics: ['Economics'] },
          { name: 'Law', topics: ['Corporate Law'] },
        ]);
        world.coordinatorTopics = ['Economics', 'Taxation Law'];
        install(world);

        const result = await service.suggest(userId, {}, NOW);
        expect(result.session.topicsFrom).toBe('profile');
        expect(result.session.topics).toEqual(['Economics', 'Taxation Law']);
        expect(result.suggestions.map((s) => s.name)).toEqual(['Econ Tester']);
      });

      it('treats an empty topics list the same as none', async () => {
        const world = build([{ name: 'Econ', topics: ['Economics'] }]);
        world.coordinatorTopics = ['Economics'];
        install(world);
        const result = await service.suggest(userId, { topics: [] }, NOW);
        expect(result.session.topicsFrom).toBe('profile');
        expect(result.stages.sharesTopic).toBe(1);
      });

      it("prefers topics that were named over the coordinator's own", async () => {
        const world = build([
          { name: 'Econ', topics: ['Economics'] },
          { name: 'Law', topics: ['Corporate Law'] },
        ]);
        world.coordinatorTopics = ['Economics'];
        install(world);
        const read = jest.spyOn(prisma.user_expertise, 'findMany');

        const result = await service.suggest(
          userId,
          { topics: ['Corporate Law'] },
          NOW,
        );
        expect(result.session.topicsFrom).toBe('request');
        expect(result.suggestions.map((s) => s.name)).toEqual(['Law Tester']);
        // Only the lecturers' topics were read; the coordinator's were not.
        expect(read).toHaveBeenCalledTimes(1);
      });

      it('applies no topic rule at all when the coordinator has no expertise either', async () => {
        install(
          build([
            { name: 'Econ', topics: ['Economics'] },
            { name: 'Law', topics: ['Corporate Law'] },
            { name: 'Blank', topics: [] },
          ]),
        );
        const result = await service.suggest(userId, {}, NOW);
        expect(result.session.topicsFrom).toBe('none');
        expect(result.session.topics).toEqual([]);
        expect(result.stages.sharesTopic).toBe(3);
        expect(result.suggestions).toHaveLength(3);
        for (const suggestion of result.suggestions) {
          expect(suggestion.sharedTopics).toEqual([]);
          expect(suggestion.score.fit).toBe(0);
        }
      });
    });
  });

  describe('rule 4, reliable', () => {
    it('passes every lecturer through the gate, because ratings are not stored yet', async () => {
      install(build([{ name: 'Ada' }, { name: 'Ben' }]));
      const result = await service.suggest(userId, query, NOW);
      expect(result.stages.reliable).toBe(result.stages.sharesTopic);
      expect(result.suggestions).toHaveLength(2);
    });

    it('does not drop a lecturer for cancelled sessions, whoever cancelled them', async () => {
      install(
        build([
          { name: 'Steady', completed: 3 },
          { name: 'New' },
          { name: 'Cancelled', broken: 4 },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      expect(
        result.suggestions.map((s) => s.name.replace(' Tester', '')).sort(),
      ).toEqual(['Cancelled', 'New', 'Steady']);
      expect(result.stages.sharesTopic).toBe(3);
      expect(result.stages.reliable).toBe(3);
    });

    it('does not read events at all', async () => {
      install(build([{ name: 'Ada', broken: 4 }]));
      const read = jest.spyOn(prisma.events, 'findMany');
      await service.suggest(userId, query, NOW);
      expect(read).not.toHaveBeenCalled();
    });

    it('does not let cancelled sessions change the order', async () => {
      install(
        build([
          { name: 'Cancelled', broken: 4 },
          { name: 'Completed', completed: 4 },
        ]),
      );
      const result = await service.suggest(userId, query, NOW);
      const [first, second] = result.suggestions;
      expect(first.score).toEqual(second.score);
    });

    it('has the gate wired in for when ratings exist: a poorly rated lecturer would be left out', async () => {
      install(build([{ name: 'Rated' }, { name: 'Unrated' }]));
      const ratingsOf = jest
        .spyOn(
          service as unknown as { ratingsOf: (id: bigint) => number[] },
          'ratingsOf',
        )
        .mockImplementation((id) => (id === 1n ? [5, 5, 5, 5, 5] : []));

      const result = await service.suggest(userId, query, NOW);
      expect(ratingsOf).toHaveBeenCalled();
      expect(result.suggestions.map((s) => s.name)).toEqual(['Unrated Tester']);
      expect(result.stages.sharesTopic).toBe(2);
      expect(result.stages.reliable).toBe(1);
    });

    it('keeps reliability out of the ordering even when ratings exist', async () => {
      install(build([{ name: 'Great' }, { name: 'Fine' }]));
      jest
        .spyOn(
          service as unknown as { ratingsOf: (id: bigint) => number[] },
          'ratingsOf',
        )
        .mockImplementation((id) => (id === 1n ? [100, 100, 100] : [60]));

      const result = await service.suggest(userId, query, NOW);
      const [first, second] = result.suggestions;
      expect(first.score).toEqual(second.score);
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
      expect(result.suggestions.at(-1)?.sessionsBand).toBe('6 or more');
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
      // Two sessions, the latest 20 days ago.
      const older = new Date(NOW.getTime() - 200 * DAY);
      const newer = new Date(NOW.getTime() - 20 * DAY);
      install(build([{ name: 'Ada', accepted: [older, newer] }]));
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada.sessionsBand).toBe('1 to 2');
      expect(ada.lastSessionBand).toBe('within 30 days');
    });

    it('bands a lecturer with no sessions as none and never', async () => {
      install(build([{ name: 'Ada' }]));
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada.sessionsBand).toBe('none');
      expect(ada.lastSessionBand).toBe('never');
    });

    it('falls back to requested_at when an old match has no updated_at', async () => {
      const world = build([{ name: 'Ada' }]);
      const requestedAt = new Date(NOW.getTime() - 45 * DAY);
      world.accepted.push({
        guest_id: world.ids.Ada,
        requested_at: requestedAt,
        updated_at: null,
      });
      install(world);
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada.lastSessionBand).toBe('1 to 3 months');
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
    it('reports a cumulative count after each rule, and cancelled sessions remove nobody', async () => {
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
        reliable: 3,
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

    it('gives the fit and the history as bands, and no other part of the score', async () => {
      // Three sessions, the latest exactly 90 days ago.
      const accepted = [90, 120, 150].map(
        (days) => new Date(NOW.getTime() - days * DAY),
      );
      install(
        build([
          { name: 'Ada', topics: ['Economics', 'Taxation Law'], accepted },
        ]),
      );
      const [ada] = (await service.suggest(userId, query, NOW)).suggestions;
      expect(ada).toEqual({
        guestId: '1',
        name: 'Ada Tester',
        field: 'Law',
        role: 'Partner',
        photoUrl: '',
        sharedTopics: ['Economics', 'Taxation Law'],
        matchStatus: 'none',
        // Only the fit leaves the server, to 2 decimals.
        score: { fit: 1 },
        lastSessionBand: '1 to 3 months',
        sessionsBand: '3 to 5',
      });
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
  /**
   * One coordinator must not be able to read another's activity out of this
   * response. The exact session count, the exact date of the last session and
   * the reliability figure are all held back, and so is anything that could be
   * turned back into them. If this block fails, a field has leaked.
   */
  describe('response privacy', () => {
    const SUGGESTION_KEYS = [
      'field',
      'guestId',
      'lastSessionBand',
      'matchStatus',
      'name',
      'photoUrl',
      'role',
      'score',
      'sessionsBand',
      'sharedTopics',
    ];
    const FORBIDDEN_KEYS = [
      'reliability',
      'reliabilityScore',
      'total',
      'rotation',
      'exposure',
      'rating',
      'ratings',
      'sessionsSoFar',
      'sessions',
      'sessionCount',
      'exposureCount',
      'lastSessionAt',
      'lastMatchedAt',
      'updatedAt',
      'requestedAt',
      'createdAt',
    ];
    const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

    /** Every key at every depth of a value. */
    function allKeys(value: unknown): string[] {
      if (Array.isArray(value)) {
        return value.flatMap(allKeys);
      }
      if (typeof value === 'object' && value !== null) {
        return Object.entries(value).flatMap(([key, inner]) => [
          key,
          ...allKeys(inner),
        ]);
      }
      return [];
    }

    async function busyWorld() {
      const day = (days: number) => new Date(NOW.getTime() - days * DAY);
      install(
        build([
          {
            name: 'Busy',
            accepted: [
              day(3),
              day(40),
              day(80),
              day(120),
              day(200),
              day(300),
              day(400),
            ],
            completed: 3,
          },
          { name: 'Quiet', accepted: [day(100)], broken: 2 },
          { name: 'New' },
        ]),
      );
      return service.suggest(userId, query, NOW);
    }

    it('returns exactly the allowed fields for each suggestion', async () => {
      const result = await busyWorld();
      expect(result.suggestions).toHaveLength(3);
      for (const suggestion of result.suggestions) {
        expect(Object.keys(suggestion).sort()).toEqual(SUGGESTION_KEYS);
        // Fit only: rotation, exposure and the total stay on the server.
        expect(Object.keys(suggestion.score)).toEqual(['fit']);
      }
    });

    it('has no reliability, count, date or timestamp field anywhere in the response', async () => {
      const result = await busyWorld();
      const keys = allKeys(result);
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys).not.toContain(forbidden);
      }
      // The stage totals are platform-wide counts of lecturers, not anyone's
      // activity, so the pattern is checked on what describes a lecturer.
      expect(
        allKeys(result.suggestions).filter((key) =>
          // cspell:disable-next-line
          /reliab|rating|count|At$/.test(key),
        ),
      ).toEqual([]);
    });

    it('has no exact timestamp in any value', async () => {
      const json = JSON.stringify(await busyWorld());
      expect(json).not.toMatch(ISO_TIMESTAMP);
    });

    it('has no number in a suggestion outside score.fit', async () => {
      const { suggestions } = await busyWorld();
      for (const { score, ...rest } of suggestions) {
        const numbers = Object.values(rest).filter(
          (v) => typeof v === 'number',
        );
        expect(numbers).toEqual([]);
        expect(typeof score.fit).toBe('number');
      }
    });

    it('rounds fit to 2 decimals', async () => {
      install(
        build([
          {
            name: 'Thin',
            topics: ['Economics', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
          },
        ]),
      );
      const [thin] = (await service.suggest(userId, query, NOW)).suggestions;
      // 1 / sqrt(2 * 9) = 0.2357...
      expect(thin.score.fit).toBe(0.24);
    });

    it('has no rotation, exposure or total anywhere in the response', async () => {
      const keys = allKeys(await busyWorld());
      expect(keys).not.toContain('rotation');
      expect(keys).not.toContain('exposure');
      expect(keys).not.toContain('total');
    });

    it('cannot be turned back into a count: lecturers with different counts in a band look the same', async () => {
      const when = new Date(NOW.getTime() - 30 * DAY);
      install(
        build([
          { name: 'Six', accepted: Array.from({ length: 6 }, () => when) },
          { name: 'Nine', accepted: Array.from({ length: 9 }, () => when) },
        ]),
      );
      const { suggestions } = await service.suggest(userId, query, NOW);
      const shape = suggestions.map(
        ({ name: _name, guestId: _id, ...rest }) => rest,
      );
      expect(shape[0]).toEqual(shape[1]);
    });

    it('only ever uses the four lastSessionBand and four sessionsBand values', async () => {
      const { suggestions } = await busyWorld();
      for (const suggestion of suggestions) {
        expect([
          'never',
          'within 30 days',
          '1 to 3 months',
          'over 3 months',
        ]).toContain(suggestion.lastSessionBand);
        expect(['none', '1 to 2', '3 to 5', '6 or more']).toContain(
          suggestion.sessionsBand,
        );
      }
    });

    it('still orders on the exact values, which the response no longer shows', async () => {
      // Both were last matched in the same band with one session each, so
      // nothing in the response tells them apart. A is first in the table and
      // so would win a tie, but B was untouched for longer, so B ranks higher.
      install(
        build([
          { name: 'A', accepted: [new Date(NOW.getTime() - 95 * DAY)] },
          { name: 'B', accepted: [new Date(NOW.getTime() - 100 * DAY)] },
        ]),
      );
      const { suggestions } = await service.suggest(userId, query, NOW);
      expect(suggestions.map((s) => s.name)).toEqual(['B Tester', 'A Tester']);
      expect(suggestions[0].lastSessionBand).toBe(
        suggestions[1].lastSessionBand,
      );
      expect(suggestions[0].sessionsBand).toBe(suggestions[1].sessionsBand);
      expect(suggestions[0].score).toEqual(suggestions[1].score);
    });
  });
  describe("the administrator's settings", () => {
    const configure = (
      fit: number,
      rotation: number,
      exposure: number,
      halfLifeDays = 90,
    ) =>
      jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
        suggestions_fit_weight: fit,
        suggestions_rotation_weight: rotation,
        suggestions_exposure_weight: exposure,
        suggestions_half_life_days: halfLifeDays,
      } as never);

    /**
     * A is the best topic fit but has had a session recently. B is a weak topic
     * fit (1 of the 2 requested topics, out of 4 offered) who has never had one.
     */
    const share = () => {
      const world = build([
        {
          name: 'A',
          topics: ['Economics', 'Taxation Law'],
          accepted: [new Date(NOW.getTime() - 20 * DAY)],
        },
        { name: 'B', topics: ['Economics', 'X', 'Y', 'Z'] },
      ]);
      install(world);
    };

    it('ranks by the defaults, 65/20/15, when nothing has been configured', async () => {
      share();
      expect(await names()).toEqual(['A', 'B']);
    });

    it('Balanced 65/20/15 keeps the strong-fit lecturer first', async () => {
      share();
      configure(65, 20, 15);
      expect(await names()).toEqual(['A', 'B']);
    });

    it('Topic first 80/10/10 keeps the strong-fit lecturer first', async () => {
      share();
      configure(80, 10, 10);
      expect(await names()).toEqual(['A', 'B']);
    });

    it('Share the work 50/30/20 moves the never-used, lower-fit lecturer up', async () => {
      share();
      configure(50, 30, 20);
      expect(await names()).toEqual(['B', 'A']);
    });

    it('still lists everyone however the weights are set: they only change the order', async () => {
      share();
      configure(50, 50, 0);
      const result = await service.suggest(userId, query, NOW);
      expect(result.suggestions).toHaveLength(2);
      expect(result.stages.reliable).toBe(2);
    });

    it('uses the half-life: a short one favours the lecturer left alone for longer', async () => {
      // R is the better fit, matched 10 days ago. S is a weaker fit, matched 120
      // days ago. With the topic weight at 60, a 30-day half-life makes S's long
      // rest count for a lot and S wins; a 365-day half-life makes it count for
      // little and R wins.
      const build2 = () =>
        install(
          build([
            {
              name: 'R',
              topics: ['Economics', 'Taxation Law'],
              accepted: [new Date(NOW.getTime() - 10 * DAY)],
            },
            {
              name: 'S',
              topics: ['Economics'],
              accepted: [new Date(NOW.getTime() - 120 * DAY)],
            },
          ]),
        );

      build2();
      configure(60, 30, 10, 30);
      expect(await names()).toEqual(['S', 'R']);

      jest.restoreAllMocks();
      build2();
      configure(60, 30, 10, 365);
      expect(await names()).toEqual(['R', 'S']);
    });

    it('reads the settings, and does not change what the response contains', async () => {
      share();
      const read = configure(50, 30, 20, 180);
      const result = await service.suggest(userId, query, NOW);
      expect(read).toHaveBeenCalled();
      for (const suggestion of result.suggestions) {
        expect(Object.keys(suggestion.score)).toEqual(['fit']);
      }
    });
  });
});
