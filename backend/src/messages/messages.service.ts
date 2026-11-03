import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { personLabel } from '../notifications/person-label';

/** A message as the caller sees it. */
export interface Message {
  id: string;
  text: string;
  sentAt: string;
  /** True when the caller wrote it. */
  fromMe: boolean;
}

/** The latest message with one matched person, for the conversation list. */
export interface ConversationSummary {
  targetId: string;
  lastMessage: string;
  lastSentAt: string;
}

/**
 * Messages between two people who matched. A conversation is addressed by the
 * other person's profile id, and every route checks the caller is in that
 * match, so nobody can read or write someone else's thread.
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly matchRequests: MatchRequestsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The latest message in each of the caller's conversations. A conversation
   * with an open report or a hold stays in the list and stays readable: only
   * sending new messages is refused, so neither person loses the thread.
   */
  async findSummaries(auth0Id: string): Promise<ConversationSummary[]> {
    const { matches } = await this.matchRequests.findAcceptedMatches(auth0Id);
    if (matches.length === 0) {
      return [];
    }

    const rows = await prisma.messages.findMany({
      where: { match_id: { in: matches.map((match) => match.matchId) } },
      orderBy: { sent_at: 'desc' },
    });

    return matches.flatMap((match) => {
      const latest = rows.find((row) => row.match_id === match.matchId);
      return latest
        ? [
            {
              targetId: match.targetId,
              lastMessage: latest.content,
              lastSentAt: latest.sent_at?.toISOString() ?? '',
            },
          ]
        : [];
    });
  }

  async findThread(auth0Id: string, targetId: string): Promise<Message[]> {
    const { side, matchId } = await this.matchRequests.findReadableMatch(
      auth0Id,
      targetId,
    );
    const rows = await prisma.messages.findMany({
      where: { match_id: matchId },
      orderBy: { sent_at: 'asc' },
    });

    return rows.map((row) => this.toMessage(side, row));
  }

  /** Refused while the conversation is paused, which only stops new messages. */
  async send(
    auth0Id: string,
    targetId: string,
    content: string,
  ): Promise<Message> {
    const { side, matchId } = await this.matchRequests.findAcceptedMatch(
      auth0Id,
      targetId,
    );
    const row = await prisma.messages.create({
      data: {
        match_id: matchId,
        content,
        sent_by: side,
        sent_at: new Date(),
      },
    });
    await this.notifyRecipient(matchId, side);

    return this.toMessage(side, row);
  }

  /**
   * Tells the other person in the match they have a message. They keep one
   * unread notice per conversation, which each new message moves to the top,
   * so a burst of messages does not fill their bell.
   *
   * The message is already saved by now, so a notice that cannot be saved is
   * logged and dropped rather than failing a send that went through.
   */
  private async notifyRecipient(
    matchId: bigint,
    senderSide: 'coordinator' | 'guest',
  ): Promise<void> {
    try {
      const profile = {
        first_name: true,
        last_name: true,
        role: true,
        users: { select: { auth0Id: true } },
      };
      const match = await prisma.match_requests.findUnique({
        where: { match_id: matchId },
        select: {
          coordinator_id: true,
          guest_id: true,
          coordinator: { select: profile },
          guest: { select: profile },
        },
      });
      if (!match) {
        return;
      }

      const fromCoordinator = senderSide === 'coordinator';
      const sender = fromCoordinator ? match.coordinator : match.guest;
      const recipientId = (fromCoordinator ? match.guest : match.coordinator)
        .users?.auth0Id;
      if (!recipientId) {
        return;
      }

      // The id after "with" is the sender's profile, which is how this
      // conversation is addressed, and it keeps one conversation's notice apart
      // from another's. The Messages page does not read it yet.
      const senderId = fromCoordinator ? match.coordinator_id : match.guest_id;
      const messages = fromCoordinator
        ? '/guest_lecturer/messages'
        : '/unit_coordinator/messages';
      await this.notifications.createOrRefreshUnread({
        recipientId,
        type: 'message',
        title: 'New message',
        description: personLabel(sender) + ' sent you a message',
        actionLabel: 'Reply',
        href: messages + '?with=' + String(senderId),
      });
    } catch (error) {
      // Only the error's name: a database error's message can quote the
      // names and ids it was working with, and none of that belongs in a log.
      this.logger.warn(
        'Could not notify about a new message: ' +
          (error instanceof Error ? error.name : 'UnknownError'),
      );
    }
  }

  private toMessage(
    side: string,
    row: {
      message_id: bigint;
      content: string;
      sent_at: Date | null;
      sent_by: string | null;
    },
  ): Message {
    return {
      id: String(row.message_id),
      text: row.content,
      sentAt: row.sent_at?.toISOString() ?? '',
      fromMe: row.sent_by === side,
    };
  }
}
