import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('EventsService', () => {
  let service: EventsService;

  const baseDto = {
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, NotificationsService],
    }).compile();
    service = module.get<EventsService>(EventsService);
  });

});