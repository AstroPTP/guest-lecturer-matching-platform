import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';

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

  describe('for an administrator', () => {
    const admin: AuthenticatedUser = {
      id: 'auth0|admin',
      email: 'admin@test.com',
      roles: [AppRole.CcaeAdmin],
    };
    const guard = new RolesGuard(new Reflector());

    function contextFor(handler: object): ExecutionContext {
      return {
        getHandler: () => handler,
        getClass: () => NotificationsController,
        switchToHttp: () => ({ getRequest: () => ({ user: admin }) }),
      } as unknown as ExecutionContext;
    }

    it.each([
      'findMine',
      'unreadCount',
      'markAsRead',
      'markAllAsRead',
    ] as const)(
      'lets the %s route through, as it is not limited to a role',
      (name) => {
        const handler = NotificationsController.prototype[name];
        expect(guard.canActivate(contextFor(handler))).toBe(true);
      },
    );

    it("counts the administrator's own unread notices, the figure the bell shows", async () => {
      const unreadSummary = jest
        .spyOn(service, 'unreadSummary')
        .mockResolvedValue({ count: 3, latestAt: '2026-10-12T03:30:00.000Z' });

      await expect(controller.unreadCount(admin)).resolves.toEqual({
        count: 3,
        latestAt: '2026-10-12T03:30:00.000Z',
      });
      expect(unreadSummary).toHaveBeenCalledWith('auth0|admin');
    });

    it('marks the whole inbox read for that administrator only', async () => {
      const markAllAsRead = jest
        .spyOn(service, 'markAllAsRead')
        .mockResolvedValue(undefined);

      await expect(controller.markAllAsRead(admin)).resolves.toEqual({
        success: true,
      });
      expect(markAllAsRead).toHaveBeenCalledWith('auth0|admin');
    });
  });
});
