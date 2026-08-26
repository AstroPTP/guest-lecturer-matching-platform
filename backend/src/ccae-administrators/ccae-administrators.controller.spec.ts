import { Test, TestingModule } from '@nestjs/testing';
import { CcaeAdministratorsController } from './ccae-administrators.controller';

describe('CcaeAdministratorsController', () => {
  let controller: CcaeAdministratorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CcaeAdministratorsController],
    }).compile();

    controller = module.get<CcaeAdministratorsController>(CcaeAdministratorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
