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
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 3001n } as never);
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
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 2001n } as never);
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
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 2001n } as never)
        .mockResolvedValueOnce({
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
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 2001n } as never);
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
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 2001n } as never);
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
      // Each pass through create resolves the caller and checks the target.
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 5n } as never)
        .mockResolvedValueOnce({ coordinator_id: 5n } as never);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 3001n } as never)
        .mockResolvedValueOnce({ guest_id: 3001n } as never);
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
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 3001n } as never);
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
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValueOnce(null);

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
     * Signs the caller in on one side and queues what the service reads
     * after saving, in the order it reads it: the target's existence check
     * first, then both profiles for the notice.
     */
    function askAs(
      side: 'coordinator' | 'guest',
      profiles: { coordinator: object | null; guest: object | null },
    ) {
      const coordinators = jest.spyOn(prisma.coordinators, 'findUnique');
      const guests = jest.spyOn(prisma.guests, 'findUnique');
      if (side === 'coordinator') {
        coordinators.mockResolvedValueOnce({ coordinator_id: 5n } as never);
        guests.mockResolvedValueOnce({ guest_id: 7n } as never);
      } else {
        coordinators.mockResolvedValueOnce(null);
        guests.mockResolvedValueOnce({ guest_id: 7n } as never);
        coordinators.mockResolvedValueOnce({ coordinator_id: 5n } as never);
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
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValueOnce(null);
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await expect(service.create(userId, '7')).rejects.toThrow(
        NotFoundException,
      );
      expect(interest).not.toHaveBeenCalled();
    });

    it('sends nothing when the contact limit refuses the request', async () => {
      signInAsCoordinator(5n);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 7n } as never);
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
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 7n } as never);
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
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 7n } as never);
      jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue(newRow('coordinator'));
      const interest = jest.spyOn(notifications, 'createUnlessRecent');

      await service.create(userId, '7');
      expect(interest).not.toHaveBeenCalled();
    });

    it('notifies once when the same person withdraws and asks again within a day', async () => {
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
      const cancelEvents = jest.spyOn(prisma.events, 'updateMany');
      const notify = jest
        .spyOn(notifications, 'create')
        .mockResolvedValue({} as never);

      await service.remove(userId, '2001');
      expect(cancelEvents).toHaveBeenCalledWith({
        where: {
          match_id: 6007n,
          status: { in: ['invitation-sent', 'accepted'] },
        },
        data: { status: 'cancelled' },
      });
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

      await service.remove(userId, '2001');
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
