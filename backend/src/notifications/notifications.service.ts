import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, resolveUserId, toId } from '../prisma';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface Notification extends CreateNotificationDto {
  id: string;
  createdAt: string;
  read: boolean;
}

interface NotificationRow {
  notification_id: bigint;
  type: string;
  title: string;
  description: string;
  action_label: string;
  href: string;
  read: boolean;
  created_at: Date;
}

/**
 * Notifications, stored so they survive a restart. Recipients are addressed by
 * their Auth0 id, the same id the caller's token carries, and stored against
 * the numeric user row.
 */
@Injectable()
export class NotificationsService {
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const userId = await resolveUserId(dto.recipientId);
    const row = await prisma.notifications.create({
      data: {
        user_id: userId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        action_label: dto.actionLabel,
        href: dto.href,
      },
    });
    return this.toNotification(dto.recipientId, row);
  }

  async findByRecipient(recipientId: string): Promise<Notification[]> {
    const userId = await resolveUserId(recipientId);
    const rows = await prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => this.toNotification(recipientId, row));
  }

  async markAsRead(id: string, callerId: string): Promise<Notification> {
    const userId = await resolveUserId(callerId);
    const notification = await prisma.notifications.findUnique({
      where: { notification_id: toId(id, 'id') },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.user_id !== userId) {
      throw new ForbiddenException('This notification does not belong to you');
    }

    const row = await prisma.notifications.update({
      where: { notification_id: notification.notification_id },
      data: { read: true },
    });
    return this.toNotification(callerId, row);
  }

  async markAllAsRead(callerId: string): Promise<void> {
    const userId = await resolveUserId(callerId);
    await prisma.notifications.updateMany({
      where: { user_id: userId, read: false },
      data: { read: true },
    });
  }

  private toNotification(
    recipientId: string,
    row: NotificationRow,
  ): Notification {
    return {
      id: String(row.notification_id),
      recipientId,
      type: row.type as Notification['type'],
      title: row.title,
      description: row.description,
      actionLabel: row.action_label,
      href: row.href,
      read: row.read,
      createdAt: row.created_at.toISOString(),
    };
  }
}
