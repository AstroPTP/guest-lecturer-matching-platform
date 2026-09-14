import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventsService } from './events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEventDto } from './dto/create-event.dto';

describe('EventsService', () => {
  let service: EventsService;
  let notificationsService: { create: jest.Mock };

  const coordinatorId = 'coordinator-1';
  const guestLecturerId = 'lecturer-1';

  const baseDto: CreateEventDto = {
    matchId: 'match-1',
    coordinatorName: 'Dr. Smith',
    guestLecturerId,
    guestLecturerName: 'Jane Doe',
    title: 'Cloud Security Talk',
    description: 'Intro to cloud security',
    date: '2026-10-01',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Building 401',
    format: 'face-to-face' as const,
  };

  beforeEach(async () => {
    notificationsService = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an event with an invitation-sent status and generated id', () => {
      const event = service.create(baseDto, coordinatorId);

      expect(event.id).toBeDefined();
      expect(event.coordinatorId).toBe(coordinatorId);
      expect(event.status).toBe('invitation-sent');
      expect(event.createdAt).toBeDefined();
      expect(event.title).toBe(baseDto.title);
    });

    it('should notify the guest lecturer of the new invitation', () => {
      const event = service.create(baseDto, coordinatorId);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: event.guestLecturerId,
          type: 'event',
          title: 'New event invitation',
          href: '/guest_lecturer/events',
        }),
      );
    });

    it('should add the event to findAll results', () => {
      service.create(baseDto, coordinatorId);

      expect(service.findAll()).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return the event when it exists', () => {
      const created = service.create(baseDto, coordinatorId);

      expect(service.findOne(created.id)).toEqual(created);
    });

    it('should throw NotFoundException when the event does not exist', () => {
      expect(() => service.findOne('missing-id')).toThrow(NotFoundException);
    });
  });

  describe('findByCoordinator', () => {
    it('should return only events for the given coordinator', () => {
      service.create(baseDto, coordinatorId);
      service.create(baseDto, 'other-coordinator');

      const results = service.findByCoordinator(coordinatorId);

      expect(results).toHaveLength(1);
      expect(results[0].coordinatorId).toBe(coordinatorId);
    });
  });

  describe('findByGuestLecturer', () => {
    it('should return only events for the given guest lecturer', () => {
      service.create(baseDto, coordinatorId);
      service.create(
        { ...baseDto, guestLecturerId: 'other-lecturer' },
        coordinatorId,
      );

      const results = service.findByGuestLecturer(guestLecturerId);

      expect(results).toHaveLength(1);
      expect(results[0].guestLecturerId).toBe(guestLecturerId);
    });
  });

  describe('updateStatus', () => {
    it('should allow the invited guest lecturer to accept and set respondedAt', () => {
      const created = service.create(baseDto, coordinatorId);

      const updated = service.updateStatus(
        created.id,
        'accepted',
        guestLecturerId,
      );

      expect(updated.status).toBe('accepted');
      expect(updated.respondedAt).toBeDefined();
    });

    it('should allow the invited guest lecturer to decline and set respondedAt', () => {
      const created = service.create(baseDto, coordinatorId);

      const updated = service.updateStatus(
        created.id,
        'declined',
        guestLecturerId,
      );

      expect(updated.status).toBe('declined');
      expect(updated.respondedAt).toBeDefined();
    });

    it('should throw ForbiddenException if someone other than the guest lecturer tries to accept', () => {
      const created = service.create(baseDto, coordinatorId);

      expect(() =>
        service.updateStatus(created.id, 'accepted', 'someone-else'),
      ).toThrow(ForbiddenException);
    });

    it('should allow the coordinator to cancel the event', () => {
      const created = service.create(baseDto, coordinatorId);

      const updated = service.updateStatus(
        created.id,
        'cancelled',
        coordinatorId,
      );

      expect(updated.status).toBe('cancelled');
    });

    it('should allow the coordinator to mark the event completed and set completedAt', () => {
      const created = service.create(baseDto, coordinatorId);

      const updated = service.updateStatus(
        created.id,
        'completed',
        coordinatorId,
      );

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('should throw ForbiddenException if someone other than the coordinator tries to cancel', () => {
      const created = service.create(baseDto, coordinatorId);

      expect(() =>
        service.updateStatus(created.id, 'cancelled', 'someone-else'),
      ).toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when updating a non-existent event', () => {
      expect(() =>
        service.updateStatus('missing-id', 'accepted', guestLecturerId),
      ).toThrow(NotFoundException);
    });

    it('should notify the coordinator when the guest lecturer accepts', () => {
      const created = service.create(baseDto, coordinatorId);
      notificationsService.create.mockClear();

      service.updateStatus(created.id, 'accepted', guestLecturerId);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: coordinatorId,
          title: 'Invitation accepted',
          href: '/unit_coordinator/events',
        }),
      );
    });

    it('should notify the guest lecturer when the coordinator cancels', () => {
      const created = service.create(baseDto, coordinatorId);
      notificationsService.create.mockClear();

      service.updateStatus(created.id, 'cancelled', coordinatorId);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: guestLecturerId,
          title: 'Event cancelled',
          href: '/guest_lecturer/events',
        }),
      );
    });
  });
});
