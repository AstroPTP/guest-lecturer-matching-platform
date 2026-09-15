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
    it('should create a new administrator with a generated adminId and lastLogin', () => {
      const dto: CreateCcaeAdministratorDto = {
        adminLevel: 'SUPER_ADMIN',
      };

      const result = service.create(dto);

      expect(result.adminId).toBeDefined();
      expect(result.lastLogin).toBeInstanceOf(Date);
      expect(result.adminLevel).toBe(dto.adminLevel);
    });

    it('should add the new administrator to the list', () => {
      const dto: CreateCcaeAdministratorDto = {
        adminLevel: 'STANDARD',
      };

      service.create(dto);
      const all = service.findAll();

      expect(all).toHaveLength(1);
      expect(all[0].adminLevel).toBe(dto.adminLevel);
    });
  });

  describe('findAll', () => {
    it('should return an empty array when no administrators exist', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('should return all created administrators', () => {
      service.create({ adminLevel: 'SUPER_ADMIN' });
      service.create({ adminLevel: 'STANDARD' });

      expect(service.findAll()).toHaveLength(2);
    });
  });
});
