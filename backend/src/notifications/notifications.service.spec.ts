import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { prisma } from '../prisma';

describe('NotificationsService', () => {
  let service: NotificationsService;

  // The double's resolveUserId maps every Auth0 id to user 1n.
  const recipientId = 'auth0|recipient';
  const createdAt = new Date('2026-10-01T02:00:00.000Z');
  const row = {
    notification_id: 10n,
    user_id: 1n,
    type: 'match',
    title: 'New match',
    description: 'You matched with a coordinator',
    action_label: 'View match',
    href: '/matches',
    read: false,
    created_at: createdAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores a notification against the recipient and returns it unread', async () => {
    const create = jest
      .spyOn(prisma.notifications, 'create')
      .mockResolvedValue(row);

    await expect(
      service.create({
        recipientId,
        type: 'match',
        title: 'New match',
        description: 'You matched with a coordinator',
        actionLabel: 'View match',
        href: '/matches',
      }),
    ).resolves.toEqual({
      id: '10',
      recipientId,
      type: 'match',
      title: 'New match',
      description: 'You matched with a coordinator',
      actionLabel: 'View match',
      href: '/matches',
      read: false,
      createdAt: createdAt.toISOString(),
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 1n,
        action_label: 'View match',
      }) as unknown,
    });
  });

  it("returns only the recipient's notifications, newest first", async () => {
    const findMany = jest
      .spyOn(prisma.notifications, 'findMany')
      .mockResolvedValue([row] as never);

    await expect(service.findByRecipient(recipientId)).resolves.toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { user_id: 1n },
      orderBy: { created_at: 'desc' },
    });
  });

  it('marks a notification as read when the caller is the recipient', async () => {
    jest.spyOn(prisma.notifications, 'findUnique').mockResolvedValue(row);
    jest
      .spyOn(prisma.notifications, 'update')
      .mockResolvedValue({ ...row, read: true });

    await expect(service.markAsRead('10', recipientId)).resolves.toEqual(
      expect.objectContaining({ read: true }),
    );
  });

  it('throws ForbiddenException when the caller is not the recipient', async () => {
    jest
      .spyOn(prisma.notifications, 'findUnique')
      .mockResolvedValue({ ...row, user_id: 2n });

    await expect(service.markAsRead('10', recipientId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for an unknown id', async () => {
    await expect(service.markAsRead('999', recipientId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("marks only the caller's unread notifications as read", async () => {
    const updateMany = jest.spyOn(prisma.notifications, 'updateMany');

    await service.markAllAsRead(recipientId);
    expect(updateMany).toHaveBeenCalledWith({
      where: { user_id: 1n, read: false },
      data: { read: true },
    });
  });
});
