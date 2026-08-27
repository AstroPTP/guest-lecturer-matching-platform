import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersController } from './guest-speakers.controller';

describe('GuestSpeakersController', () => {
  let controller: GuestSpeakersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuestSpeakersController],
    }).compile();

    controller = module.get<GuestSpeakersController>(GuestSpeakersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
