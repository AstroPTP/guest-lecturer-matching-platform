import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { isUniqueViolation } from '../common/prisma-errors';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma, resolveUserId, toId } from '../prisma';

export type Side = 'coordinator' | 'guest';

interface CallerSide {
  side: Side;
  ownId: bigint;
}

/** A match request as the caller sees it: who it is with, and where it stands. */
export interface MatchRequest {
  matchId: string;
  targetId: string;
  status: string;
  requestedAt: string;
  /** True when the caller sent it, false when it came from the other side. */
  sentByMe: boolean;
}

interface MatchRequestRow {
  match_id: bigint;
  coordinator_id: bigint;
  guest_id: bigint;
  status: string | null;
  requested_at: Date | null;
  requested_by: string | null;
}

/**
 * Match requests between a coordinator and a guest. Every route acts on the
 * caller's own requests: their side of the pair comes from their token, and
 * only the other profile's id comes from the request.
 */
@Injectable()
export class MatchRequestsService {
  constructor(private readonly notificationsService: NotificationsService) {}

  async findMine(auth0Id: string): Promise<MatchRequest[]> {
    const caller = await this.resolveSide(auth0Id);
    const rows = await prisma.match_requests.findMany({
      where:
        caller.side === 'coordinator'
          ? { coordinator_id: caller.ownId }
          : { guest_id: caller.ownId },
      orderBy: { requested_at: 'desc' },
    });

    return rows.map((row) => this.toMatchRequest(caller, row));
  }

  /**
   * Raises a request against another profile. When the other side already sent
   * one, this accepts it instead, which is what makes a match. Asking twice
   * returns the request that already exists.
   */
  async create(auth0Id: string, targetId: string): Promise<MatchRequest> {
    const caller = await this.resolveSide(auth0Id);
    const target = toId(targetId, 'targetId');
    await this.assertTargetExists(caller.side, target);

    const pair = this.toPair(caller, target);
    const now = new Date();
    const existing = await prisma.match_requests.findUnique({
      where: { coordinator_id_guest_id: pair },
    });

    if (!existing) {
      try {
        const row = await prisma.match_requests.create({
          data: {
            ...pair,
            status: 'PENDING',
            requested_by: caller.side,
            requested_at: now,
            updated_at: now,
          },
        });
        return this.toMatchRequest(caller, row);
      } catch (error) {
        // A request for the same pair landed first; go again against its row.
        if (isUniqueViolation(error)) {
          return this.create(auth0Id, targetId);
        }
        throw error;
      }
    }

    const isPending = (existing.status ?? 'PENDING') === 'PENDING';
    if (isPending && this.senderOf(existing) !== caller.side) {
      // Only moves a row still in the state just read, so when two accepts race
      // just one of them makes the match and sends the notifications.
      const { count } = await prisma.match_requests.updateMany({
        where: { match_id: existing.match_id, status: existing.status },
        data: { status: 'ACCEPTED', updated_at: now },
      });
      if (count === 1) {
        await this.notifyMatch(pair);
      }
      return this.toMatchRequest(caller, {
        ...existing,
        status: 'ACCEPTED',
      });
    }

    return this.toMatchRequest(caller, existing);
  }

  /**
   * The caller's side and every match they are in, for features that only
   * open once two people have matched, such as messaging.
   */
  async findAcceptedMatches(
    auth0Id: string,
    statuses: string[] = ['ACCEPTED'],
  ): Promise<{ side: Side; matches: { matchId: bigint; targetId: string }[] }> {
    const caller = await this.resolveSide(auth0Id);
    const rows = await prisma.match_requests.findMany({
      where: {
        status: { in: statuses },
        ...(caller.side === 'coordinator'
          ? { coordinator_id: caller.ownId }
          : { guest_id: caller.ownId }),
      },
    });

    return {
      side: caller.side,
      matches: rows.map((row) => ({
        matchId: row.match_id,
        targetId: this.toMatchRequest(caller, row).targetId,
      })),
    };
  }

  /** The caller's match with one profile; refused unless both sides agreed. */
  async findAcceptedMatch(
    auth0Id: string,
    targetId: string,
  ): Promise<{ side: Side; matchId: bigint }> {
    const caller = await this.resolveSide(auth0Id);
    const row = await prisma.match_requests.findUnique({
      where: {
        coordinator_id_guest_id: this.toPair(
          caller,
          toId(targetId, 'targetId'),
        ),
      },
    });
    if (row?.status !== 'ACCEPTED') {
      throw new ForbiddenException({
        code: ErrorCode.AuthzInsufficientRole,
        message: 'You can only message people you have matched with.',
      });
    }

    return { side: caller.side, matchId: row.match_id };
  }

  /** Withdraws a request or ends a match; the messages under it cascade. */
  /**
   * Withdraws a request that is not a match yet, or ends a match.
   *
   * Ending a match keeps the row as UNMATCHED rather than deleting it, so the
   * pair stays hidden from each other's Discovery and their event history is
   * kept. Events still to come are cancelled, and the other person is told.
   */
  async remove(auth0Id: string, targetId: string): Promise<void> {
    const caller = await this.resolveSide(auth0Id);
    const pair = this.toPair(caller, toId(targetId, 'targetId'));
    const existing = await prisma.match_requests.findUnique({
      where: { coordinator_id_guest_id: pair },
    });
    if (!existing || existing.status === 'UNMATCHED') {
      return;
    }

    if (existing.status !== 'ACCEPTED') {
      await prisma.match_requests.deleteMany({ where: pair });
      return;
    }

    const now = new Date();
    // Only the request that moves the row sends the notification, so a second
    // click arriving together does not notify twice.
    const { count } = await prisma.match_requests.updateMany({
      where: { match_id: existing.match_id, status: 'ACCEPTED' },
      data: { status: 'UNMATCHED', updated_at: now },
    });
    if (count !== 1) {
      return;
    }

    await prisma.events.updateMany({
      where: {
        match_id: existing.match_id,
        status: { in: ['invitation-sent', 'accepted'] },
      },
      data: { status: 'cancelled' },
    });
    await this.notifyUnmatch(pair, caller.side);
  }

