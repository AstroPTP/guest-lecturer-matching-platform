import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersService } from './guest-speakers.service';

describe('GuestSpeakersService', () => {
  let service: GuestSpeakersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuestSpeakersService],
    }).compile();

    service = module.get<GuestSpeakersService>(GuestSpeakersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
