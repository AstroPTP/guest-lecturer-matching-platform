import { Test, TestingModule } from '@nestjs/testing';
import { CcaeAdministratorsController } from './ccae-administrators.controller';
import { CcaeAdministratorsService } from './ccae-administrators.service';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';
import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

describe('CcaeAdministratorsController', () => {
  let controller: CcaeAdministratorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CcaeAdministratorsController],
      providers: [CcaeAdministratorsService],
    }).compile();

    controller = module.get<CcaeAdministratorsController>(
      CcaeAdministratorsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('CcaeAdministratorsController behaviour', () => {
  const service = new CcaeAdministratorsService();
  const controller = new CcaeAdministratorsController(service);
  afterEach(() => jest.restoreAllMocks());

  it('passes the request body to the service and returns what it stores', async () => {
    const dto: CreateCcaeAdministratorDto = { adminLevel: 'SUPER_ADMIN' };
    const create = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ admin_id: 1n } as never);
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);

    await expect(controller.create(dto)).resolves.toEqual({ admin_id: 1n });
    await expect(controller.findAll()).resolves.toEqual([]);

    expect(create).toHaveBeenCalledWith(dto);
    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it('refuses a body that sets the id or login time itself, or has no level', async () => {
    // The same options the application applies to every request body.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const meta: ArgumentMetadata = {
      type: 'body',
      metatype: CreateCcaeAdministratorDto,
    };

    await expect(
      pipe.transform({ adminLevel: 'SUPER_ADMIN' }, meta),
    ).resolves.toMatchObject({ adminLevel: 'SUPER_ADMIN' });
    for (const body of [
      { adminLevel: 'SUPER_ADMIN', lastLogin: '2000-01-01T00:00:00Z' },
      { adminLevel: 'SUPER_ADMIN', adminId: '1' },
      {},
      { adminLevel: 7 },
    ]) {
      await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
