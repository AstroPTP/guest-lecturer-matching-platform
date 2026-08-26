import { Test, TestingModule } from '@nestjs/testing';
import { MatchRequestsController } from './match-requests.controller';

describe('MatchRequestsController', () => {
  let controller: MatchRequestsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchRequestsController],
    }).compile();

    controller = module.get<MatchRequestsController>(MatchRequestsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
