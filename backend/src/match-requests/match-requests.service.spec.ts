import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MatchRequestsService } from './match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma } from '../prisma';
import {
  stubOpenReports,
  stubOpenReportsAlways,
} from '../testing/open-reports';

describe('MatchRequestsService', () => {
  let service: MatchRequestsService;
  let notifications: NotificationsService;

  // Auth0 subject; the double's resolveUserId maps every subject to 1n.
  const userId = 'auth0|user-123';
  const requestedAt = new Date('2026-09-30T02:00:00.000Z');

  function signInAsCoordinator(coordinatorId: bigint) {
    jest
      .spyOn(prisma.coordinators, 'findUnique')
      .mockResolvedValueOnce({ coordinator_id: coordinatorId } as never);
  }

  function signInAsGuest(guestId: bigint) {
    jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValueOnce(null);
    jest
      .spyOn(prisma.guests, 'findUnique')
      .mockResolvedValueOnce({ guest_id: guestId } as never);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MatchRequestsService, NotificationsService],
    }).compile();

    service = module.get<MatchRequestsService>(MatchRequestsService);
    notifications = module.get<NotificationsService>(NotificationsService);

    // Both ends of a request are visible to each other unless a test hides one.
    jest
      .spyOn(prisma.coordinators, 'findFirst')
      .mockResolvedValue({ coordinator_id: 1n } as never);
    jest
      .spyOn(prisma.guests, 'findFirst')
      .mockResolvedValue({ guest_id: 1n } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('refuses a caller with no coordinator or guest profile', async () => {
    await expect(service.findMine(userId)).rejects.toThrow(ForbiddenException);
  });

  describe('findMine', () => {
    it("returns only a coordinator's own requests, keyed by the guest", async () => {
      signInAsCoordinator(5n);
      const findMany = jest
        .spyOn(prisma.match_requests, 'findMany')
        .mockResolvedValue([
          {
            match_id: 6001n,
            coordinator_id: 5n,
            guest_id: 3001n,
            status: 'ACCEPTED',
            requested_at: requestedAt,
          },
        ] as never);

      await expect(service.findMine(userId)).resolves.toEqual([
        {
          matchId: '6001',
          targetId: '3001',
          status: 'ACCEPTED',
          requestedAt: requestedAt.toISOString(),
          sentByMe: true,
        },
      ]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coordinator_id: 5n } }),
      );
    });

    it("returns only a guest's own requests, keyed by the coordinator", async () => {
      signInAsGuest(7n);
      const findMany = jest
        .spyOn(prisma.match_requests, 'findMany')
        .mockResolvedValue([
          {
            match_id: 6002n,
            coordinator_id: 2001n,
            guest_id: 7n,
            status: 'PENDING',
            requested_at: requestedAt,
          },
        ] as never);

      await expect(service.findMine(userId)).resolves.toEqual([
        expect.objectContaining({ targetId: '2001', status: 'PENDING' }),
      ]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { guest_id: 7n } }),
      );
    });
  });

  describe('create', () => {
    it("creates a coordinator's request on the coordinator side, marked as theirs", async () => {
      signInAsCoordinator(5n);
      const create = jest
        .spyOn(prisma.match_requests, 'create')
        .mockResolvedValue({
          match_id: 6010n,
          coordinator_id: 5n,
          guest_id: 3001n,
          status: 'PENDING',
          requested_at: requestedAt,
          requested_by: 'coordinator',
        } as never);

      await expect(service.create(userId, '3001')).resolves.toEqual(
        expect.objectContaining({
          targetId: '3001',
          status: 'PENDING',
          sentByMe: true,
        }),
      );
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          coordinator_id: 5n,
          guest_id: 3001n,
          requested_by: 'coordinator',
        }) as unknown,
      });
    });

    it('creates a guest request on the guest side', async () => {
      signInAsGuest(7n);
      const create = jest
        .spyOn(prisma.match_requests, 'create')
        .mockResolvedValue({
          match_id: 6011n,
          coordinator_id: 2001n,
          guest_id: 7n,
          status: 'PENDING',
          requested_at: requestedAt,
          requested_by: 'guest',
        } as never);

      await service.create(userId, '2001');
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          coordinator_id: 2001n,
          guest_id: 7n,
          requested_by: 'guest',
        }) as unknown,
      });
    });

    it('accepts a pending request the other side sent and notifies both people', async () => {
      signInAsGuest(7n);
      jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValueOnce({
        first_name: 'Ada',
        last_name: 'Lee',
        users: { auth0Id: 'auth0|coordinator' },
      } as never);
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValueOnce({
        first_name: 'Sam',
        last_name: 'Tran',
        users: { auth0Id: 'auth0|guest' },
      } as never);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6012n,
        coordinator_id: 2001n,
        guest_id: 7n,
        status: 'PENDING',
        requested_at: requestedAt,
        requested_by: 'coordinator',
      } as never);
      const updateMany = jest
        .spyOn(prisma.match_requests, 'updateMany')
        .mockResolvedValue({ count: 1 });
      // Later reads of either profile still find someone to notify, so a
      // stray interest notice would be raised rather than skipped for lack of one.
      jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValue({
        users: { auth0Id: 'auth0|coordinator' },
      } as never);
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValue({
        users: { auth0Id: 'auth0|guest' },
      } as never);
      const notify = jest
        .spyOn(notifications, 'create')
        .mockResolvedValue({} as never);
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '2001')).resolves.toEqual(
        expect.objectContaining({ status: 'ACCEPTED', sentByMe: false }),
      );
      expect(interest).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { match_id: 6012n, status: 'PENDING' },
        }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'auth0|coordinator',
          type: 'match',
          description: 'You matched with Sam Tran.',
        }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'auth0|guest',
          description: 'You matched with Ada Lee.',
        }),
      );
    });

    it('does not notify again when another accept already made the match', async () => {
      signInAsGuest(7n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6012n,
        coordinator_id: 2001n,
        guest_id: 7n,
        status: 'PENDING',
        requested_at: requestedAt,
        requested_by: 'coordinator',
      } as never);
      jest
        .spyOn(prisma.match_requests, 'updateMany')
        .mockResolvedValue({ count: 0 });
      const notify = jest.spyOn(notifications, 'create');

      await service.create(userId, '2001');
      expect(notify).not.toHaveBeenCalled();
    });

    it('treats an older row with no sender as sent by the coordinator', async () => {
      signInAsGuest(7n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6001n,
        coordinator_id: 2001n,
        guest_id: 7n,
        status: 'PENDING',
        requested_at: requestedAt,
        requested_by: null,
      } as never);
      const updateMany = jest.spyOn(prisma.match_requests, 'updateMany');

      await service.create(userId, '2001');
      expect(updateMany).toHaveBeenCalled();
    });

    it('reads the row a simultaneous request wrote instead of failing', async () => {
      // Each pass through create resolves the caller.
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 5n } as never)
        .mockResolvedValueOnce({ coordinator_id: 5n } as never);
      jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          match_id: 6010n,
          coordinator_id: 5n,
          guest_id: 3001n,
          status: 'PENDING',
          requested_at: requestedAt,
          requested_by: 'coordinator',
        } as never);
      jest
        .spyOn(prisma.match_requests, 'create')
        .mockRejectedValueOnce(
          Object.assign(new Error('dup'), { code: 'P2002' }),
        );

      await expect(service.create(userId, '3001')).resolves.toEqual(
        expect.objectContaining({ matchId: '6010', sentByMe: true }),
      );
    });

    it("leaves the caller's own pending request as it is when sent again", async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6010n,
        coordinator_id: 5n,
        guest_id: 3001n,
        status: 'PENDING',
        requested_at: requestedAt,
        requested_by: 'coordinator',
      } as never);
      const update = jest.spyOn(prisma.match_requests, 'update');
      const create = jest.spyOn(prisma.match_requests, 'create');

      await expect(service.create(userId, '3001')).resolves.toEqual(
        expect.objectContaining({ status: 'PENDING', sentByMe: true }),
      );
      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('refuses a profile that does not exist', async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.guests, 'findFirst').mockResolvedValue(null);

      await expect(service.create(userId, '9999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects an id that is not numeric, rather than failing mid-write', async () => {
      signInAsCoordinator(5n);

      await expect(service.create(userId, 'not-an-id')).rejects.toThrow(
        'targetId',
      );
    });
  });

  describe('telling the other person about new interest', () => {
    const coordinatorProfile = {
      first_name: 'Ada',
      last_name: 'Lee',
      role: 'Senior Lecturer',
      users: { auth0Id: 'auth0|coordinator' },
    };
    const guestProfile = {
      first_name: 'Sam',
      last_name: 'Tran',
      role: 'Engineer',
      users: { auth0Id: 'auth0|guest' },
    };
    const newRow = (requestedBy: 'coordinator' | 'guest') =>
      ({
        match_id: 6020n,
        coordinator_id: 5n,
        guest_id: 7n,
        status: 'PENDING',
        requested_at: requestedAt,
        requested_by: requestedBy,
      }) as never;

    /**
     * Signs the caller in on one side and queues the two profiles the service
     * reads after saving, to word the notice and find who receives it.
     */
    function askAs(
      side: 'coordinator' | 'guest',
      profiles: { coordinator: object | null; guest: object | null },
    ) {
      const coordinators = jest.spyOn(prisma.coordinators, 'findUnique');
      const guests = jest.spyOn(prisma.guests, 'findUnique');
      if (side === 'coordinator') {
        coordinators.mockResolvedValueOnce({ coordinator_id: 5n } as never);
      } else {
        coordinators.mockResolvedValueOnce(null);
        guests.mockResolvedValueOnce({ guest_id: 7n } as never);
      }
      coordinators.mockResolvedValueOnce(profiles.coordinator as never);
      guests.mockResolvedValueOnce(profiles.guest as never);
      jest
        .spyOn(prisma.match_requests, 'create')
        .mockResolvedValue(newRow(side));
    }

    it("tells the guest when a coordinator asks, and only the guest, linking to the coordinator's card", async () => {
      askAs('coordinator', {
        coordinator: coordinatorProfile,
        guest: guestProfile,
      });
      const interest = jest
        .spyOn(notifications, 'createUnlessRecent')
        .mockResolvedValue(true);

      await service.create(userId, '7');
      expect(interest).toHaveBeenCalledTimes(1);
      expect(interest).toHaveBeenCalledWith({
        recipientId: 'auth0|guest',
        type: 'match',
        title: 'New interest',
        description: 'Ada Lee is interested in working with you',
        actionLabel: 'View',
        href: '/guest_lecturer/discovery?from=5',
      });
    });

    it("tells the coordinator when a guest asks, and only the coordinator, linking to the guest's card", async () => {
      askAs('guest', { coordinator: coordinatorProfile, guest: guestProfile });
      const interest = jest
        .spyOn(notifications, 'createUnlessRecent')
        .mockResolvedValue(true);

      await service.create(userId, '5');
      expect(interest).toHaveBeenCalledTimes(1);
      expect(interest).toHaveBeenCalledWith({
        recipientId: 'auth0|coordinator',
        type: 'match',
        title: 'New interest',
        description: 'Sam Tran is interested in working with you',
        actionLabel: 'View',
        href: '/unit_coordinator/discovery?from=7',
      });
    });

    it('names the sender by role when their profile has no name', async () => {
      askAs('coordinator', {
        coordinator: { ...coordinatorProfile, first_name: '', last_name: null },
        guest: guestProfile,
      });
      const interest = jest
        .spyOn(notifications, 'createUnlessRecent')
        .mockResolvedValue(true);

      await service.create(userId, '7');
      expect(interest).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Senior Lecturer is interested in working with you',
        }),
      );
    });

    it('sends nothing when the other person has no account to notify', async () => {
      askAs('coordinator', {
        coordinator: coordinatorProfile,
        guest: { ...guestProfile, users: null },
      });
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '7')).resolves.toEqual(
        expect.objectContaining({ status: 'PENDING' }),
      );
      expect(interest).not.toHaveBeenCalled();
    });

    it('sends nothing when the profile asked for does not exist', async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.guests, 'findFirst').mockResolvedValue(null);
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '7')).rejects.toThrow(
        NotFoundException,
      );
      expect(interest).not.toHaveBeenCalled();
    });

    it('sends nothing when the contact limit refuses the request', async () => {
      signInAsCoordinator(5n);
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue({ contact_limit_days: 7 } as never);
      jest
        .spyOn(prisma.match_requests, 'findFirst')
        .mockResolvedValue({ requested_at: new Date() } as never);
      const create = jest.spyOn(prisma.match_requests, 'create');
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '7')).rejects.toThrow(
        ConflictException,
      );
      expect(create).not.toHaveBeenCalled();
      expect(interest).not.toHaveBeenCalled();
    });

    it('sends nothing when the request could not be saved', async () => {
      signInAsCoordinator(5n);
      jest
        .spyOn(prisma.match_requests, 'create')
        .mockRejectedValue(new Error('connection lost'));
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '7')).rejects.toThrow(
        'connection lost',
      );
      expect(interest).not.toHaveBeenCalled();
    });

    it('sends nothing when the same request is asked for again', async () => {
      signInAsCoordinator(5n);
      jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue(newRow('coordinator'));
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await service.create(userId, '7');
      expect(interest).not.toHaveBeenCalled();
    });

    it('saves the request but sends nothing when the guest dismissed the coordinator', async () => {
      askAs('coordinator', {
        coordinator: coordinatorProfile,
        guest: guestProfile,
      });
      const dismissal = jest
        .spyOn(prisma.dismissals, 'findUnique')
        .mockResolvedValue({ dismissal_id: 1n } as never);
      const interest = jest.spyOn(notifications, 'createUnlessRecent');
      const create = jest.spyOn(prisma.match_requests, 'create');

      await expect(service.create(userId, '7')).resolves.toEqual(
        expect.objectContaining({ status: 'PENDING', sentByMe: true }),
      );
      expect(create).toHaveBeenCalledTimes(1);
      expect(dismissal).toHaveBeenCalledWith({
        where: {
          coordinator_id_guest_id_dismissed_by: {
            coordinator_id: 5n,
            guest_id: 7n,
            dismissed_by: 'guest',
          },
        },
        select: { dismissal_id: true },
      });
      expect(interest).not.toHaveBeenCalled();
    });

    it('saves the request but sends nothing when the coordinator dismissed the guest', async () => {
      askAs('guest', { coordinator: coordinatorProfile, guest: guestProfile });
      const dismissal = jest
        .spyOn(prisma.dismissals, 'findUnique')
        .mockResolvedValue({ dismissal_id: 1n } as never);
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '5')).resolves.toEqual(
        expect.objectContaining({ status: 'PENDING', sentByMe: true }),
      );
      expect(dismissal).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            coordinator_id_guest_id_dismissed_by: {
              coordinator_id: 5n,
              guest_id: 7n,
              dismissed_by: 'coordinator',
            },
          },
        }),
      );
      expect(interest).not.toHaveBeenCalled();
    });

    it('still sends the notice when only the sender dismissed the recipient', async () => {
      askAs('coordinator', {
        coordinator: coordinatorProfile,
        guest: guestProfile,
      });
      // The coordinator hid the guest; the guest has dismissed nobody.
      jest.spyOn(prisma.dismissals, 'findUnique').mockImplementation((({
        where,
      }: {
        where: {
          coordinator_id_guest_id_dismissed_by: { dismissed_by: string };
        };
      }) =>
        Promise.resolve(
          where.coordinator_id_guest_id_dismissed_by.dismissed_by ===
            'coordinator'
            ? { dismissal_id: 1n }
            : null,
        )) as never);
      const interest = jest
        .spyOn(notifications, 'createUnlessRecent')
        .mockResolvedValue(true);

      await service.create(userId, '7');
      expect(interest).toHaveBeenCalledTimes(1);
    });

    it('notifies once when the same person asks twice within a day without withdrawing', async () => {
      const ask = () =>
        askAs('coordinator', {
          coordinator: coordinatorProfile,
          guest: guestProfile,
        });
      const stored = jest.spyOn(prisma.notifications, 'create');
      const lookup = jest.spyOn(prisma.notifications, 'findFirst');

      ask();
      await service.create(userId, '7');
      expect(stored).toHaveBeenCalledTimes(1);

      // The first notice is now on file, so the second ask finds it.
      lookup.mockResolvedValue({ notification_id: 10n } as never);
      ask();
      await service.create(userId, '7');
      expect(stored).toHaveBeenCalledTimes(1);
    });

    it('sends a fresh notice when the same person withdraws and asks again within a day', async () => {
      // A notifications table that keeps what is stored and honours the
      // equality filters, so the withdrawal's delete is what the second ask sees.
      const table: Record<string, unknown>[] = [];
      const matching = (where: Record<string, unknown>) =>
        table.filter((row) =>
          Object.entries(where).every(
            ([key, value]) => key === 'created_at' || row[key] === value,
          ),
        );
      const stored = jest
        .spyOn(prisma.notifications, 'create')
        .mockImplementation(((...args: unknown[]) => {
          const { data } = args[0] as { data: Record<string, unknown> };
          table.push(data);
          return Promise.resolve(data);
        }) as never);
      jest.spyOn(prisma.notifications, 'findFirst').mockImplementation(((
        ...args: unknown[]
      ) => {
        const { where } = args[0] as { where: Record<string, unknown> };
        return Promise.resolve(
          matching(where).length > 0 ? { notification_id: 10n } : null,
        );
      }) as never);
      jest.spyOn(prisma.notifications, 'deleteMany').mockImplementation(((
        ...args: unknown[]
      ) => {
        const { where } = args[0] as { where: Record<string, unknown> };
        const gone = matching(where);
        gone.forEach((row) => table.splice(table.indexOf(row), 1));
        return Promise.resolve({ count: gone.length });
      }) as never);
      const ask = () =>
        askAs('coordinator', {
          coordinator: coordinatorProfile,
          guest: guestProfile,
        });

      ask();
      await service.create(userId, '7');
      expect(table).toHaveLength(1);

      // The coordinator withdraws: their own profile, then both parties for the notice.
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 5n } as never)
        .mockResolvedValueOnce(coordinatorProfile as never);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce(guestProfile as never);
      jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue(newRow('coordinator'));
      await service.remove(userId, '7');
      expect(table).toHaveLength(0);

      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue(null);
      ask();
      await service.create(userId, '7');
      expect(stored).toHaveBeenCalledTimes(2);
      expect(table).toHaveLength(1);
    });

    it('still returns the request when the notice cannot be saved', async () => {
      askAs('coordinator', {
        coordinator: coordinatorProfile,
        guest: guestProfile,
      });
      jest
        .spyOn(notifications, 'createUnlessRecent')
        .mockRejectedValue(new Error('connection lost'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(service.create(userId, '7')).resolves.toEqual(
        expect.objectContaining({ matchId: '6020', status: 'PENDING' }),
      );
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('logs only the name of a failure, never its message or text', async () => {
      const failure = Object.assign(
        new Error('Unique constraint failed for ada.lee@example.com'),
        { name: 'PrismaClientKnownRequestError' },
      );
      const notify = jest
        .spyOn(notifications, 'createUnlessRecent')
        .mockRejectedValueOnce(failure)
        .mockRejectedValueOnce('Sam Tran sam@example.com');
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      for (let attempt = 0; attempt < 2; attempt++) {
        askAs('coordinator', {
          coordinator: coordinatorProfile,
          guest: guestProfile,
        });
        await service.create(userId, '7');
      }

      expect(notify).toHaveBeenCalledTimes(2);
      expect((warn.mock.calls as [string][]).map(([line]) => line)).toEqual([
        'Could not notify about a new request: PrismaClientKnownRequestError',
        'Could not notify about a new request: UnknownError',
      ]);
    });
  });

  describe('refusing a request that Discovery would hide', () => {
    /** What the database holds about a profile, as far as visibility goes. */
    interface Facts {
      /** users.userid of the account; null for a profile with no account. */
      userId: bigint | null;
      deactivated?: boolean;
      approved?: boolean;
    }
    type Clause = {
      user_id?: null | { notIn: bigint[] };
      users?: { is: { deletedat: null } };
    };
    interface Where {
      OR?: Clause[];
      AND?: { OR: Clause[] }[];
      approved_at?: unknown;
    }

    /**
     * Answers a profile lookup the way the database would: the profile is
     * found only if every filter the service put in the query lets it through.
     * That is what makes these tests about the filters rather than about a mock.
     */
    function finder(facts: Facts, row: object) {
      const passes = (clauses: Clause[] | undefined) =>
        clauses === undefined ||
        clauses.some((clause) => {
          if (clause.user_id === null) return facts.userId === null;
          if (clause.user_id) {
            return (
              facts.userId !== null &&
              !clause.user_id.notIn.includes(facts.userId)
            );
          }
          return facts.userId !== null && !facts.deactivated;
        });
      return (({ where }: { where: Where }) =>
        Promise.resolve(
          passes(where.OR) &&
            (where.AND ?? []).every((part) => passes(part.OR)) &&
            (where.approved_at === undefined || facts.approved !== false)
            ? row
            : null,
        )) as never;
    }

    /** The caller is on one side with the other as the target; both lookups are shown the facts. */
    function setUp(caller: 'coordinator' | 'guest', own: Facts, target: Facts) {
      const coordinatorFacts = caller === 'coordinator' ? own : target;
      const guestFacts = caller === 'coordinator' ? target : own;
      jest
        .spyOn(prisma.coordinators, 'findFirst')
        .mockImplementation(finder(coordinatorFacts, { coordinator_id: 5n }));
      jest
        .spyOn(prisma.guests, 'findFirst')
        .mockImplementation(finder(guestFacts, { guest_id: 7n }));
      if (caller === 'coordinator') {
        signInAsCoordinator(5n);
      } else {
        signInAsGuest(7n);
      }
      jest
        .spyOn(prisma.match_requests, 'create')
        .mockResolvedValue(newRow(caller));
    }

    const newRow = (requestedBy: 'coordinator' | 'guest') =>
      ({
        match_id: 6030n,
        coordinator_id: 5n,
        guest_id: 7n,
        status: 'PENDING',
        requested_at: requestedAt,
        requested_by: requestedBy,
      }) as never;

    /** Open reports as [reporter, reported] user ids, raised through a match. */
    function reports(open: [reporter: bigint, reported: string][]) {
      stubOpenReportsAlways(
        open.map(([actor, target], i) => ({
          entry_id: BigInt(40 + i),
          actor_user_id: actor,
          target_id: target,
          detail: { reason: 'asked for money', matchId: '1' },
        })),
      );
    }

    /** The caller's own account is user 1 in the double. */
    const me: Facts = { userId: 1n, approved: true };
    const them: Facts = { userId: 77n, approved: true };

    async function expectRefused(targetId: string) {
      const create = jest.spyOn(prisma.match_requests, 'create');
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, targetId)).rejects.toThrow(
        new NotFoundException('That profile does not exist.'),
      );
      expect(create).not.toHaveBeenCalled();
      expect(interest).not.toHaveBeenCalled();
    }

    const onHold = {
      status: 403,
      response: {
        code: 'ACCOUNT_ON_HOLD',
        message:
          "Your account is on hold while CCAE reviews a report, so you can't send or accept requests right now.",
      },
    };

    /** Refused with a 403 about the caller's own account, and nothing is saved or sent. */
    async function expectCallerOnHold(targetId: string) {
      const create = jest.spyOn(prisma.match_requests, 'create');
      const update = jest.spyOn(prisma.match_requests, 'updateMany');
      const notify = jest.spyOn(notifications, 'create');
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      const attempt = service.create(userId, targetId);

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject(onHold);
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
      expect(interest).not.toHaveBeenCalled();
    }

    async function expectAllowed(targetId: string) {
      const create = jest.spyOn(prisma.match_requests, 'create');

      await expect(service.create(userId, targetId)).resolves.toEqual(
        expect.objectContaining({ status: 'PENDING' }),
      );
      expect(create).toHaveBeenCalledTimes(1);
    }

    it('lets a request through when both profiles are visible', async () => {
      setUp('coordinator', me, them);
      await expectAllowed('7');
    });

    describe('a guest who is not approved', () => {
      beforeEach(() => {
        jest
          .spyOn(prisma.admin_settings, 'upsert')
          .mockResolvedValue({ require_admin_approval: true } as never);
      });

      it('cannot be asked by a coordinator while approval is required', async () => {
        setUp('coordinator', me, { ...them, approved: false });
        await expectRefused('7');
      });

      it('can be asked once approval is no longer required', async () => {
        jest
          .spyOn(prisma.admin_settings, 'upsert')
          .mockResolvedValue({ require_admin_approval: false } as never);
        setUp('coordinator', me, { ...them, approved: false });
        await expectAllowed('7');
      });

      it('cannot ask a coordinator while approval is required', async () => {
        setUp('guest', { ...me, approved: false }, { userId: 55n });
        await expectRefused('5');
      });

      it('can ask a coordinator once approved', async () => {
        setUp('guest', me, { userId: 55n });
        await expectAllowed('5');
      });
    });

    describe('a deactivated account', () => {
      it('cannot be asked, as a guest', async () => {
        setUp('coordinator', me, { ...them, deactivated: true });
        await expectRefused('7');
      });

      it('cannot be asked, as a coordinator', async () => {
        setUp('guest', me, { userId: 55n, deactivated: true });
        await expectRefused('5');
      });

      it('cannot ask', async () => {
        setUp('coordinator', { ...me, deactivated: true }, them);
        await expectRefused('7');
      });
    });

    describe('a person on hold after reports', () => {
      const twoReportsAbout = (person: string): [bigint, string][] => [
        [900n, person],
        [901n, person],
      ];

      it('cannot be asked, as a guest', async () => {
        reports(twoReportsAbout('77'));
        setUp('coordinator', me, them);
        await expectRefused('7');
      });

      it('cannot be asked, as a coordinator', async () => {
        reports(twoReportsAbout('55'));
        setUp('guest', me, { userId: 55n });
        await expectRefused('5');
      });

      it('cannot ask, and is told it is their own account', async () => {
        reports(twoReportsAbout('1'));
        setUp('coordinator', me, them);
        await expectCallerOnHold('7');
      });

      it('is told so from the guest side too', async () => {
        reports(twoReportsAbout('1'));
        setUp('guest', me, { userId: 55n });
        await expectCallerOnHold('5');
      });

      it('is held by an administrator the same way', async () => {
        // One reporter is under the threshold; the administrator's hold covers report 40.
        stubOpenReportsAlways([
          {
            entry_id: 40n,
            actor_user_id: 900n,
            target_id: '1',
            detail: { reason: 'asked for money', matchId: '1' },
          },
        ]);
        jest.spyOn(prisma.audit_entries, 'findMany').mockResolvedValue([
          {
            action: 'user.held',
            target_id: '1',
            detail: { reportIds: ['40'] },
          },
        ] as never);
        setUp('coordinator', me, them);
        await expectCallerOnHold('7');
      });

      it('cannot accept a request that is waiting for them either', async () => {
        reports(twoReportsAbout('1'));
        setUp('guest', me, { userId: 55n });
        jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
          match_id: 6031n,
          coordinator_id: 5n,
          guest_id: 7n,
          status: 'PENDING',
          requested_at: requestedAt,
          requested_by: 'coordinator',
        } as never);

        await expectCallerOnHold('5');
      });

      it('is told about their own account even when the profile they asked for is hidden', async () => {
        reports([...twoReportsAbout('1'), ...twoReportsAbout('77')]);
        setUp('coordinator', me, them);
        await expectCallerOnHold('7');
      });

      it('keeps the missing-profile message for a target that is on hold', async () => {
        reports(twoReportsAbout('77'));
        setUp('coordinator', me, them);
        await expectRefused('7');
      });

      it('does not hold anyone for one stranger reporting them', async () => {
        reports([[900n, '77']]);
        setUp('coordinator', me, them);
        await expectAllowed('7');
      });
    });

    describe('a pair with an open report between them', () => {
      it('cannot be asked by the person who reported them', async () => {
        reports([[1n, '77']]);
        setUp('coordinator', me, them);
        await expectRefused('7');
      });

      it('cannot be asked by the person they reported', async () => {
        reports([[77n, '1']]);
        setUp('coordinator', me, them);
        await expectRefused('7');
      });

      it('is refused from the guest side too', async () => {
        reports([[55n, '1']]);
        setUp('guest', me, { userId: 55n });
        await expectRefused('5');
      });

      it('is not in the way of someone else reporting the target', async () => {
        reports([[900n, '77']]);
        setUp('coordinator', me, them);
        await expectAllowed('7');
      });

      it('is not in the way of two strangers reporting each other', async () => {
        reports([[900n, '901']]);
        setUp('coordinator', me, them);
        await expectAllowed('7');
      });
    });
  });

  describe('remove', () => {
    function existingRow(status: string) {
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6007n,
        coordinator_id: 2001n,
        guest_id: 7n,
        status,
        requested_at: requestedAt,
        requested_by: 'guest',
      } as never);
    }

    it("withdraws the caller's own pending request by deleting it", async () => {
      signInAsGuest(7n);
      existingRow('PENDING');
      const deleteMany = jest.spyOn(prisma.match_requests, 'deleteMany');

      await service.remove(userId, '2001');
      expect(deleteMany).toHaveBeenCalledWith({
        where: { coordinator_id: 2001n, guest_id: 7n },
      });
    });

    describe('the notice about a withdrawn request', () => {
      const coordinatorProfile = {
        first_name: 'Ada',
        last_name: 'Lee',
        users: { auth0Id: 'auth0|coordinator' },
      };
      const guestProfile = {
        first_name: 'Sam',
        last_name: 'Tran',
        users: { auth0Id: 'auth0|guest' },
      };

      /** Queues the two profiles read after the withdrawal, behind the caller's own sign-in. */
      function profilesFound(profiles: {
        coordinator: object | null;
        guest: object | null;
      }) {
        jest
          .spyOn(prisma.coordinators, 'findUnique')
          .mockResolvedValueOnce(profiles.coordinator as never);
        jest
          .spyOn(prisma.guests, 'findUnique')
          .mockResolvedValueOnce(profiles.guest as never);
      }

      function pendingRow(requestedBy: string | null) {
        jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
          match_id: 6008n,
          coordinator_id: 2001n,
          guest_id: 7n,
          status: 'PENDING',
          requested_at: requestedAt,
          requested_by: requestedBy,
        } as never);
      }

      it("deletes the coordinator's New interest notice when a guest withdraws", async () => {
        signInAsGuest(7n);
        pendingRow('guest');
        profilesFound({ coordinator: coordinatorProfile, guest: guestProfile });
        const deleteMatching = jest
          .spyOn(notifications, 'deleteMatching')
          .mockResolvedValue();

        await service.remove(userId, '2001');
        expect(deleteMatching).toHaveBeenCalledTimes(1);
        expect(deleteMatching).toHaveBeenCalledWith({
          recipientId: 'auth0|coordinator',
          type: 'match',
          title: 'New interest',
          href: '/unit_coordinator/discovery?from=7',
        });
      });

      it("deletes the guest's New interest notice when a coordinator withdraws", async () => {
        signInAsCoordinator(2001n);
        pendingRow('coordinator');
        profilesFound({ coordinator: coordinatorProfile, guest: guestProfile });
        const deleteMatching = jest
          .spyOn(notifications, 'deleteMatching')
          .mockResolvedValue();

        await service.remove(userId, '7');
        expect(deleteMatching).toHaveBeenCalledWith({
          recipientId: 'auth0|guest',
          type: 'match',
          title: 'New interest',
          href: '/guest_lecturer/discovery?from=2001',
        });
      });

      it('treats an older request with no sender as sent by the coordinator', async () => {
        signInAsCoordinator(2001n);
        pendingRow(null);
        profilesFound({ coordinator: coordinatorProfile, guest: guestProfile });
        const deleteMatching = jest
          .spyOn(notifications, 'deleteMatching')
          .mockResolvedValue();

        await service.remove(userId, '7');
        expect(deleteMatching).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientId: 'auth0|guest',
            href: '/guest_lecturer/discovery?from=2001',
          }),
        );
      });

      it('removes the notice for whoever sent the request, even when the person it was sent to deletes it', async () => {
        signInAsGuest(7n);
        pendingRow('coordinator');
        profilesFound({ coordinator: coordinatorProfile, guest: guestProfile });
        const deleteMatching = jest
          .spyOn(notifications, 'deleteMatching')
          .mockResolvedValue();

        await service.remove(userId, '2001');
        expect(deleteMatching).toHaveBeenCalledWith({
          recipientId: 'auth0|guest',
          type: 'match',
          title: 'New interest',
          href: '/guest_lecturer/discovery?from=2001',
        });
      });

      it('deletes the request before its notice', async () => {
        signInAsGuest(7n);
        pendingRow('guest');
        profilesFound({ coordinator: coordinatorProfile, guest: guestProfile });
        const order: string[] = [];
        jest
          .spyOn(prisma.match_requests, 'deleteMany')
          .mockImplementation((() => {
            order.push('request');
            return Promise.resolve({ count: 1 });
          }) as never);
        jest.spyOn(notifications, 'deleteMatching').mockImplementation(() => {
          order.push('notice');
          return Promise.resolve();
        });

        await service.remove(userId, '2001');
        expect(order).toEqual(['request', 'notice']);
      });

      it('has no notice to delete when the other person has no account', async () => {
        signInAsGuest(7n);
        pendingRow('guest');
        profilesFound({
          coordinator: { ...coordinatorProfile, users: null },
          guest: guestProfile,
        });
        const deleteMatching = jest.spyOn(notifications, 'deleteMatching');

        await service.remove(userId, '2001');
        expect(deleteMatching).not.toHaveBeenCalled();
      });

      it('leaves every notice alone when ending a match', async () => {
        signInAsGuest(7n);
        existingRow('ACCEPTED');
        jest
          .spyOn(prisma.match_requests, 'updateMany')
          .mockResolvedValue({ count: 1 });
        jest.spyOn(notifications, 'create').mockResolvedValue({} as never);
        const deleteMatching = jest.spyOn(notifications, 'deleteMatching');

        await service.remove(userId, '2001');
        expect(deleteMatching).not.toHaveBeenCalled();
      });

      it('leaves every notice alone when there is no request to withdraw', async () => {
        signInAsGuest(7n);
        const deleteMatching = jest.spyOn(notifications, 'deleteMatching');

        await service.remove(userId, '2001');
        expect(deleteMatching).not.toHaveBeenCalled();
      });

      it('still withdraws the request when the notice cannot be removed, and logs only the error name', async () => {
        signInAsGuest(7n);
        pendingRow('guest');
        profilesFound({ coordinator: coordinatorProfile, guest: guestProfile });
        const deleteMany = jest
          .spyOn(prisma.match_requests, 'deleteMany')
          .mockResolvedValue({ count: 1 });
        jest.spyOn(notifications, 'deleteMatching').mockRejectedValue(
          Object.assign(new Error('failed for ada.lee@example.com'), {
            name: 'PrismaClientKnownRequestError',
          }),
        );
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        await expect(service.remove(userId, '2001')).resolves.toBeUndefined();
        expect(deleteMany).toHaveBeenCalledTimes(1);
        expect((warn.mock.calls as [string][]).map(([line]) => line)).toEqual([
          'Could not remove the notice for a withdrawn request: PrismaClientKnownRequestError',
        ]);
      });
    });

    it('ends a match by marking it unmatched, keeping the row', async () => {
      signInAsGuest(7n);
      existingRow('ACCEPTED');
      const deleteMany = jest.spyOn(prisma.match_requests, 'deleteMany');
      const updateMany = jest
        .spyOn(prisma.match_requests, 'updateMany')
        .mockResolvedValue({ count: 1 });
      jest.spyOn(notifications, 'create').mockResolvedValue({} as never);

      await service.remove(userId, '2001');
      expect(deleteMany).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { match_id: 6007n, status: 'ACCEPTED' },
          data: expect.objectContaining({ status: 'UNMATCHED' }) as unknown,
        }),
      );
    });

    it('cancels upcoming events and tells the other person', async () => {
      signInAsGuest(7n);
      existingRow('ACCEPTED');
      jest
        .spyOn(prisma.match_requests, 'updateMany')
        .mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValueOnce({
        first_name: 'Ada',
        last_name: 'Lee',
        users: { auth0Id: 'auth0|coordinator' },
      } as never);
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValueOnce({
        first_name: 'Sam',
        last_name: 'Tran',
        users: { auth0Id: 'auth0|guest' },
      } as never);
      const cancelEvents = jest.spyOn(prisma.events, 'updateManyAndReturn');
      const notify = jest
        .spyOn(notifications, 'create')
        .mockResolvedValue({} as never);

      await service.remove(userId, '2001');
      expect(cancelEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            match_id: 6007n,
            status: { in: ['invitation-sent', 'accepted'] },
          },
          data: { status: 'cancelled' },
        }),
      );
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'auth0|coordinator',
          title: 'Match ended',
        }),
      );
    });

    it('does nothing more when another unmatch already ended it', async () => {
      signInAsGuest(7n);
      existingRow('ACCEPTED');
      jest
        .spyOn(prisma.match_requests, 'updateMany')
        .mockResolvedValue({ count: 0 });
      const notify = jest.spyOn(notifications, 'create');
      const cancelEvents = jest.spyOn(prisma.events, 'updateManyAndReturn');
      const tellAdmins = jest.spyOn(notifications, 'createForAdmins');

      await service.remove(userId, '2001');
      expect(notify).not.toHaveBeenCalled();
      expect(cancelEvents).not.toHaveBeenCalled();
      expect(tellAdmins).not.toHaveBeenCalled();
    });

    describe('administrators', () => {
      const confirmed = {
        title: 'Cloud Security Talk',
        date: '2026-10-15',
        start_time: '10:00',
        end_time: '11:00',
        coordinator_name: 'Ada Lee',
        guest_lecturer_name: 'Sam Tran',
        responded_at: new Date('2026-10-02T03:00:00.000Z'),
      };
      const invited = {
        title: 'Follow-up Q&A',
        date: '2026-10-22',
        start_time: '13:00',
        end_time: '14:00',
        coordinator_name: 'Ada Lee',
        guest_lecturer_name: 'Sam Tran',
        responded_at: null,
      };

      /** An accepted match the guest ends, with `cancelled` the events the write returns. */
      function endMatch(cancelled: object[]) {
        signInAsGuest(7n);
        existingRow('ACCEPTED');
        jest
          .spyOn(prisma.match_requests, 'updateMany')
          .mockResolvedValue({ count: 1 });
        jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValueOnce({
          first_name: 'Ada',
          last_name: 'Lee',
          users: { auth0Id: 'auth0|coordinator' },
        } as never);
        jest.spyOn(prisma.guests, 'findUnique').mockResolvedValueOnce({
          first_name: 'Sam',
          last_name: 'Tran',
          users: { auth0Id: 'auth0|guest' },
        } as never);
        const notify = jest
          .spyOn(notifications, 'create')
          .mockResolvedValue({} as never);
        return {
          notify,
          cancelEvents: jest
            .spyOn(prisma.events, 'updateManyAndReturn')
            .mockResolvedValue(cancelled as never),
          tellAdmins: jest
            .spyOn(notifications, 'createForAdmins')
            .mockResolvedValue(2),
        };
      }

      it('are told about each confirmed or invited event the unmatch cancelled, in one call', async () => {
        const { tellAdmins } = endMatch([confirmed, invited]);

        await service.remove(userId, '2001');

        // One call for the lot, so the administrators are looked up once.
        expect(tellAdmins).toHaveBeenCalledTimes(1);
        expect(tellAdmins).toHaveBeenCalledWith([
          {
            type: 'event',
            title: 'Guest lecture cancelled',
            description:
              'Cloud Security Talk, 2026-10-15 10:00 to 11:00, Ada Lee with Sam Tran',
            actionLabel: 'View events',
            href: '/dashboard/events',
          },
          {
            type: 'event',
            title: 'Guest lecture invitation withdrawn',
            description:
              'Follow-up Q&A, 2026-10-22 13:00 to 14:00, Ada Lee with Sam Tran',
            actionLabel: 'View events',
            href: '/dashboard/events',
          },
        ]);
      });

      it('are told only after the cancellation has been written', async () => {
        const { cancelEvents, tellAdmins } = endMatch([confirmed]);

        await service.remove(userId, '2001');

        expect(cancelEvents.mock.invocationCallOrder[0]).toBeLessThan(
          tellAdmins.mock.invocationCallOrder[0],
        );
      });

      it('only cancel, and so only announce, events that were invited or confirmed', async () => {
        const { cancelEvents } = endMatch([]);

        await service.remove(userId, '2001');

        expect(cancelEvents).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              match_id: 6007n,
              status: { in: ['invitation-sent', 'accepted'] },
            },
          }),
        );
      });

      it('are not told when the unmatch cancelled nothing', async () => {
        const { tellAdmins } = endMatch([]);

        await service.remove(userId, '2001');

        expect(tellAdmins).not.toHaveBeenCalled();
      });

      it('failing to tell them does not stop the rest of the unmatch', async () => {
        const { tellAdmins, notify } = endMatch([confirmed, invited]);
        tellAdmins.mockRejectedValue(new Error('database busy'));
        jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);

        await expect(service.remove(userId, '2001')).resolves.toBeUndefined();

        // The other person was still told.
        expect(tellAdmins).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientId: 'auth0|coordinator',
            title: 'Match ended',
          }),
        );
      });
    });
  });
  describe('findAcceptedMatch and open reports', () => {
    /** Guest 7 (user 1 in the double) matched with coordinator 5, whose account is user 55. */
    function matchedGuest(status = 'ACCEPTED') {
      signInAsGuest(7n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6007n,
        coordinator_id: 5n,
        guest_id: 7n,
        status,
      } as never);
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValue({ user_id: 55n } as never);
    }

    /**
     * The audit trail: open reports as [reporter, reported] pairs, the reports
     * a decision was made about, and the people an administrator has held.
     */
    function trail(
      reports: [reporter: bigint, reported: string][],
      resolved: string[] = [],
      heldPeople: string[] = [],
    ) {
      // The open-reports query leaves out the decided reports.
      stubOpenReports(
        reports
          .map(([actor, target], i) => ({
            entry_id: BigInt(40 + i),
            actor_user_id: actor,
            target_id: target,
            detail: { reason: 'asked for money', matchId: '1' },
          }))
          .filter((r) => !resolved.includes(r.entry_id.toString())),
      );
      jest.spyOn(prisma.audit_entries, 'findMany').mockResolvedValueOnce(
        heldPeople.map((target_id) => ({
          action: 'user.held',
          target_id,
          // Placed for the report listed first, which is entry 40.
          detail: { reportIds: ['40'] },
        })) as never,
      );
    }

    const paused = { response: { code: 'CONVERSATION_PAUSED' } };

    it('opens the conversation when nobody has been reported', async () => {
      matchedGuest();

      await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
        side: 'guest',
        matchId: 6007n,
      });
    });

    describe('between the two people with a report between them', () => {
      it('refuses when the caller reported the other person', async () => {
        matchedGuest();
        // The double resolves the caller to user 1.
        trail([[1n, '55']]);

        const attempt = service.findAcceptedMatch(userId, '5');

        await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
        await expect(attempt).rejects.toMatchObject(paused);
      });

      it('does not tell the person who was reported that anyone reported them', async () => {
        matchedGuest();
        // The caller is the person reported: user 55 reported user 1.
        trail([[55n, '1']]);

        const attempt = service.findAcceptedMatch(userId, '5');

        await expect(attempt).rejects.toMatchObject(paused);
        await expect(attempt).rejects.toMatchObject({
          response: {
            message: "You can't send messages in this conversation right now.",
          },
        });
        const { message } = (
          (await attempt.catch((e: unknown) => e)) as ForbiddenException
        ).getResponse() as { message: string };
        expect(message).not.toMatch(/report|administrator|review|dismiss/i);
      });

      it('refuses when the other person reported the caller', async () => {
        matchedGuest();
        trail([[55n, '1']]);

        await expect(
          service.findAcceptedMatch(userId, '5'),
        ).rejects.toMatchObject(paused);
      });

      it('opens again once the report is dismissed', async () => {
        matchedGuest();
        trail([[1n, '55']], ['40']);

        await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
          side: 'guest',
          matchId: 6007n,
        });
      });
    });

    describe('with a report that is not between these two', () => {
      it('is not held up by one person reporting the other person', async () => {
        matchedGuest();
        trail([[900n, '55']]);

        await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
          side: 'guest',
          matchId: 6007n,
        });
      });

      it('is not held up by the caller reporting somebody else', async () => {
        matchedGuest();
        trail([[1n, '900']]);

        await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
          side: 'guest',
          matchId: 6007n,
        });
      });

      it('is not held up by two strangers reporting each other', async () => {
        matchedGuest();
        trail([[900n, '901']]);

        await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
          side: 'guest',
          matchId: 6007n,
        });
      });
    });

    describe('when somebody is on hold', () => {
      it('refuses when two different people reported the other person', async () => {
        matchedGuest();
        trail([
          [900n, '55'],
          [901n, '55'],
        ]);

        await expect(
          service.findAcceptedMatch(userId, '5'),
        ).rejects.toMatchObject(paused);
      });

      it('refuses when two different people reported the caller', async () => {
        matchedGuest();
        trail([
          [900n, '1'],
          [901n, '1'],
        ]);

        await expect(
          service.findAcceptedMatch(userId, '5'),
        ).rejects.toMatchObject(paused);
      });

      it('does not count the same person reporting twice', async () => {
        matchedGuest();
        trail([
          [900n, '55'],
          [900n, '55'],
        ]);

        await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
          side: 'guest',
          matchId: 6007n,
        });
      });

      it('refuses when an administrator holds the other person', async () => {
        matchedGuest();
        trail([[900n, '55']], [], ['55']);

        await expect(
          service.findAcceptedMatch(userId, '5'),
        ).rejects.toMatchObject(paused);
      });

      it('opens again when a dismissal brings the reports under the threshold', async () => {
        matchedGuest();
        trail(
          [
            [900n, '55'],
            [901n, '55'],
          ],
          ['40'],
        );

        await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
          side: 'guest',
          matchId: 6007n,
        });
      });
    });

    it('keeps the not-matched refusal ahead of the report check', async () => {
      matchedGuest('PENDING');
      trail([[1n, '55']]);

      await expect(
        service.findAcceptedMatch(userId, '5'),
      ).rejects.toMatchObject({
        response: {
          message: 'You can only message people you have matched with.',
        },
      });
    });
  });

  describe('findReadableMatch', () => {
    /** Guest 7 (user 1 in the double) matched with coordinator 5, whose account is user 55. */
    function matchedGuest(status = 'ACCEPTED') {
      signInAsGuest(7n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6007n,
        coordinator_id: 5n,
        guest_id: 7n,
        status,
      } as never);
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValue({ user_id: 55n } as never);
    }
    const report = (reporter: bigint, reported: string, entry = 40n) => ({
      entry_id: entry,
      actor_user_id: reporter,
      target_id: reported,
      detail: { reason: 'asked for money', matchId: '1' },
    });

    it('opens an accepted match when nobody has been reported', async () => {
      matchedGuest();

      await expect(service.findReadableMatch(userId, '5')).resolves.toEqual({
        side: 'guest',
        matchId: 6007n,
      });
    });

    it.each([
      ['the caller reported the other person', [report(1n, '55')]],
      ['the other person reported the caller', [report(55n, '1')]],
      [
        'the other person is held for everybody',
        [report(900n, '55', 40n), report(901n, '55', 41n)],
      ],
      [
        'the caller is held for everybody',
        [report(900n, '1', 40n), report(901n, '1', 41n)],
      ],
    ])('still opens it when %s', async (_name, reports) => {
      matchedGuest();
      const reads = stubOpenReports(reports);

      await expect(service.findReadableMatch(userId, '5')).resolves.toEqual({
        side: 'guest',
        matchId: 6007n,
      });
      // The reports are not even looked at: they cannot change what is read.
      expect(reads).not.toHaveBeenCalled();
    });

    it('still refuses a match that was not accepted', async () => {
      matchedGuest('PENDING');

      const attempt = service.findReadableMatch(userId, '5');

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({
        response: {
          message: 'You can only message people you have matched with.',
        },
      });
    });
  });

  describe('findAcceptedCounterpart', () => {
    it('names the other person account and the match', async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6001n,
        coordinator_id: 5n,
        guest_id: 3001n,
        status: 'ACCEPTED',
      } as never);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValue({ user_id: 77n } as never);

      await expect(
        service.findAcceptedCounterpart(userId, '3001'),
      ).resolves.toEqual({
        matchId: 6001n,
        callerUserId: 1n,
        counterpartUserId: 77n,
      });
    });

    it('still names the other person after the match was ended, so they can be reported', async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6001n,
        coordinator_id: 5n,
        guest_id: 3001n,
        status: 'UNMATCHED',
      } as never);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValue({ user_id: 77n } as never);

      await expect(
        service.findAcceptedCounterpart(userId, '3001'),
      ).resolves.toEqual({
        matchId: 6001n,
        callerUserId: 1n,
        counterpartUserId: 77n,
      });
    });

    it.each(['PENDING', 'REJECTED', null])(
      'refuses a request that never became a match (%s)',
      async (status) => {
        signInAsCoordinator(5n);
        jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
          match_id: 6001n,
          coordinator_id: 5n,
          guest_id: 3001n,
          status,
        } as never);

        await expect(
          service.findAcceptedCounterpart(userId, '3001'),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it('refuses without an accepted match, in its own words', async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue(null);

      await expect(
        service.findAcceptedCounterpart(userId, '3001'),
      ).rejects.toMatchObject({
        response: {
          message: 'You can only report someone you have matched with.',
        },
      });
    });

    it('is not refused because the other person is already reported', async () => {
      signInAsCoordinator(5n);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6001n,
        coordinator_id: 5n,
        guest_id: 3001n,
        status: 'ACCEPTED',
      } as never);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValue({ user_id: 77n } as never);
      const audit = jest.spyOn(prisma.audit_entries, 'findMany');

      await service.findAcceptedCounterpart(userId, '3001');

      expect(audit).not.toHaveBeenCalled();
    });
  });
});
