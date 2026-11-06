import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryQueryDto } from '../suggestions/dto/discovery-query.dto';
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

    expect(findAll).toHaveBeenCalledWith('auth0|viewer', undefined, false);
  });

  it('passes the chosen sort on, and none when none was chosen', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);
    const viewer = { id: 'auth0|viewer', roles: [] };

    await controller.findAll(viewer, { sort: 'active' });
    await controller.findAll(viewer, {});

    expect(findAll).toHaveBeenNthCalledWith(1, 'auth0|viewer', 'active', false);
    expect(findAll).toHaveBeenNthCalledWith(
      2,
      'auth0|viewer',
      undefined,
      false,
    );
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

      await controller.findAll(
        { id: 'auth0|viewer', roles: [] },
        { forMatches: value },
      );

      expect(findAll).toHaveBeenCalledWith('auth0|viewer', undefined, expected);
    },
  );

  describe('query validation', () => {
    // The same options the application applies to every request.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const query = {
      type: 'query',
      metatype: DiscoveryQueryDto,
    } as ArgumentMetadata;

    it('accepts forMatches beside a sort, and refuses a key it does not know', async () => {
      await expect(
        pipe.transform({ sort: 'active', forMatches: 'true' }, query),
      ).resolves.toMatchObject({ sort: 'active', forMatches: 'true' });
      await expect(
        pipe.transform({ forMatches: 'true', page: '2' }, query),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still refuses a sort that is not listed, with forMatches present', async () => {
      await expect(
        pipe.transform({ sort: 'score', forMatches: 'true' }, query),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
