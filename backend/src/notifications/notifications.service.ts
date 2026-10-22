import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AppRole } from '../auth/roles';
import { prisma, resolveUserId, toId } from '../prisma';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { notePushed, pushToUsers, repeatPushDue } from './push';

/** A notice before it is addressed to anyone. */
export type AdminNotice = Omit<CreateNotificationDto, 'recipientId'>;

/**
 * How many of a person's notifications are listed. The newest come first, so
 * a long-lived inbox, such as an administrator's, shows what is recent.
 */
const INBOX_LIMIT = 100;

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
 * First half of the notification lock's two-part key, so that it can only meet
 * other locks taken with this same number. The second half names the person
 * and conversation.
 */
const NOTIFICATION_LOCK_NAMESPACE = 0x6e6f7469;

/**
 * Notifications, stored so they survive a restart. Recipients are addressed by
 * their Auth0 id, the same id the caller's token carries, and stored against
 * the numeric user row.
 *
 * Every way of raising a notice also sends it to the recipient's phones and
 * computers once it is stored. That send is started and left to finish on its
 * own: the request that raised the notice neither waits for it nor hears of a
 * failure in it.
 */
@Injectable()
export class NotificationsService {
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const userId = await resolveUserId(dto.recipientId);
    const row = await prisma.notifications.create({
      data: this.toRowData(userId, dto),
    });
    void pushToUsers([userId], dto);
    return this.toNotification(dto.recipientId, row);
  }

  /**
   * Raises the notice, or each of the notices, for every administrator whose
   * account is still active. The administrators are looked up once and every
   * row goes in a single insert, so either all of them have it or none do.
   * Returns how many rows were written.
   */
  async createForAdmins(notices: AdminNotice | AdminNotice[]): Promise<number> {
    const list = Array.isArray(notices) ? notices : [notices];
    if (list.length === 0) {
      return 0;
    }

    const admins = await prisma.users.findMany({
      where: { role: AppRole.CcaeAdmin, deletedat: null },
      select: { userid: true },
    });
    if (admins.length === 0) {
      return 0;
    }

    const { count } = await prisma.notifications.createMany({
      data: admins.flatMap((admin) =>
        list.map((notice) => this.toRowData(admin.userid, notice)),
      ),
    });
    const adminIds = admins.map((admin) => admin.userid);
    for (const notice of list) {
      void pushToUsers(adminIds, notice);
    }
    return count;
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
    void pushToUsers([userId], dto);
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

    const moved = await prisma.$transaction(async (tx) => {
      // cspell:disable-next-line -- hashtext is a Postgres function
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NOTIFICATION_LOCK_NAMESPACE}::int, hashtext(${lockKey}::text))`;

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
      return count > 0;
    });

    // A new notice is always pushed. One that only moved an unread notice back
    // to the top is pushed too, so a reply in a conversation the person has not
    // opened still reaches them, but not again within five minutes of the last
    // push for that conversation: a run of quick messages is one buzz, as it is
    // one entry in the bell. Sent after the transaction, once the notice is stored.
    if (moved && !repeatPushDue(userId, dto.href)) {
      return;
    }
    notePushed(userId, dto.href);
    void pushToUsers([userId], dto);
  }

  /** How many of the caller's notifications are still unread. */
  async countUnread(callerId: string): Promise<number> {
    // A lookup, not resolveUserId: that creates the user row when it is missing,
    // and a read the page repeats every half minute should not write anything.
    const user = await prisma.users.findUnique({
      where: { auth0Id: callerId },
      select: { userid: true },
    });
    if (!user) {
      return 0;
    }

    return prisma.notifications.count({
      where: { user_id: user.userid, read: false },
    });
  }

  async findByRecipient(recipientId: string): Promise<Notification[]> {
    const userId = await resolveUserId(recipientId);
    const rows = await prisma.notifications.findMany({
      where: { user_id: userId },
      // Rows written by one insert share a timestamp, so the id settles which
      // of them is newer.
      orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
      take: INBOX_LIMIT,
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

  private toRowData(userId: bigint, dto: AdminNotice) {
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
