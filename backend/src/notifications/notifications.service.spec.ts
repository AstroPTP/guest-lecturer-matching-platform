import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const baseDto = {
    recipientId: 'user-1',
    type: 'event' as const,
    title: 'New event invitation',
    description: 'Dr. Smith invited you to speak',
    actionLabel: 'View event',
    href: '/guest_lecturer/events',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  it('creates a notification as unread', () => {
    const notification = service.create(baseDto);
    expect(notification.read).toBe(false);
    expect(notification.id).toBeDefined();
  });

  it('returns only notifications for the given recipient, newest first', () => {
    service.create({ ...baseDto, recipientId: 'user-1', title: 'First' });
    service.create({ ...baseDto, recipientId: 'user-2', title: 'Other user' });
    service.create({ ...baseDto, recipientId: 'user-1', title: 'Second' });

    const result = service.findByRecipient('user-1');
    expect(result).toHaveLength(2);
    expect(result.every((n) => n.recipientId === 'user-1')).toBe(true);
  });

  it('marks a notification as read when the caller is the recipient', () => {
    const notification = service.create(baseDto);
    const updated = service.markAsRead(notification.id, 'user-1');
    expect(updated.read).toBe(true);
  });

  it('throws ForbiddenException when the caller is not the recipient', () => {
    const notification = service.create(baseDto);
    expect(() => service.markAsRead(notification.id, 'someone-else')).toThrow(ForbiddenException);
  });

  it('throws NotFoundException for an unknown id', () => {
    expect(() => service.markAsRead('nonexistent', 'user-1')).toThrow(NotFoundException);
  });

  it('marks all of a recipient notifications as read, leaving others untouched', () => {
    service.create({ ...baseDto, recipientId: 'user-1' });
    service.create({ ...baseDto, recipientId: 'user-1' });
    service.create({ ...baseDto, recipientId: 'user-2' });

    service.markAllAsRead('user-1');

    const user1Notifications = service.findByRecipient('user-1');
    const user2Notifications = service.findByRecipient('user-2');
    expect(user1Notifications.every((n) => n.read)).toBe(true);
    expect(user2Notifications.every((n) => !n.read)).toBe(true);
  });
});