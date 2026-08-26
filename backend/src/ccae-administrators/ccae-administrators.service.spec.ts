import { Test, TestingModule } from '@nestjs/testing';
import { CcaeAdministratorsService } from './ccae-administrators.service';

describe('CcaeAdministratorsService', () => {
  let service: CcaeAdministratorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CcaeAdministratorsService],
    }).compile();

    service = module.get<CcaeAdministratorsService>(CcaeAdministratorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
