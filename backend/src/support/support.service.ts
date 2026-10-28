import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { recordAudit } from '../admin/platform-rules';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma, toId } from '../prisma';
import type { Prisma } from '../../generated/prisma/client';
import { validateAttachment } from './attachments';
import { SupportErrorCode } from './support-errors';
import type { OpenSupportThreadDto } from './dto/open-support-thread.dto';
import type { SupportStatus } from './dto/set-support-status.dto';

/** Where each role's Messages page lives; the notification links to it. */
const MESSAGES_HREF = {
  [AppRole.GuestSpeaker]: '/guest_lecturer/messages',
  [AppRole.UnitCoordinator]: '/unit_coordinator/messages',
} as const;

const fullName = (
  p?: { first_name?: string | null; last_name?: string | null } | null,
) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null;

/** A file attached to a message. The bytes are fetched separately. */
export interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SupportMessageView {
  id: string;
  sender: 'admin' | 'user';
  content: string;
  sentAt: string;
  readAt: string | null;
  attachment: AttachmentInfo | null;
}

/** One request, with its messages. `user` is only filled in for administrators. */
export interface SupportThreadDetail {
  id: string;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
  };
  messages: SupportMessageView[];
}

/** A row in an administrator's list of requests. */
export interface AdminThreadSummary {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userRole: string | null;
  subject: string;
  status: SupportStatus;
  /** Messages the user has sent that no administrator has opened yet. */
  unreadFromUser: number;
  createdAt: string;
  updatedAt: string;
}

/** A row in the user's own list of requests. */
export interface MyThreadSummary {
  id: string;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  /** Messages from CCAE the user has not opened yet. */
  unreadFromAdmin: number;
  /**
   * True while the request is open and CCAE is waiting for the user: there is
   * an unread message from CCAE, or the last word was CCAE's.
   */
  actionRequired: boolean;
  lastMessage: string;
  lastSentAt: string | null;
}

interface ThreadRow {
  thread_id: bigint;
  user_id: bigint;
  subject: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  message_id: bigint;
  thread_id: bigint;
  sender: string;
  content: string;
  attachment_id: bigint | null;
  read_at: Date | null;
  sent_at: Date;
}

const threadNotFound = () =>
  new NotFoundException({
    code: SupportErrorCode.ThreadNotFound,
    message: 'Request not found',
  });

/**
 * First half of the lock that serialises one person's requests, so that
 * opening two at once cannot get past the one-open-request rule. The second
 * half is the person's user id.
 */
const OPEN_REQUEST_LOCK_NAMESPACE = 0x73_75_70;

const alreadyOpen = () =>
  new ConflictException({
    code: SupportErrorCode.RequestAlreadyOpen,
    message:
      'This person already has an open request. Reply there or close it first.',
  });

const closedForAdmin = () =>
  new ConflictException({
    code: SupportErrorCode.ThreadClosed,
    message: 'This request is closed. Reopen it to send another message.',
  });

const closedForUser = () =>
  new ConflictException({
    code: SupportErrorCode.ThreadClosed,
    message: 'This request has been closed, so it cannot take a reply.',
  });

/**
 * The roles that have a Messages page. A request to anyone else would stay
 * open with nobody able to answer it, and block any new request for them.
 */
const REACHABLE_ROLES: readonly (string | null)[] = [
  AppRole.GuestSpeaker,
  AppRole.UnitCoordinator,
];

const asStatus = (value: string): SupportStatus =>
  value === 'closed' ? 'closed' : 'open';

