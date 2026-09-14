import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtGuard } from '../auth/jwt.guard';
import { AppRole } from '../auth/roles';
import type { AuthenticatedUser } from '../auth/authenticated-user';

describe('EventsController', () => {
  let controller: EventsController;

  const coordinator: AuthenticatedUser = {
    id: 'coordinator-1',
    email: 'coord@test.com',
    roles: [AppRole.UnitCoordinator],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [EventsService],
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('creates an event and attributes it to the calling coordinator', () => {
    const dto = {
      matchId: 'match-1',
      coordinatorName: 'Dr. Smith',
      guestLecturerId: 'lecturer-1',
      guestLecturerName: 'Jane Doe',
      title: 'Cloud Security Talk',
      description: 'Intro to cloud security',
      date: '2026-10-01',
      startTime: '10:00',
      endTime: '11:00',
      location: 'Building 401',
      format: 'face-to-face' as const,
    };
    const result = controller.create(dto, coordinator);
    expect(result.coordinatorId).toBe(coordinator.id);
    expect(result.status).toBe('invitation-sent');
  });

  it('lists all events', () => {
    expect(controller.findAll()).toBeInstanceOf(Array);
  });
});