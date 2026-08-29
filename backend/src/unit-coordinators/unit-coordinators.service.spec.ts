import { Test, TestingModule } from '@nestjs/testing';
import { UnitCoordinatorsService } from './unit-coordinators.service';

describe('UnitCoordinatorsService', () => {
  let service: UnitCoordinatorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UnitCoordinatorsService],
    }).compile();

    service = module.get<UnitCoordinatorsService>(UnitCoordinatorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