/**
 * Requests for further details. An administrator opens a thread with one
 * user, the user answers from the Messages page, and either side can add to
 * it until an administrator closes it.
 *
 * Every user route finds the thread through the caller's own user row, and a
 * thread that belongs to someone else is reported as missing rather than
 * forbidden, so the answer does not confirm that it exists.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly notifications: NotificationsService) {}

  // -------------------------------------------------------------------------
  // Administrator
  // -------------------------------------------------------------------------

  /**
   * Opens a request and sends the first message.
   *
   * A person has one open request at a time. Every request lands in the same
   * conversation on their Messages page and their replies go to the latest
   * one, so a second open request would leave the first without answers.
   */
  async openThread(
    adminAuth0Id: string,
    dto: OpenSupportThreadDto,
  ): Promise<{ id: string }> {
    const target = await prisma.users.findUnique({
      where: { userid: toId(dto.userId, 'userId') },
      select: { userid: true, auth0Id: true, role: true, deletedat: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: SupportErrorCode.UserNotFound,
        message: 'No user with that id.',
      });
    }
    if (!REACHABLE_ROLES.includes(target.role)) {
      throw new BadRequestException({
        code: SupportErrorCode.UserNotReachable,
        message:
          'Requests can only be sent to guest lecturers and unit coordinators.',
      });
    }
    if (target.deletedat) {
      throw new ConflictException({
        code: SupportErrorCode.UserDeactivated,
        message:
          'That account is deactivated, so it cannot answer. Reactivate it first.',
      });
    }

    const thread = await prisma.$transaction(async (tx) => {
      await this.assertNoOtherOpenRequest(tx, target.userid);
      const created = await tx.support_threads.create({
        data: {
          user_id: target.userid,
          subject: dto.subject,
          opened_by_auth0_id: adminAuth0Id,
        },
      });
      await tx.support_messages.create({
        data: {
          thread_id: created.thread_id,
          sender: 'admin',
          content: dto.message,
        },
      });
      return created;
    });

    const id = thread.thread_id.toString();
    await recordAudit(
      adminAuth0Id,
      'support.requested',
      { type: 'support_thread', id },
      { userId: dto.userId },
    );
    await this.notify(target, {
      title: 'Action required',
      description: `CCAE has asked for more details: ${dto.subject}`,
    });
    return { id };
  }

  /**
   * The most recently active requests, up to 200. A filter is applied in the
   * query itself, so asking for one person's open request finds it however
   * long ago it was last touched.
   */
  async listThreads(
    filter: { userId?: string; status?: SupportStatus } = {},
  ): Promise<AdminThreadSummary[]> {
    const threads: ThreadRow[] = await prisma.support_threads.findMany({
      where: {
        ...(filter.userId !== undefined && {
          user_id: toId(filter.userId, 'userId'),
        }),
        ...(filter.status !== undefined && { status: filter.status }),
      },
      orderBy: { updated_at: 'desc' },
      take: 200,
    });
    if (threads.length === 0) return [];

    const [users, unread] = await Promise.all([
      prisma.users.findMany({
        where: { userid: { in: threads.map((t) => t.user_id) } },
        select: {
          userid: true,
          email: true,
          role: true,
          guest: { select: { first_name: true, last_name: true } },
          coordinator: { select: { first_name: true, last_name: true } },
        },
      }),
      prisma.support_messages.findMany({
        where: {
          thread_id: { in: threads.map((t) => t.thread_id) },
          sender: 'user',
          read_at: null,
        },
        select: { thread_id: true },
      }),
    ]);

    return threads.map((t) => {
      const user = users.find((u) => u.userid === t.user_id);
      return {
        id: t.thread_id.toString(),
        userId: t.user_id.toString(),
        userName:
          fullName(user?.guest) ??
          fullName(user?.coordinator) ??
          user?.email ??
          'Unnamed',
        userEmail: user?.email ?? null,
        userRole: user?.role ?? null,
        subject: t.subject,
        status: asStatus(t.status),
        unreadFromUser: unread.filter((m) => m.thread_id === t.thread_id)
          .length,
        createdAt: t.created_at.toISOString(),
        updatedAt: t.updated_at.toISOString(),
      };
    });
  }

  /**
   * One request with its messages. Opening it counts as reading what the user
   * sent, so the unread figure in the list goes down.
   */
  async getThreadForAdmin(id: string): Promise<SupportThreadDetail> {
    const thread = await this.threadOrThrow(id);
    await prisma.support_messages.updateMany({
      where: { thread_id: thread.thread_id, sender: 'user', read_at: null },
      data: { read_at: new Date() },
    });

    const [messages, user] = await Promise.all([
      this.loadMessages(thread.thread_id),
      prisma.users.findUnique({
        where: { userid: thread.user_id },
        select: {
          userid: true,
          email: true,
          role: true,
          guest: { select: { first_name: true, last_name: true } },
          coordinator: { select: { first_name: true, last_name: true } },
        },
      }),
    ]);

    return {
      ...this.toDetail(thread, messages),
      user: {
        id: thread.user_id.toString(),
        name:
          fullName(user?.guest) ??
          fullName(user?.coordinator) ??
          user?.email ??
          'Unnamed',
        email: user?.email ?? null,
        role: user?.role ?? null,
      },
    };
  }

  async adminReply(
    adminAuth0Id: string,
    id: string,
    content: string,
  ): Promise<SupportMessageView> {
    const thread = await this.threadOrThrow(id);
    if (thread.status !== 'open') {
      throw closedForAdmin();
    }

    const message = await prisma.$transaction(async (tx) => {
      await this.touchOpenThread(tx, thread.thread_id, closedForAdmin);
      return tx.support_messages.create({
        data: { thread_id: thread.thread_id, sender: 'admin', content },
      });
    });

    await recordAudit(
      adminAuth0Id,
      'support.replied',
      { type: 'support_thread', id: thread.thread_id.toString() },
      { userId: thread.user_id.toString() },
    );
    const target = await prisma.users.findUnique({
      where: { userid: thread.user_id },
      select: { auth0Id: true, role: true },
    });
    if (target) {
      await this.notify(target, {
        title: 'New message from CCAE',
        description: `CCAE replied about: ${thread.subject}`,
      });
    }
    return this.toView(message, null);
  }

  /** Closing or reopening. Setting the status it already has changes nothing. */
  async setStatus(
    adminAuth0Id: string,
    id: string,
    status: SupportStatus,
  ): Promise<{ id: string; status: SupportStatus }> {
    const thread = await this.threadOrThrow(id);
    const threadId = thread.thread_id.toString();
    if (thread.status === status) {
      return { id: threadId, status };
    }

    await prisma.$transaction(async (tx) => {
      // Reopening would put a second request open at once.
      if (status === 'open') {
        await this.assertNoOtherOpenRequest(
          tx,
          thread.user_id,
          thread.thread_id,
        );
      }
      await tx.support_threads.update({
        where: { thread_id: thread.thread_id },
        data: { status, updated_at: new Date() },
      });
    });
    await recordAudit(
      adminAuth0Id,
      status === 'closed' ? 'support.closed' : 'support.reopened',
      { type: 'support_thread', id: threadId },
      { userId: thread.user_id.toString() },
    );
    return { id: threadId, status };
  }

  /**
   * Refuses when the person already has an open request other than `except`.
   * Taken under a lock on the person for the rest of the transaction, so two
   * requests opened together cannot both pass.
   */
  private async assertNoOtherOpenRequest(
    tx: Prisma.TransactionClient,
    userId: bigint,
    except?: bigint,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OPEN_REQUEST_LOCK_NAMESPACE}::int, ${Number(BigInt.asIntN(32, userId))}::int)`;
    const open = await tx.support_threads.findFirst({
      where: { user_id: userId, status: 'open' },
      select: { thread_id: true },
    });
    if (open && open.thread_id !== except) {
      throw alreadyOpen();
    }
  }

  /**
   * Moves a request to the top of the list, but only while it is still open.
   * The conditional update takes the row lock, so a close that is in progress
   * finishes first and this then finds the request closed and refuses; a reply
   * that gets here first is saved before the close can follow it. Run before
   * anything is written, so a refused reply leaves nothing behind.
   */
  private async touchOpenThread(
    tx: Prisma.TransactionClient,
    threadId: bigint,
    closed: () => Error,
  ): Promise<void> {
    const { count } = await tx.support_threads.updateMany({
      where: { thread_id: threadId, status: 'open' },
      data: { updated_at: new Date() },
    });
    if (count === 0) {
      throw closed();
    }
  }

  // -------------------------------------------------------------------------
  // The signed-in user
  // -------------------------------------------------------------------------

  /** The caller's own requests, newest activity first. */
  async listMine(auth0Id: string): Promise<MyThreadSummary[]> {
    const userId = await this.userIdFor(auth0Id);
    if (userId === null) return [];

    const threads: ThreadRow[] = await prisma.support_threads.findMany({
      where: { user_id: userId },
      orderBy: { updated_at: 'desc' },
      take: 50,
    });
    if (threads.length === 0) return [];

    const [unread, latest] = await Promise.all([
      prisma.support_messages.findMany({
        where: {
          thread_id: { in: threads.map((t) => t.thread_id) },
          sender: 'admin',
          read_at: null,
        },
        select: { thread_id: true },
      }),
      Promise.all(
        threads.map(
          (t): Promise<MessageRow | null> =>
            prisma.support_messages.findFirst({
              where: { thread_id: t.thread_id },
              orderBy: [{ sent_at: 'desc' }, { message_id: 'desc' }],
            }),
        ),
      ),
    ]);

    return threads.map((t, index) => {
      const last = latest[index];
      const unreadFromAdmin = unread.filter(
        (m) => m.thread_id === t.thread_id,
      ).length;
      return {
        id: t.thread_id.toString(),
        subject: t.subject,
        status: asStatus(t.status),
        createdAt: t.created_at.toISOString(),
        updatedAt: t.updated_at.toISOString(),
        unreadFromAdmin,
        actionRequired:
          t.status === 'open' &&
          (unreadFromAdmin > 0 || last?.sender === 'admin'),
        lastMessage: last?.content ?? '',
        lastSentAt: last?.sent_at.toISOString() ?? null,
      };
    });
  }

  async getMine(auth0Id: string, id: string): Promise<SupportThreadDetail> {
    const thread = await this.ownThreadOrThrow(auth0Id, id);
    return this.toDetail(thread, await this.loadMessages(thread.thread_id));
  }

  /**
   * The caller's reply: text, one file, or both. Refused on a closed request
   * and on one that is not theirs.
   */
  async postMine(
    auth0Id: string,
    id: string,
    content: string | undefined,
    file: Express.Multer.File | undefined,
  ): Promise<SupportMessageView> {
    const thread = await this.ownThreadOrThrow(auth0Id, id);
    if (thread.status !== 'open') {
      throw closedForUser();
    }

    const text = (content ?? '').trim();
    const attachment = file ? validateAttachment(file) : null;
    if (!text && !attachment) {
      throw new BadRequestException({
        code: SupportErrorCode.MessageEmpty,
        message: 'Write a message or attach a file.',
      });
    }

    const { message, stored } = await prisma.$transaction(async (tx) => {
      await this.touchOpenThread(tx, thread.thread_id, closedForUser);
      const row = attachment
        ? await tx.support_attachments.create({
            data: {
              data: new Uint8Array(attachment.data),
              mime_type: attachment.mimeType,
              filename: attachment.filename,
              size_bytes: attachment.sizeBytes,
            },
          })
        : null;
      const created = await tx.support_messages.create({
        data: {
          thread_id: thread.thread_id,
          sender: 'user',
          content: text,
          attachment_id: row?.attachment_id ?? null,
        },
      });
      return { message: created, stored: row };
    });

    return this.toView(
      message,
      stored
        ? {
            id: stored.attachment_id.toString(),
            filename: stored.filename,
            mimeType: stored.mime_type,
            sizeBytes: stored.size_bytes,
          }
        : null,
    );
  }

  /** Marks everything CCAE has sent in the caller's request as read. */
  async markRead(auth0Id: string, id: string): Promise<{ success: true }> {
    const thread = await this.ownThreadOrThrow(auth0Id, id);
    await prisma.support_messages.updateMany({
      where: { thread_id: thread.thread_id, sender: 'admin', read_at: null },
      data: { read_at: new Date() },
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  /**
   * The stored file, for the user whose request it belongs to or for an
   * administrator. Anyone else gets "not found", whether or not the file
   * exists. The bytes are only read after that check passes.
   */
  async getAttachment(caller: AuthenticatedUser, rawId: string) {
    const id = toId(rawId, 'id');
    const notFound = () =>
      new NotFoundException({
        code: SupportErrorCode.AttachmentNotFound,
        message: 'Attachment not found',
      });

    if (!caller.roles.includes(AppRole.CcaeAdmin)) {
      const userId = await this.userIdFor(caller.id);
      const message = await prisma.support_messages.findFirst({
        where: { attachment_id: id },
        select: { thread_id: true },
      });
      const thread = message
        ? await prisma.support_threads.findUnique({
            where: { thread_id: message.thread_id },
          })
        : null;
      if (userId === null || !thread || thread.user_id !== userId) {
        throw notFound();
      }
    }

    const attachment = await prisma.support_attachments.findUnique({
      where: { attachment_id: id },
    });
    if (!attachment) throw notFound();
    return attachment;
  }

  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  /** The numeric user id for an Auth0 id, without creating a row for a stranger. */
  private async userIdFor(auth0Id: string): Promise<bigint | null> {
    const row = await prisma.users.findUnique({
      where: { auth0Id },
      select: { userid: true },
    });
    return row?.userid ?? null;
  }

  private async threadOrThrow(rawId: string): Promise<ThreadRow> {
    const thread = await prisma.support_threads.findUnique({
      where: { thread_id: toId(rawId, 'id') },
    });
    if (!thread) throw threadNotFound();
    return thread;
  }

  private async ownThreadOrThrow(
    auth0Id: string,
    rawId: string,
  ): Promise<ThreadRow> {
    const [userId, thread] = await Promise.all([
      this.userIdFor(auth0Id),
      prisma.support_threads.findUnique({
        where: { thread_id: toId(rawId, 'id') },
      }),
    ]);
    if (userId === null || !thread || thread.user_id !== userId) {
      throw threadNotFound();
    }
    return thread;
  }

  private async loadMessages(threadId: bigint): Promise<SupportMessageView[]> {
    const rows: MessageRow[] = await prisma.support_messages.findMany({
      where: { thread_id: threadId },
      orderBy: [{ sent_at: 'asc' }, { message_id: 'asc' }],
    });
    const attachmentIds = rows.flatMap((r) =>
      r.attachment_id === null ? [] : [r.attachment_id],
    );
    // Details only. The file bytes are never loaded to list a conversation.
    const files =
      attachmentIds.length === 0
        ? []
        : await prisma.support_attachments.findMany({
            where: { attachment_id: { in: attachmentIds } },
            select: {
              attachment_id: true,
              filename: true,
              mime_type: true,
              size_bytes: true,
            },
          });

    return rows.map((row) => {
      const file = files.find((f) => f.attachment_id === row.attachment_id);
      return this.toView(
        row,
        file
          ? {
              id: file.attachment_id.toString(),
              filename: file.filename,
              mimeType: file.mime_type,
              sizeBytes: file.size_bytes,
            }
          : null,
      );
    });
  }

  private toView(
    row: MessageRow,
    attachment: AttachmentInfo | null,
  ): SupportMessageView {
    return {
      id: row.message_id.toString(),
      sender: row.sender === 'admin' ? 'admin' : 'user',
      content: row.content,
      sentAt: row.sent_at.toISOString(),
      readAt: row.read_at?.toISOString() ?? null,
      attachment,
    };
  }

  private toDetail(
    thread: ThreadRow,
    messages: SupportMessageView[],
  ): SupportThreadDetail {
    return {
      id: thread.thread_id.toString(),
      subject: thread.subject,
      status: asStatus(thread.status),
      createdAt: thread.created_at.toISOString(),
      updatedAt: thread.updated_at.toISOString(),
      messages,
    };
  }

  /**
   * Tells the user there is something from CCAE. A failure here is logged and
   * swallowed: the message is already saved and visible in Messages, and
   * failing the request would tell the administrator it had not been sent.
   */
  private async notify(
    target: { auth0Id: string; role: string | null },
    text: { title: string; description: string },
  ): Promise<void> {
    try {
      await this.notifications.create({
        recipientId: target.auth0Id,
        type: 'admin',
        title: text.title,
        description: text.description,
        actionLabel: 'Open message',
        href:
          target.role === AppRole.UnitCoordinator
            ? MESSAGES_HREF[AppRole.UnitCoordinator]
            : MESSAGES_HREF[AppRole.GuestSpeaker],
      });
    } catch (error) {
      this.logger.warn(
        `Could not notify the user of a CCAE message: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
  }
}
