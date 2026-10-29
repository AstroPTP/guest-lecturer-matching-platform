import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@test.com',
    roles: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [NotificationsService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns notifications for the calling user', async () => {
    const findByRecipient = jest
      .spyOn(service, 'findByRecipient')
      .mockResolvedValue([]);

    await controller.findMine(user);
    expect(findByRecipient).toHaveBeenCalledWith('user-1');
  });

  it('returns the unread count and the time of the newest notice for the calling user only', async () => {
    const unreadSummary = jest
      .spyOn(service, 'unreadSummary')
      .mockResolvedValue({ count: 4, latestAt: '2026-10-12T03:30:00.000Z' });

    await expect(controller.unreadCount(user)).resolves.toEqual({
      count: 4,
      latestAt: '2026-10-12T03:30:00.000Z',
    });
    expect(unreadSummary).toHaveBeenCalledWith('user-1');
  });

  it('still returns the count on its own field, and a null time when there is nothing', async () => {
    jest
      .spyOn(service, 'unreadSummary')
      .mockResolvedValue({ count: 0, latestAt: null });

    const body = await controller.unreadCount(user);
    expect(body.count).toBe(0);
    expect(body.latestAt).toBeNull();
  });

  it('marks a single notification as read for the calling user', async () => {
    const markAsRead = jest
      .spyOn(service, 'markAsRead')
      .mockResolvedValue({ read: true } as never);

    await controller.markAsRead('10', user);
    expect(markAsRead).toHaveBeenCalledWith('10', 'user-1');
  });

  it('marks all notifications as read', async () => {
    const markAllAsRead = jest
      .spyOn(service, 'markAllAsRead')
      .mockResolvedValue();

    await expect(controller.markAllAsRead(user)).resolves.toEqual({
      success: true,
    });
    expect(markAllAsRead).toHaveBeenCalledWith('user-1');
  });
});
