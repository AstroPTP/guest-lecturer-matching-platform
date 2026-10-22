import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersController } from './guest-speakers.controller';
import { GuestSpeakersService } from './guest-speakers.service';

describe('GuestSpeakersController', () => {
  let controller: GuestSpeakersController;
  let service: GuestSpeakersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuestSpeakersController],
      providers: [GuestSpeakersService],
    }).compile();

    service = module.get<GuestSpeakersService>(GuestSpeakersService);
    controller = module.get<GuestSpeakersController>(GuestSpeakersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  it('lists guest lecturers as seen by the person asking, so a report between them applies', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);

    await controller.findAll({ id: 'auth0|viewer', roles: [] });

    expect(findAll).toHaveBeenCalledWith('auth0|viewer');
  });
});
