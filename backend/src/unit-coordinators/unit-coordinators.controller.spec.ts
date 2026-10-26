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

    expect(findAll).toHaveBeenCalledWith('auth0|viewer', undefined);
  });

  it('passes the chosen sort on, and none when none was chosen', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);
    const viewer = { id: 'auth0|viewer', roles: [] };

    await controller.findAll(viewer, { sort: 'active' });
    await controller.findAll(viewer, {});

    expect(findAll).toHaveBeenNthCalledWith(1, 'auth0|viewer', 'active');
    expect(findAll).toHaveBeenNthCalledWith(2, 'auth0|viewer', undefined);
  });
});
