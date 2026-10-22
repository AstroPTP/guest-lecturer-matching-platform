import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { prisma } from '../prisma';

describe('EventsService', () => {
  let service: EventsService;
  let notificationsService: {
    create: jest.Mock;
    createForAdmins: jest.Mock;
  };
  let matchRequests: {
    findAcceptedMatch: jest.Mock;
    findAcceptedMatches: jest.Mock;
  };

  const createdAt = new Date('2026-10-01T02:00:00.000Z');

  const dto: CreateEventDto = {
    matchId: '6007',
    coordinatorName: 'Dr. Smith',
    guestLecturerId: '3002',
    guestLecturerName: 'Jane Doe',
    title: 'Cloud Security Talk',
    description: 'Intro to cloud security',
    date: '2026-10-15',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Building 401',
    format: 'face-to-face',
  };

  function eventRow(overrides: Record<string, unknown> = {}) {
    return {
      event_id: 1n,
      match_id: 6007n,
      coordinator_name: 'Dr. Smith',
      guest_lecturer_name: 'Jane Doe',
      title: 'Cloud Security Talk',
      description: 'Intro to cloud security',
      date: '2026-10-15',
      start_time: '10:00',
      end_time: '11:00',
      location: 'Building 401',
      format: 'face-to-face',
      status: 'invitation-sent',
      created_at: createdAt,
      responded_at: null,
      completed_at: null,
      match: {
        coordinator_id: 2005n,
        guest_id: 3002n,
        coordinator: { users: { auth0Id: 'auth0|coordinator' } },
        guest: { users: { auth0Id: 'auth0|guest' } },
      },
      ...overrides,
    };
  }

  function signInAs(side: 'coordinator' | 'guest') {
    matchRequests.findAcceptedMatches.mockResolvedValue({
      side,
      matches: [
        { matchId: 6007n, targetId: side === 'guest' ? '2005' : '3002' },
      ],
    });
  }

  /**
   * Stands in for the events table, so that a status moves the way it does in
   * the database. The conditional write checks the status it finds when it
   * runs, and a later read sees what an earlier write left.
   */
  function fakeEvents(initialStatus = 'invitation-sent') {
    let row = eventRow({ status: initialStatus });
    jest
      .spyOn(prisma.events, 'findUnique')
      .mockImplementation(() => Promise.resolve({ ...row }) as never);
    const updateMany = jest
      .spyOn(prisma.events, 'updateMany')
      .mockImplementation(((args: {
        where: { status: { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        if (!args.where.status.in.includes(row.status)) {
          return Promise.resolve({ count: 0 });
        }
        row = { ...row, ...args.data };
        return Promise.resolve({ count: 1 });
      }) as never);
    return { updateMany, current: () => row };
  }

  beforeEach(async () => {
    notificationsService = {
      create: jest.fn(),
      createForAdmins: jest.fn().mockResolvedValue(2),
    };
    matchRequests = {
      findAcceptedMatch: jest.fn(),
      findAcceptedMatches: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: MatchRequestsService, useValue: matchRequests },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it("stores the event against the caller's match with the matched guest", async () => {
      matchRequests.findAcceptedMatch.mockResolvedValue({
        side: 'coordinator',
        matchId: 6007n,
      });
      const create = jest
        .spyOn(prisma.events, 'create')
        .mockResolvedValue(eventRow());

      await expect(service.create(dto, 'auth0|coordinator')).resolves.toEqual(
        expect.objectContaining({
          id: '1',
          matchId: '6007',
          coordinatorId: '2005',
          guestLecturerId: '3002',
          status: 'invitation-sent',
        }),
      );
      expect(matchRequests.findAcceptedMatch).toHaveBeenCalledWith(
        'auth0|coordinator',
        '3002',
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ match_id: 6007n }) as unknown,
        }),
      );
    });

    it('notifies the guest lecturer at their Auth0 id, not their profile id', async () => {
      matchRequests.findAcceptedMatch.mockResolvedValue({
        side: 'coordinator',
        matchId: 6007n,
      });
      jest.spyOn(prisma.events, 'create').mockResolvedValue(eventRow());

      await service.create(dto, 'auth0|coordinator');
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'auth0|guest',
          type: 'event',
          title: 'New event invitation',
        }),
      );
    });

    it('refuses a guest lecturer', async () => {
      matchRequests.findAcceptedMatch.mockResolvedValue({
        side: 'guest',
        matchId: 6007n,
      });

      await expect(service.create(dto, 'auth0|guest')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it.each([
      ['ends before it starts', '11:00', '10:00'],
      ['ends when it starts', '10:00', '10:00'],
    ])('refuses a session that %s', async (_name, startTime, endTime) => {
      matchRequests.findAcceptedMatch.mockResolvedValue({
        side: 'coordinator',
        matchId: 6007n,
      });
      const create = jest.spyOn(prisma.events, 'create');

      await expect(
        service.create({ ...dto, startTime, endTime }, 'auth0|coordinator'),
      ).rejects.toThrow(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('findMine', () => {
    it("returns events from the caller's matches", async () => {
      signInAs('guest');
      const findMany = jest
        .spyOn(prisma.events, 'findMany')
        .mockResolvedValue([eventRow()] as never);

      await expect(service.findMine('auth0|guest')).resolves.toHaveLength(1);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { match_id: { in: [6007n] } } }),
      );
    });

    it('returns nothing without any matches', async () => {
      matchRequests.findAcceptedMatches.mockResolvedValue({
        side: 'guest',
        matches: [],
      });

      await expect(service.findMine('auth0|guest')).resolves.toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('lets the invited guest lecturer accept, sets respondedAt and notifies the coordinator', async () => {
      signInAs('guest');
      const { updateMany } = fakeEvents();

      const accepted = await service.updateStatus(
        '1',
        'accepted',
        'auth0|guest',
      );

      expect(accepted).toEqual(
        expect.objectContaining({
          status: 'accepted',
          respondedAt: expect.any(String) as unknown,
        }),
      );
      // Written once, and only from the one status an invitation can be
      // answered from.
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event_id: 1n, status: { in: ['invitation-sent'] } },
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'auth0|coordinator',
          title: 'Invitation accepted',
        }),
      );
    });

    it('lets the coordinator cancel and notifies the guest lecturer', async () => {
      signInAs('coordinator');
      fakeEvents();

      await service.updateStatus('1', 'cancelled', 'auth0|coordinator');
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'auth0|guest',
          title: 'Event cancelled',
        }),
      );
    });

    it('stops a coordinator from accepting on the guest lecturer’s behalf', async () => {
      signInAs('coordinator');
      jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(eventRow());

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|coordinator'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('stops a guest lecturer from cancelling', async () => {
      signInAs('guest');
      jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(eventRow());

      await expect(
        service.updateStatus('1', 'cancelled', 'auth0|guest'),
      ).rejects.toThrow(ForbiddenException);
    });

    it("reports an event outside the caller's matches as not found", async () => {
      signInAs('guest');
      jest
        .spyOn(prisma.events, 'findUnique')
        .mockResolvedValue(eventRow({ match_id: 9999n }));

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an event that does not exist', async () => {
      signInAs('guest');

      await expect(
        service.updateStatus('404', 'accepted', 'auth0|guest'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('administrators', () => {
    const noticeFor = (title: string) =>
      expect.objectContaining({
        type: 'event',
        title,
        description:
          'Cloud Security Talk, 2026-10-15 10:00 to 11:00, Dr. Smith with Jane Doe',
        actionLabel: 'View events',
        href: '/dashboard/events',
      }) as unknown;

    function respondTo(
      side: 'coordinator' | 'guest',
      from: string,
      _to: string,
    ) {
      signInAs(side);
      return fakeEvents(from);
    }

    it('are told when the guest lecturer confirms', async () => {
      respondTo('guest', 'invitation-sent', 'accepted');

      await service.updateStatus('1', 'accepted', 'auth0|guest');

      expect(notificationsService.createForAdmins).toHaveBeenCalledTimes(1);
      expect(notificationsService.createForAdmins).toHaveBeenCalledWith(
        noticeFor('Guest lecture confirmed'),
      );
    });

    it('are told when the coordinator cancels a confirmed session', async () => {
      respondTo('coordinator', 'accepted', 'cancelled');

      await service.updateStatus('1', 'cancelled', 'auth0|coordinator');

      expect(notificationsService.createForAdmins).toHaveBeenCalledTimes(1);
      expect(notificationsService.createForAdmins).toHaveBeenCalledWith(
        noticeFor('Guest lecture cancelled'),
      );
    });

    it('are told when the coordinator cancels an invitation', async () => {
      respondTo('coordinator', 'invitation-sent', 'cancelled');

      await service.updateStatus('1', 'cancelled', 'auth0|coordinator');

      expect(notificationsService.createForAdmins).toHaveBeenCalledWith(
        noticeFor('Guest lecture cancelled'),
      );
    });

    it('are not told when the guest lecturer declines', async () => {
      respondTo('guest', 'invitation-sent', 'declined');

      await service.updateStatus('1', 'declined', 'auth0|guest');

      expect(notificationsService.createForAdmins).not.toHaveBeenCalled();
    });

    it('are not told when a session is marked complete', async () => {
      respondTo('coordinator', 'accepted', 'completed');

      await service.updateStatus('1', 'completed', 'auth0|coordinator');

      expect(notificationsService.createForAdmins).not.toHaveBeenCalled();
    });

    it('are told once: a fan-out call carries no recipient of its own', async () => {
      respondTo('guest', 'invitation-sent', 'accepted');

      await service.updateStatus('1', 'accepted', 'auth0|guest');

      const [notice] = notificationsService.createForAdmins.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(notice).not.toHaveProperty('recipientId');
    });

    it('failing to be told does not fail the confirmation', async () => {
      respondTo('guest', 'invitation-sent', 'accepted');
      notificationsService.createForAdmins.mockRejectedValue(
        new Error('database busy'),
      );
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ).resolves.toEqual(expect.objectContaining({ status: 'accepted' }));
    });
  });

  describe('a response that is out of date', () => {
    it('cannot confirm an invitation the coordinator has cancelled', async () => {
      signInAs('guest');
      const { current } = fakeEvents('cancelled');

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ).rejects.toThrow(
        new ConflictException(
          'This session is cancelled, so it cannot be marked accepted.',
        ),
      );
      expect(current().status).toBe('cancelled');
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(notificationsService.createForAdmins).not.toHaveBeenCalled();
    });

    it('says why in the error the person sees, not the generic conflict text', async () => {
      signInAs('guest');
      fakeEvents('cancelled');

      const error = await service
        .updateStatus('1', 'accepted', 'auth0|guest')
        .then(
          () => undefined,
          (caught: unknown) => caught as ConflictException,
        );

      expect(error?.getResponse()).toEqual({
        code: 'CONFLICT',
        message: 'This session is cancelled, so it cannot be marked accepted.',
      });
    });

    it('cannot decline after accepting', async () => {
      signInAs('guest');
      fakeEvents('accepted');

      await expect(
        service.updateStatus('1', 'declined', 'auth0|guest'),
      ).rejects.toThrow(ConflictException);
    });

    it('cannot complete a session that was never confirmed', async () => {
      signInAs('coordinator');
      fakeEvents('invitation-sent');

      await expect(
        service.updateStatus('1', 'completed', 'auth0|coordinator'),
      ).rejects.toThrow(ConflictException);
    });

    it('is refused when the same answer is sent again, and tells nobody again', async () => {
      signInAs('guest');
      fakeEvents('accepted');

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ).rejects.toThrow(ConflictException);
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(notificationsService.createForAdmins).not.toHaveBeenCalled();
    });

    it('reports an event deleted in the meantime as not found', async () => {
      signInAs('guest');
      jest
        .spyOn(prisma.events, 'findUnique')
        .mockResolvedValueOnce(eventRow())
        .mockResolvedValueOnce(null);
      jest.spyOn(prisma.events, 'updateMany').mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('two requests at once on the same event', () => {
    /** Each caller gets their own side of the match. */
    function signInBoth() {
      matchRequests.findAcceptedMatches.mockImplementation((auth0Id: string) =>
        Promise.resolve({
          side: auth0Id === 'auth0|guest' ? 'guest' : 'coordinator',
          matches: [{ matchId: 6007n, targetId: '1' }],
        }),
      );
    }

    it('lets the first of two accepts through and refuses the second without a second notice', async () => {
      signInBoth();
      const { updateMany, current } = fakeEvents();

      const results = await Promise.allSettled([
        service.updateStatus('1', 'accepted', 'auth0|guest'),
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );
      // Both reached the write; only one changed the row.
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(current().status).toBe('accepted');
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.createForAdmins).toHaveBeenCalledTimes(1);
    });

    it('lets an accept and a decline sent together settle on one of them', async () => {
      signInBoth();
      const { current } = fakeEvents();

      const results = await Promise.allSettled([
        service.updateStatus('1', 'accepted', 'auth0|guest'),
        service.updateStatus('1', 'declined', 'auth0|guest'),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(current().status).toBe('accepted');
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      // The decline that lost never told the administrators anything.
      expect(notificationsService.createForAdmins).toHaveBeenCalledTimes(1);
      expect(notificationsService.createForAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Guest lecture confirmed' }),
      );
    });

    it('does not let an accept undo a cancel that landed first, or tell the administrators it was confirmed', async () => {
      signInBoth();
      const { current } = fakeEvents();

      const results = await Promise.allSettled([
        service.updateStatus('1', 'cancelled', 'auth0|coordinator'),
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect((results[1] as PromiseRejectedResult).reason).toEqual(
        new ConflictException(
          'This session is cancelled, so it cannot be marked accepted.',
        ),
      );
      expect(current().status).toBe('cancelled');
      expect(notificationsService.createForAdmins).toHaveBeenCalledTimes(1);
      expect(notificationsService.createForAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Guest lecture cancelled' }),
      );
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Event cancelled' }),
      );
    });
  });

  describe('who can accept', () => {
    it('lets only the guest lecturer the event was sent to confirm it', async () => {
      // A different guest lecturer, matched to someone else.
      matchRequests.findAcceptedMatches.mockResolvedValue({
        side: 'guest',
        matches: [{ matchId: 7000n, targetId: '2999' }],
      });
      jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(eventRow());
      const update = jest.spyOn(prisma.events, 'updateMany');

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|other-guest'),
      ).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(notificationsService.createForAdmins).not.toHaveBeenCalled();
    });

    it('does not let the coordinator confirm for the guest lecturer', async () => {
      signInAs('coordinator');
      jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(eventRow());
      const update = jest.spyOn(prisma.events, 'updateMany');

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|coordinator'),
      ).rejects.toThrow(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('prefill', () => {
    const coordinatorProfile = {
      user_id: 11n,
      first_name: 'Cara',
      last_name: 'Coord',
      learning_objective: 'Apply theory to a live campaign',
      discipline: 'Marketing',
      duration: '60-minutes',
      location: 'Building 402',
      format_online: true,
      format_inperson: true,
      format_prerecorded: false,
    };
    const guestProfile = {
      user_id: 12n,
      first_name: 'Greta',
      last_name: 'Gray',
      format_online: true,
      format_inperson: false,
      format_prerecorded: false,
    };

    function stubProfiles() {
      const match = jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue({
          guest_id: 3002n,
          coordinator: coordinatorProfile,
          guest: guestProfile,
        } as never);
      const topics = jest
        .spyOn(prisma.user_expertise, 'findMany')
        .mockResolvedValue([
          { user_id: 11n, expertise: 'Marketing Strategy' },
          { user_id: 11n, expertise: 'Management' },
          { user_id: 12n, expertise: 'Marketing Strategy' },
          { user_id: 12n, expertise: 'Economics' },
        ] as never);
      return { match, topics };
    }

    it("is read from the caller's own accepted match only", async () => {
      matchRequests.findAcceptedMatch.mockResolvedValue({
        side: 'coordinator',
        matchId: 6007n,
      });
      const { match, topics } = stubProfiles();

      const prefill = await service.prefill('3002', 'auth0|coordinator');

      expect(matchRequests.findAcceptedMatch).toHaveBeenCalledWith(
        'auth0|coordinator',
        '3002',
      );
      expect(match).toHaveBeenCalledWith(
        expect.objectContaining({ where: { match_id: 6007n } }),
      );
      expect(topics).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: { in: [11n, 12n] } } }),
      );
      expect(prefill).toEqual({
        matchId: '6007',
        guestLecturerId: '3002',
        guestLecturerName: 'Greta Gray',
        coordinatorName: 'Cara Coord',
        title: 'Apply theory to a live campaign',
        description:
          'Guest lecture by Greta Gray, invited by Cara Coord. Shared topics: Marketing Strategy.',
        format: 'online',
        location: 'Building 402',
        durationMinutes: 60,
        sharedTopics: ['Marketing Strategy'],
      });
    });

    it('is refused, and reads nothing, for someone who is not matched', async () => {
      matchRequests.findAcceptedMatch.mockRejectedValue(
        new ForbiddenException(
          'You can only message people you have matched with.',
        ),
      );
      const match = jest.spyOn(prisma.match_requests, 'findUnique');
      const topics = jest.spyOn(prisma.user_expertise, 'findMany');

      await expect(
        service.prefill('3002', 'auth0|coordinator'),
      ).rejects.toThrow(ForbiddenException);
      expect(match).not.toHaveBeenCalled();
      expect(topics).not.toHaveBeenCalled();
    });

    it('is refused for a guest lecturer', async () => {
      matchRequests.findAcceptedMatch.mockResolvedValue({
        side: 'guest',
        matchId: 6007n,
      });
      const match = jest.spyOn(prisma.match_requests, 'findUnique');

      await expect(service.prefill('2005', 'auth0|guest')).rejects.toThrow(
        ForbiddenException,
      );
      expect(match).not.toHaveBeenCalled();
    });
  });

  describe('calendarFile', () => {
    function stubEvent(overrides: Record<string, unknown> = {}) {
      return jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(
        eventRow({
          status: 'accepted',
          responded_at: createdAt,
          ...overrides,
        }),
      );
    }

    it.each(['coordinator', 'guest'] as const)(
      'is given to the %s of a confirmed session',
      async (side) => {
        signInAs(side);
        stubEvent();

        const { eventId, ics: folded } = await service.calendarFile(
          '1',
          'auth0|caller',
        );
        // Long lines are folded; read them back as one.
        const ics = folded.replace(/\r\n /g, '');

        expect(eventId).toBe('1');
        expect(ics).toContain('UID:event-1@glmp');
        expect(ics).toContain('DTSTART;TZID=Australia/Perth:20261015T100000');
        expect(ics).toContain('DTEND;TZID=Australia/Perth:20261015T110000');
        expect(ics).toContain('SUMMARY:Cloud Security Talk');
        expect(ics).toContain('LOCATION:Building 401');
        expect(ics).toContain('Coordinator: Dr. Smith');
        expect(ics).toContain('Guest lecturer: Jane Doe');
      },
    );

    it('is reported as missing for someone outside the match', async () => {
      matchRequests.findAcceptedMatches.mockResolvedValue({
        side: 'coordinator',
        matches: [{ matchId: 7000n, targetId: '3999' }],
      });
      stubEvent();

      await expect(service.calendarFile('1', 'auth0|outsider')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each(['invitation-sent', 'declined', 'cancelled', 'completed'])(
      'is reported as missing while the session is %s',
      async (status) => {
        signInAs('guest');
        stubEvent({ status });

        await expect(service.calendarFile('1', 'auth0|guest')).rejects.toThrow(
          NotFoundException,
        );
      },
    );

    it('is reported as missing for an event that does not exist', async () => {
      signInAs('guest');

      await expect(service.calendarFile('404', 'auth0|guest')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('is reported as missing for someone with no profile', async () => {
      matchRequests.findAcceptedMatches.mockRejectedValue(
        new ForbiddenException(
          'Complete your profile before sending match requests.',
        ),
      );
      const find = jest.spyOn(prisma.events, 'findUnique');

      await expect(service.calendarFile('1', 'auth0|new')).rejects.toThrow(
        NotFoundException,
      );
      expect(find).not.toHaveBeenCalled();
    });

    it('looks only at matches that are still accepted', async () => {
      signInAs('guest');
      stubEvent();

      await service.calendarFile('1', 'auth0|guest');

      expect(matchRequests.findAcceptedMatches).toHaveBeenCalledWith(
        'auth0|guest',
      );
    });

    it('refuses an id that is not a number', async () => {
      signInAs('guest');

      await expect(service.calendarFile('abc', 'auth0|guest')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
