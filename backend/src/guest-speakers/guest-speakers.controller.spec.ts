import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersController } from './guest-speakers.controller';
import { GuestSpeakersService } from './guest-speakers.service';

describe('GuestSpeakersController', () => {
  let controller: GuestSpeakersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuestSpeakersController],
      providers: [GuestSpeakersService],
    }).compile();

    controller = module.get<GuestSpeakersController>(GuestSpeakersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
