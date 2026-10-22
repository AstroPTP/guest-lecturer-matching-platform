import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { isUniqueViolation } from '../common/prisma-errors';
import { personLabel } from '../notifications/person-label';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma, resolveUserId, toId } from '../prisma';
import {
  assertGuestCanBeContacted,
  visibleGuestsWhere,
} from '../admin/platform-rules';
import { visibleCoordinatorsWhere } from '../unit-coordinators/coordinator-visibility';
import {
  isConversationPaused,
  loadModerationState,
} from '../admin/open-reports';

export type Side = 'coordinator' | 'guest';

interface CallerSide {
  side: Side;
  ownId: bigint;
  /** users.userid of the caller. */
  userId: bigint;
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
  private readonly logger = new Logger(MatchRequestsService.name);

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
    await this.assertCanRequest(caller, auth0Id, target);

    const pair = this.toPair(caller, target);
    const now = new Date();
    const existing = await prisma.match_requests.findUnique({
      where: { coordinator_id_guest_id: pair },
    });

    if (!existing) {
      if (caller.side === 'coordinator') {
        await assertGuestCanBeContacted(pair.guest_id);
      }
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
        await this.notifyInterest(pair, caller.side);
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

  /**
   * The caller's match with one profile; refused unless both sides agreed, and
   * refused while the two have an open report between them, or either of them
   * is on hold, until an administrator decides.
   */
  async findAcceptedMatch(
    auth0Id: string,
    targetId: string,
  ): Promise<{ side: Side; matchId: bigint }> {
    const caller = await this.resolveSide(auth0Id);
    const row = await this.requireAcceptedRow(
      caller,
      targetId,
      'You can only message people you have matched with.',
    );
    await this.assertConversationNotPaused(caller, row);

    return { side: caller.side, matchId: row.match_id };
  }

  /**
   * The person on the other side of the caller's accepted match, for acting on
   * them rather than messaging them, such as reporting. A pause does not refuse
   * this: someone already reported can be reported by others, and a person on
   * hold can still report. The counterpart's user id is null for a profile that
   * was never linked to an account.
   */
  async findAcceptedCounterpart(
    auth0Id: string,
    targetId: string,
  ): Promise<{
    matchId: bigint;
    callerUserId: bigint;
    counterpartUserId: bigint | null;
  }> {
    const caller = await this.resolveSide(auth0Id);
    const row = await this.requireAcceptedRow(
      caller,
      targetId,
      'You can only report someone you have matched with.',
    );

    return {
      matchId: row.match_id,
      callerUserId: caller.userId,
      counterpartUserId: await this.counterpartUserId(caller, row),
    };
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

  /** The caller's row with one profile, refused with `message` unless ACCEPTED. */
  private async requireAcceptedRow(
    caller: CallerSide,
    targetId: string,
    message: string,
  ): Promise<MatchRequestRow> {
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
        message,
      });
    }
    return row;
  }

  /** users.userid of the other side of a match, if their profile has one. */
  private async counterpartUserId(
    caller: CallerSide,
    row: MatchRequestRow,
  ): Promise<bigint | null> {
    const profile =
      caller.side === 'coordinator'
        ? await prisma.guests.findUnique({
            where: { guest_id: row.guest_id },
            select: { user_id: true },
          })
        : await prisma.coordinators.findUnique({
            where: { coordinator_id: row.coordinator_id },
            select: { user_id: true },
          });
    return profile?.user_id ?? null;
  }

  /**
   * Refuses when messaging between the two is paused: an open report between
   * them, or either of them on hold. The message does not say which, or who
   * reported whom, so it tells neither person more than the other could see.
   */
  private async assertConversationNotPaused(
    caller: CallerSide,
    row: MatchRequestRow,
  ): Promise<void> {
    const state = await loadModerationState();
    if (state.reports.length === 0) {
      return;
    }

    const counterpart = await this.counterpartUserId(caller, row);
    if (isConversationPaused(state, caller.userId, counterpart)) {
      throw new ForbiddenException({
        code: 'CONVERSATION_PAUSED',
        message:
          'Messaging with this person is paused while an administrator reviews a report. It resumes if the report is dismissed.',
      });
    }
  }

  private async resolveSide(auth0Id: string): Promise<CallerSide> {
    const userId = await resolveUserId(auth0Id);

    const coordinator = await prisma.coordinators.findUnique({
      where: { user_id: userId },
      select: { coordinator_id: true },
    });
    if (coordinator) {
      return {
        side: 'coordinator',
        ownId: coordinator.coordinator_id,
        userId,
      };
    }

    const guest = await prisma.guests.findUnique({
      where: { user_id: userId },
      select: { guest_id: true },
    });
    if (guest) {
      return { side: 'guest', ownId: guest.guest_id, userId };
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

  /**
   * Tells the person a new request was made to that someone is interested.
   * Only a request that starts a pair comes here: accepting the other side's
   * request makes a match, which notifyMatch announces instead.
   *
   * The request is already saved by now, so a notice that cannot be saved is
   * logged and dropped rather than failing a request that went through.
   */
  private async notifyInterest(
    pair: { coordinator_id: bigint; guest_id: bigint },
    senderSide: Side,
  ): Promise<void> {
    try {
      const profile = {
        first_name: true,
        last_name: true,
        role: true,
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

      const fromCoordinator = senderSide === 'coordinator';
      const sender = fromCoordinator ? coordinator : guest;
      const recipientId = (fromCoordinator ? guest : coordinator)?.users
        ?.auth0Id;
      if (!recipientId) {
        return;
      }

      // Someone who dismissed this profile has hidden it from their Discovery,
      // so a notice about it would put it back in front of them. The request
      // itself still stands; only the notice is held back.
      const dismissed = await prisma.dismissals.findUnique({
        where: {
          coordinator_id_guest_id_dismissed_by: {
            ...pair,
            dismissed_by: fromCoordinator ? 'guest' : 'coordinator',
          },
        },
        select: { dismissal_id: true },
      });
      if (dismissed) {
        return;
      }

      // Discovery is where they answer: the sender's card is still there to
      // accept, which makes the match, or to dismiss. The id after "from" is
      // that card, so Discovery opens on it and a repeat from someone else is
      // not mistaken for this one.
      const senderId = fromCoordinator ? pair.coordinator_id : pair.guest_id;
      const discovery = fromCoordinator
        ? '/guest_lecturer/discovery'
        : '/unit_coordinator/discovery';
      await this.notificationsService.createUnlessRecent({
        recipientId,
        type: 'match',
        title: 'New interest',
        description: personLabel(sender) + ' is interested in working with you',
        actionLabel: 'View',
        href: discovery + '?from=' + String(senderId),
      });
    } catch (error) {
      // Only the error's name: a database error's message can quote the
      // names and ids it was working with, and none of that belongs in a log.
      this.logger.warn(
        'Could not notify about a new request: ' +
          (error instanceof Error ? error.name : 'UnknownError'),
      );
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

  /**
   * A coordinator requests guests, and a guest requests coordinators.
   *
   * Refused with the same 404 as a profile that does not exist when either end
   * is one Discovery hides from the caller: the target, or the caller's own
   * profile. That is the shared visibility rule, so a profile that is
   * deactivated, not yet approved while approval is required, on hold, or
   * reported by or against the caller cannot be reached by guessing its id,
   * and the 404 does not say which of those it was.
   */
  private async assertCanRequest(
    caller: CallerSide,
    auth0Id: string,
    target: bigint,
  ): Promise<void> {
    const [guestsWhere, coordinatorsWhere] = await Promise.all([
      visibleGuestsWhere(auth0Id),
      visibleCoordinatorsWhere(auth0Id),
    ]);

    const [own, other] =
      caller.side === 'coordinator'
        ? await Promise.all([
            prisma.coordinators.findFirst({
              where: { coordinator_id: caller.ownId, ...coordinatorsWhere },
              select: { coordinator_id: true },
            }),
            prisma.guests.findFirst({
              where: { guest_id: target, ...guestsWhere },
              select: { guest_id: true },
            }),
          ])
        : await Promise.all([
            prisma.guests.findFirst({
              where: { guest_id: caller.ownId, ...guestsWhere },
              select: { guest_id: true },
            }),
            prisma.coordinators.findFirst({
              where: { coordinator_id: target, ...coordinatorsWhere },
              select: { coordinator_id: true },
            }),
          ]);
    if (!own || !other) {
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
