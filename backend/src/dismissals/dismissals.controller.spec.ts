import { Test, TestingModule } from '@nestjs/testing';
import { DismissalsController } from './dismissals.controller';
import { DismissalsService } from './dismissals.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';

describe('DismissalsController', () => {
  let controller: DismissalsController;
  let service: DismissalsService;

  const user: AuthenticatedUser = { id: 'auth0|user-123', roles: [] };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DismissalsController],
      providers: [DismissalsService],
    }).compile();

    controller = module.get<DismissalsController>(DismissalsController);
    service = module.get<DismissalsService>(DismissalsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // The caller's id comes from the verified token, never the request, so
  // every route must pass user.id through rather than anything from the body.
  it('acts as the signed-in user on every route', async () => {
    const findMine = jest.spyOn(service, 'findMine').mockResolvedValue([]);
    const dismiss = jest
      .spyOn(service, 'dismiss')
      .mockResolvedValue({ targetId: '3001', dismissedAt: '' });
    const remove = jest.spyOn(service, 'remove').mockResolvedValue();

    await controller.findMine(user);
    await controller.dismiss({ targetId: '3001' }, user);
    await controller.remove('3001', user);

    expect(findMine).toHaveBeenCalledWith(user.id);
    expect(dismiss).toHaveBeenCalledWith(user.id, '3001');
    expect(remove).toHaveBeenCalledWith(user.id, '3001');
  });
});
