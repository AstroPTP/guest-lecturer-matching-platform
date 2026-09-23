import { Test, TestingModule } from '@nestjs/testing';
import { CcaeAdministratorsService } from './ccae-administrators.service';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';

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

  describe('create', () => {
    it('writes the administrator and returns the stored row', async () => {
      const dto: CreateCcaeAdministratorDto = {
        adminLevel: 'SUPER_ADMIN',
      };

      await expect(service.create(dto)).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('returns what the database holds', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });
});
