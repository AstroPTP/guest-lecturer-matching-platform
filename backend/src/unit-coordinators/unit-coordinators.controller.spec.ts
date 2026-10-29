import { Test, TestingModule } from '@nestjs/testing';
import { UnitCoordinatorsController } from './unit-coordinators.controller';
import { UnitCoordinatorsService } from './unit-coordinators.service';

describe('UnitCoordinatorsController', () => {
  let controller: UnitCoordinatorsController;
  let service: UnitCoordinatorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnitCoordinatorsController],
      providers: [UnitCoordinatorsService],
    }).compile();

    service = module.get<UnitCoordinatorsService>(UnitCoordinatorsService);
    controller = module.get<UnitCoordinatorsController>(
      UnitCoordinatorsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  it('lists unit coordinators as seen by the person asking, so a report between them applies', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);

    await controller.findAll({ id: 'auth0|viewer', roles: [] });

    expect(findAll).toHaveBeenCalledWith('auth0|viewer', false);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['yes', false],
    [undefined, false],
  ])(
    'lists the caller’s matched profiles only for forMatches=%s',
    async (value, expected) => {
      const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);

      await controller.findAll({ id: 'auth0|viewer', roles: [] }, value);

      expect(findAll).toHaveBeenCalledWith('auth0|viewer', expected);
    },
  );
});
