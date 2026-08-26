import { Test, TestingModule } from '@nestjs/testing';
import { UnitCoordinatorsController } from './unit-coordinators.controller';

describe('UnitCoordinatorsController', () => {
  let controller: UnitCoordinatorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnitCoordinatorsController],
    }).compile();

    controller = module.get<UnitCoordinatorsController>(UnitCoordinatorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
