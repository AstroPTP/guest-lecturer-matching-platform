import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtGuard } from '../auth/jwt.guard';
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
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
  });

  it('returns notifications for the calling user', () => {
    service.create({
      recipientId: 'user-1',
      type: 'match',
      title: 'New match',
      description: 'You matched with a coordinator',
      actionLabel: 'View match',
      href: '/matches',
    });

    const result = controller.findMine(user);
    expect(result).toHaveLength(1);
  });

  it('marks a single notification as read', () => {
    const notification = service.create({
      recipientId: 'user-1',
      type: 'message',
      title: 'New message',
      description: 'You have a new message',
      actionLabel: 'View message',
      href: '/messages',
    });

    const result = controller.markAsRead(notification.id, user);
    expect(result.read).toBe(true);
  });

  it('marks all notifications as read', () => {
    service.create({
      recipientId: 'user-1',
      type: 'profile',
      title: 'Profile update',
      description: 'Your profile was viewed',
      actionLabel: 'View profile',
      href: '/profile',
    });

    const result = controller.markAllAsRead(user);
    expect(result).toEqual({ success: true });
    expect(service.findByRecipient('user-1').every((n) => n.read)).toBe(true);
  });
});