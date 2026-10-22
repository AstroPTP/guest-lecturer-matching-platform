import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
      const notify = jest
        .spyOn(notifications, 'create')
        .mockResolvedValue({} as never);

      await expect(service.create(userId, '2001')).resolves.toEqual(
        expect.objectContaining({ status: 'ACCEPTED', sentByMe: false }),
      );
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

    /** The reports the audit trail holds, and the decisions made about them. */
    function reports(
      targets: { id: bigint; user: string; matchId?: string }[],
      resolved: string[] = [],
    ) {
      jest
        .spyOn(prisma.audit_entries, 'findMany')
        .mockResolvedValueOnce(
          targets.map((t) => ({
            entry_id: t.id,
            target_id: t.user,
            detail: { reason: 'asked for money', matchId: t.matchId ?? '1' },
            actor: null,
          })) as never,
        )
        .mockResolvedValueOnce(
          resolved.map((target_id) => ({ target_id })) as never,
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

    it('refuses when the person on the other side has an open report', async () => {
      matchedGuest();
      reports([{ id: 40n, user: '55' }]);

      const attempt = service.findAcceptedMatch(userId, '5');

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject(paused);
    });

    it('refuses when the caller is the one with an open report', async () => {
      matchedGuest();
      // The double resolves the caller to user 1.
      reports([{ id: 40n, user: '1' }]);

      await expect(
        service.findAcceptedMatch(userId, '5'),
      ).rejects.toMatchObject(paused);
    });

    it('is not held up by a report about somebody else', async () => {
      matchedGuest();
      reports([{ id: 40n, user: '900' }]);

      await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
        side: 'guest',
        matchId: 6007n,
      });
    });

    it('opens again once the report is dismissed', async () => {
      matchedGuest();
      reports([{ id: 40n, user: '55' }], ['40']);

      await expect(service.findAcceptedMatch(userId, '5')).resolves.toEqual({
        side: 'guest',
        matchId: 6007n,
      });
    });

    it('keeps the not-matched refusal ahead of the report check', async () => {
      matchedGuest('PENDING');
      reports([{ id: 40n, user: '55' }]);

      await expect(
        service.findAcceptedMatch(userId, '5'),
      ).rejects.toMatchObject({
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
