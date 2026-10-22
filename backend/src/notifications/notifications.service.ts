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

/** How long a repeat of the same notice is held back. */
const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      data: this.toRowData(userId, dto),
    });
    return this.toNotification(dto.recipientId, row);
  }

  /**
   * Raises a notice unless the person was sent the same one in the last day.
   * The same means the same type, title and href, and the href names who the
   * notice is about, so two people showing interest are two notices while one
   * person withdrawing and asking again is one.
   *
   * Returns false when the earlier notice made this one unnecessary.
   */
  async createUnlessRecent(dto: CreateNotificationDto): Promise<boolean> {
    const userId = await resolveUserId(dto.recipientId);
    const earlier = await prisma.notifications.findFirst({
      where: {
        user_id: userId,
        type: dto.type,
        title: dto.title,
        href: dto.href,
        created_at: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) },
      },
      select: { notification_id: true },
    });
    if (earlier) {
      return false;
    }

    await prisma.notifications.create({ data: this.toRowData(userId, dto) });
    return true;
  }

  /**
   * Raises a notice, or, when the person still has an unread one with the same
   * type and href, moves that one back to the top of their list instead of
   * adding another. A run of messages in one conversation is then a single
   * entry in the bell rather than a row per message.
   *
   * The check and the write run together under a lock on the person and href.
   * Without it two messages arriving at once would each find nothing to move
   * and each add a row. The lock is held for the transaction only, so a pooled
   * connection cannot be left holding it.
   */
  async createOrRefreshUnread(dto: CreateNotificationDto): Promise<void> {
    const userId = await resolveUserId(dto.recipientId);
    const lockKey = String(userId) + ':' + dto.href;

    await prisma.$transaction(async (tx) => {
      // cspell:disable-next-line -- hashtext is a Postgres function
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`;

      const { count } = await tx.notifications.updateMany({
        where: {
          user_id: userId,
          type: dto.type,
          href: dto.href,
          read: false,
        },
        data: { created_at: new Date() },
      });
      if (count === 0) {
        await tx.notifications.create({ data: this.toRowData(userId, dto) });
      }
    });
  }

  /** How many of the caller's notifications are still unread. */
  async countUnread(callerId: string): Promise<number> {
    const userId = await resolveUserId(callerId);
    return prisma.notifications.count({
      where: { user_id: userId, read: false },
    });
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

  private toRowData(userId: bigint, dto: CreateNotificationDto) {
    return {
      user_id: userId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      action_label: dto.actionLabel,
      href: dto.href,
    };
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
