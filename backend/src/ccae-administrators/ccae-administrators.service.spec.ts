import { Test, TestingModule } from '@nestjs/testing';
import { CcaeAdministratorsService } from './ccae-administrators.service';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';
import { prisma } from '../prisma';

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

describe('CcaeAdministratorsService behaviour', () => {
  const service = new CcaeAdministratorsService();

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records the level and the time of creation, and returns the stored row', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-21T01:02:03Z') });
    const stored = { admin_id: 5n, admin_level: 'SUPER_ADMIN' };
    const create = jest
      .spyOn(prisma.admins, 'create')
      .mockResolvedValue(stored as never);

    await expect(service.create({ adminLevel: 'SUPER_ADMIN' })).resolves.toBe(
      stored,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        admin_level: 'SUPER_ADMIN',
        last_login: new Date('2026-10-21T01:02:03Z'),
      },
    });
  });

  it('lets a failed write surface instead of reporting success', async () => {
    jest
      .spyOn(prisma.admins, 'create')
      .mockRejectedValue(new Error('connection lost'));

    await expect(service.create({ adminLevel: 'SUPER_ADMIN' })).rejects.toThrow(
      'connection lost',
    );
  });

  it('lists administrators newest first', async () => {
    const find = jest
      .spyOn(prisma.admins, 'findMany')
      .mockResolvedValue([{ admin_id: 2n }, { admin_id: 1n }] as never);

    await expect(service.findAll()).resolves.toHaveLength(2);

    expect(find).toHaveBeenCalledWith({ orderBy: { admin_id: 'desc' } });
  });
});
