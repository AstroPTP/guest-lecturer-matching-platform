import { Test, TestingModule } from '@nestjs/testing';
import { MatchRequestsController } from './match-requests.controller';
import { MatchRequestsService } from './match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('MatchRequestsController', () => {
  let controller: MatchRequestsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchRequestsController],
      providers: [MatchRequestsService, NotificationsService],
    }).compile();

    controller = module.get<MatchRequestsController>(MatchRequestsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
