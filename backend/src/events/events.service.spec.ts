import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { prisma } from '../prisma';

describe('EventsService', () => {
  let service: EventsService;
  let notificationsService: { create: jest.Mock };
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

  beforeEach(async () => {
    notificationsService = { create: jest.fn() };
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
      jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(eventRow());
      jest
        .spyOn(prisma.events, 'update')
        .mockResolvedValue(
          eventRow({ status: 'accepted', responded_at: createdAt }),
        );

      await expect(
        service.updateStatus('1', 'accepted', 'auth0|guest'),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'accepted',
          respondedAt: createdAt.toISOString(),
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
      jest.spyOn(prisma.events, 'findUnique').mockResolvedValue(eventRow());
      jest
        .spyOn(prisma.events, 'update')
        .mockResolvedValue(eventRow({ status: 'cancelled' }));

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
});
