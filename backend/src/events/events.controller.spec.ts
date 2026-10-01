import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AppRole } from '../auth/roles';
import type { AuthenticatedUser } from '../auth/authenticated-user';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

  const coordinator: AuthenticatedUser = {
    id: 'coordinator-1',
    email: 'coord@test.com',
    roles: [AppRole.UnitCoordinator],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        EventsService,
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: MatchRequestsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get<EventsService>(EventsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an event on behalf of the calling coordinator', async () => {
    const create = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ status: 'invitation-sent' } as never);
    const dto = {
      matchId: '6007',
      coordinatorName: 'Dr. Smith',
      guestLecturerId: '3002',
      guestLecturerName: 'Jane Doe',
      title: 'Cloud Security Talk',
      description: 'Intro to cloud security',
      date: '2026-10-01',
      startTime: '10:00',
      endTime: '11:00',
      location: 'Building 401',
      format: 'face-to-face' as const,
    };

    await controller.create(dto, coordinator);
    expect(create).toHaveBeenCalledWith(dto, 'coordinator-1');
  });

  it("lists the caller's own events", async () => {
    const findMine = jest.spyOn(service, 'findMine').mockResolvedValue([]);

    await expect(controller.findForCoordinator(coordinator)).resolves.toEqual(
      [],
    );
    expect(findMine).toHaveBeenCalledWith('coordinator-1');
  });
});
