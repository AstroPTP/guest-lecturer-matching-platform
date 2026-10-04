import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma';
import { MatchRequestsService } from '../match-requests/match-requests.service';

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
  constructor(private readonly matchRequests: MatchRequestsService) {}

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
    const { side, matchId } = await this.matchRequests.findAcceptedMatch(
      auth0Id,
      targetId,
    );
    const rows = await prisma.messages.findMany({
      where: { match_id: matchId },
      orderBy: { sent_at: 'asc' },
    });

    return rows.map((row) => this.toMessage(side, row));
  }

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

    return this.toMessage(side, row);
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