  private async resolveSide(auth0Id: string): Promise<CallerSide> {
    const userId = await resolveUserId(auth0Id);

    const coordinator = await prisma.coordinators.findUnique({
      where: { user_id: userId },
      select: { coordinator_id: true },
    });
    if (coordinator) {
      return { side: 'coordinator', ownId: coordinator.coordinator_id };
    }

    const guest = await prisma.guests.findUnique({
      where: { user_id: userId },
      select: { guest_id: true },
    });
    if (guest) {
      return { side: 'guest', ownId: guest.guest_id };
    }

    throw new ForbiddenException(
      'Complete your profile before sending match requests.',
    );
  }

  /** Both people in a pair: their Auth0 id, to notify, and their name. */
  private async loadParties(pair: {
    coordinator_id: bigint;
    guest_id: bigint;
  }): Promise<Record<Side, { auth0Id?: string; name: string }>> {
    const profile = {
      first_name: true,
      last_name: true,
      users: { select: { auth0Id: true } },
    };
    const [coordinator, guest] = await Promise.all([
      prisma.coordinators.findUnique({
        where: { coordinator_id: pair.coordinator_id },
        select: profile,
      }),
      prisma.guests.findUnique({
        where: { guest_id: pair.guest_id },
        select: profile,
      }),
    ]);

    const toParty = (person: typeof coordinator) => ({
      auth0Id: person?.users?.auth0Id,
      name:
        [person?.first_name, person?.last_name].filter(Boolean).join(' ') ||
        'someone',
    });
    return { coordinator: toParty(coordinator), guest: toParty(guest) };
  }

  /**
   * Tells both people they matched. Recipients are Auth0 ids, which is what the
   * notifications list is read by.
   */
  private async notifyMatch(pair: {
    coordinator_id: bigint;
    guest_id: bigint;
  }): Promise<void> {
    const parties = await this.loadParties(pair);
    const notices = [
      {
        recipientId: parties.coordinator.auth0Id,
        name: parties.guest.name,
        href: '/unit_coordinator/matches',
      },
      {
        recipientId: parties.guest.auth0Id,
        name: parties.coordinator.name,
        href: '/guest_lecturer/matches',
      },
    ];

    for (const notice of notices) {
      if (notice.recipientId) {
        await this.notificationsService.create({
          recipientId: notice.recipientId,
          type: 'match',
          title: "It's a match!",
          description: 'You matched with ' + notice.name + '.',
          actionLabel: 'View match',
          href: notice.href,
        });
      }
    }
  }

  /** Tells the other person that the caller ended the match. */
  private async notifyUnmatch(
    pair: { coordinator_id: bigint; guest_id: bigint },
    callerSide: Side,
  ): Promise<void> {
    const parties = await this.loadParties(pair);
    const otherSide: Side =
      callerSide === 'coordinator' ? 'guest' : 'coordinator';
    const recipientId = parties[otherSide].auth0Id;
    if (!recipientId) {
      return;
    }

    await this.notificationsService.create({
      recipientId,
      type: 'match',
      title: 'Match ended',
      description:
        parties[callerSide].name +
        ' ended your match. Upcoming events with them were cancelled.',
      actionLabel: 'View matches',
      href:
        otherSide === 'coordinator'
          ? '/unit_coordinator/matches'
          : '/guest_lecturer/matches',
    });
  }

  /** A coordinator requests guests, and a guest requests coordinators. */
  private async assertTargetExists(side: Side, target: bigint): Promise<void> {
    const exists =
      side === 'coordinator'
        ? await prisma.guests.findUnique({
            where: { guest_id: target },
            select: { guest_id: true },
          })
        : await prisma.coordinators.findUnique({
            where: { coordinator_id: target },
            select: { coordinator_id: true },
          });
    if (!exists) {
      throw new NotFoundException('That profile does not exist.');
    }
  }

  private toPair(caller: CallerSide, target: bigint) {
    return caller.side === 'coordinator'
      ? { coordinator_id: caller.ownId, guest_id: target }
      : { coordinator_id: target, guest_id: caller.ownId };
  }

  private toMatchRequest(
    caller: CallerSide,
    row: MatchRequestRow,
  ): MatchRequest {
    return {
      matchId: String(row.match_id),
      targetId: String(
        caller.side === 'coordinator' ? row.guest_id : row.coordinator_id,
      ),
      status: row.status ?? 'PENDING',
      requestedAt: row.requested_at?.toISOString() ?? '',
      sentByMe: this.senderOf(row) === caller.side,
    };
  }

  /** Rows from before requested_by existed were all sent by coordinators. */
  private senderOf(row: MatchRequestRow): Side {
    return row.requested_by === 'guest' ? 'guest' : 'coordinator';
  }
}
