import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { buildEventIcs, minutesOfDay } from './event-calendar';
import { adminSessionNotice } from './event-notice';
import { buildPrefill, type EventPrefill } from './event-prefill';
import { ErrorCode } from '../common/error-codes';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { prisma, toId } from '../prisma';

export type EventStatus =
  | 'invitation-sent'
  | 'accepted'
  | 'declined'
  | 'completed'
  | 'cancelled';

/**
 * An event in the shape the pages read. coordinatorId and guestLecturerId are
 * the two profile ids, the same ids Discovery and Matches use.
 */
export interface Event extends CreateEventDto {
  id: string;
  coordinatorId: string;
  status: EventStatus;
  createdAt: string;
  respondedAt?: string;
  completedAt?: string;
}

const GUEST_LECTURER_ACTIONS: EventStatus[] = ['accepted', 'declined'];
const COORDINATOR_ACTIONS: EventStatus[] = ['cancelled', 'completed'];

/**
 * The statuses an event may be moved from, by the status it is moved to. A
 * page that was opened before the other person acted still offers the old
 * buttons, and this keeps a late click from undoing what they did, such as a
 * guest accepting an invitation the coordinator has since cancelled.
 */
const MOVES_FROM: Record<EventStatus, EventStatus[]> = {
  'invitation-sent': [],
  accepted: ['invitation-sent'],
  declined: ['invitation-sent'],
  cancelled: ['invitation-sent', 'accepted'],
  completed: ['accepted'],
};

const STATUS_WORDS: Record<EventStatus, string> = {
  'invitation-sent': 'still waiting for a reply',
  accepted: 'confirmed',
  declined: 'declined',
  cancelled: 'cancelled',
  completed: 'completed',
};

/** The match columns an event needs: both profile ids and both Auth0 ids. */
const matchParties = {
  select: {
    coordinator_id: true,
    guest_id: true,
    coordinator: { select: { users: { select: { auth0Id: true } } } },
    guest: { select: { users: { select: { auth0Id: true } } } },
  },
} as const;

type EventRow = {
  event_id: bigint;
  match_id: bigint;
  coordinator_name: string;
  guest_lecturer_name: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  format: string;
  status: string;
  created_at: Date;
  responded_at: Date | null;
  completed_at: Date | null;
  match: {
    coordinator_id: bigint;
    guest_id: bigint;
    coordinator: { users: { auth0Id: string } | null };
    guest: { users: { auth0Id: string } | null };
  };
};

/**
 * Events between a coordinator and a guest they matched with, stored so they
 * survive a restart. Every event hangs off a match, so who may see or change
 * it follows from the caller's own matches.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly matchRequests: MatchRequestsService,
  ) {}

  /**
   * Invites the matched guest named by guestLecturerId. The match is looked up
   * from the caller's token rather than taken from dto.matchId, so a
   * coordinator can only invite someone they actually matched with.
   */
  async create(
    dto: CreateEventDto,
    coordinatorAuth0Id: string,
  ): Promise<Event> {
    const { side, matchId } = await this.matchRequests.findAcceptedMatch(
      coordinatorAuth0Id,
      dto.guestLecturerId,
    );
    if (side !== 'coordinator') {
      throw new ForbiddenException('Only coordinators can create events');
    }
    // Compared as minutes, so the end is checked against the start rather than
    // as text. A session that ends before it starts cannot go in a calendar.
    const startsAt = minutesOfDay(dto.startTime);
    const endsAt = minutesOfDay(dto.endTime);
    if (startsAt === null || endsAt === null || endsAt <= startsAt) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: 'The end time must be later than the start time',
      });
    }

    const row = await prisma.events.create({
      data: {
        match_id: matchId,
        coordinator_name: dto.coordinatorName,
        guest_lecturer_name: dto.guestLecturerName,
        title: dto.title,
        description: dto.description,
        date: dto.date,
        start_time: dto.startTime,
        end_time: dto.endTime,
        location: dto.location,
        format: dto.format,
      },
      include: { match: matchParties },
    });

    const guestAuth0Id = row.match.guest.users?.auth0Id;
    if (guestAuth0Id) {
      await this.notificationsService.create({
        recipientId: guestAuth0Id,
        type: 'event',
        title: 'New event invitation',
        description: `${row.coordinator_name} invited you to "${row.title}"`,
        actionLabel: 'View invitation',
        href: '/guest_lecturer/events',
      });
    }

    return this.toEvent(row);
  }

  /**
   * The caller's events, from either side of their matches. Ended matches are
   * included so their (cancelled) events stay in the history.
   */
  async findMine(auth0Id: string): Promise<Event[]> {
    const { matches } = await this.matchRequests.findAcceptedMatches(auth0Id, [
      'ACCEPTED',
      'UNMATCHED',
    ]);
    if (matches.length === 0) {
      return [];
    }

    const rows = await prisma.events.findMany({
      where: { match_id: { in: matches.map((match) => match.matchId) } },
      include: { match: matchParties },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => this.toEvent(row));
  }

  async updateStatus(
    id: string,
    status: EventStatus,
    callerAuth0Id: string,
  ): Promise<Event> {
    const { side, matches } =
      await this.matchRequests.findAcceptedMatches(callerAuth0Id);
    const event = await prisma.events.findUnique({
      where: { event_id: toId(id, 'id') },
    });
    // An event outside the caller's matches is reported as missing, so its
    // existence is not revealed.
    if (!event || !matches.some((match) => match.matchId === event.match_id)) {
      throw new NotFoundException('Event not found');
    }

    if (GUEST_LECTURER_ACTIONS.includes(status) && side !== 'guest') {
      throw new ForbiddenException(
        'You are not the invited guest lecturer for this event',
      );
    }
    if (COORDINATOR_ACTIONS.includes(status) && side !== 'coordinator') {
      throw new ForbiddenException(
        'You are not the coordinator for this event',
      );
    }

    // One conditional write, so the status is checked and changed in the same
    // statement. Two requests that arrive together, such as an accept and a
    // cancel or a double click, cannot both pass a check made beforehand: the
    // first moves the row and the second finds it no longer in a status it may
    // move from, and writes nothing.
    const now = new Date();
    const { count } = await prisma.events.updateMany({
      where: {
        event_id: event.event_id,
        status: { in: MOVES_FROM[status] },
      },
      data: {
        status,
        ...(status === 'accepted' || status === 'declined'
          ? { responded_at: now }
          : {}),
        ...(status === 'completed' ? { completed_at: now } : {}),
      },
    });

    if (count === 0) {
      // Read again for the message, since the status that stopped this request
      // is the one that is there now.
      const latest = await prisma.events.findUnique({
        where: { event_id: event.event_id },
        select: { status: true },
      });
      if (!latest) {
        throw new NotFoundException('Event not found');
      }
      throw new ConflictException({
        code: ErrorCode.Conflict,
        message: `This session is ${STATUS_WORDS[latest.status as EventStatus] ?? latest.status}, so it cannot be marked ${status}.`,
      });
    }

    const row = await prisma.events.findUnique({
      where: { event_id: event.event_id },
      include: { match: matchParties },
    });
    if (!row) {
      throw new NotFoundException('Event not found');
    }

    // Only a request that changed the row gets here, so only it notifies.
    await this.notifyStatusChange(row, status);
    return this.toEvent(row);
  }

  /**
   * Starting values for a session with one matched guest, drawn from the two
   * profiles. Only the caller's own accepted match is read: the match comes
   * from their token and the guest's profile id, as it does when the event is
   * created.
   */
  async prefill(
    guestLecturerId: string,
    coordinatorAuth0Id: string,
  ): Promise<EventPrefill> {
    const { side, matchId } = await this.matchRequests.findAcceptedMatch(
      coordinatorAuth0Id,
      guestLecturerId,
    );
    if (side !== 'coordinator') {
      throw new ForbiddenException('Only coordinators can schedule sessions');
    }

    const match = await prisma.match_requests.findUnique({
      where: { match_id: matchId },
      select: {
        guest_id: true,
        coordinator: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            learning_objective: true,
            discipline: true,
            duration: true,
            location: true,
            format_online: true,
            format_inperson: true,
            format_prerecorded: true,
          },
        },
        guest: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            format_online: true,
            format_inperson: true,
            format_prerecorded: true,
          },
        },
      },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const userIds = [match.coordinator.user_id, match.guest.user_id].filter(
      (userId): userId is bigint => userId !== null,
    );
    const topicRows =
      userIds.length === 0
        ? []
        : await prisma.user_expertise.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, expertise: true },
          });
    const topicsOf = (userId: bigint | null) =>
      topicRows
        .filter((row) => row.user_id === userId)
        .map((row) => row.expertise);

    return buildPrefill({
      matchId,
      guestProfileId: match.guest_id,
      coordinator: match.coordinator,
      guest: match.guest,
      coordinatorTopics: topicsOf(match.coordinator.user_id),
      guestTopics: topicsOf(match.guest.user_id),
    });
  }

  /**
   * The calendar file for a confirmed session. Only the event's own
   * coordinator or guest can have it, and only once it is confirmed; for
   * anyone else, and for an event in any other state, it is reported as
   * missing, so nothing about it is revealed.
   */
  async calendarFile(
    id: string,
    callerAuth0Id: string,
  ): Promise<{ eventId: string; ics: string }> {
    const notFound = () => new NotFoundException('Event not found');
    const { matches } = await this.matchRequests
      .findAcceptedMatches(callerAuth0Id)
      .catch((error: unknown) => {
        // Someone with no profile is a party to no event.
        throw error instanceof ForbiddenException ? notFound() : error;
      });
    const event = await prisma.events.findUnique({
      where: { event_id: toId(id, 'id') },
      include: { match: matchParties },
    });
    if (
      !event ||
      event.status !== 'accepted' ||
      !matches.some((match) => match.matchId === event.match_id)
    ) {
      throw notFound();
    }

    return {
      eventId: String(event.event_id),
      ics: buildEventIcs({
        id: String(event.event_id),
        title: event.title,
        description: event.description,
        date: event.date,
        startTime: event.start_time,
        endTime: event.end_time,
        location: event.location,
        coordinatorName: event.coordinator_name,
        guestLecturerName: event.guest_lecturer_name,
        stampedAt: event.responded_at ?? event.created_at,
      }),
    };
  }

  private async notifyStatusChange(
    event: EventRow,
    status: EventStatus,
  ): Promise<void> {
    const coordinatorAuth0Id = event.match.coordinator.users?.auth0Id;
    const guestAuth0Id = event.match.guest.users?.auth0Id;

    if (
      (status === 'accepted' || status === 'declined') &&
      coordinatorAuth0Id
    ) {
      await this.notificationsService.create({
        recipientId: coordinatorAuth0Id,
        type: 'event',
        title:
          status === 'accepted' ? 'Invitation accepted' : 'Invitation declined',
        description: `${event.guest_lecturer_name} ${status} your invitation to "${event.title}"`,
        actionLabel: 'View event',
        href: '/unit_coordinator/events',
      });
    }

    if ((status === 'cancelled' || status === 'completed') && guestAuth0Id) {
      await this.notificationsService.create({
        recipientId: guestAuth0Id,
        type: 'event',
        title:
          status === 'cancelled' ? 'Event cancelled' : 'Event marked complete',
        description: `"${event.title}" was ${status} by ${event.coordinator_name}`,
        actionLabel: 'View event',
        href: '/guest_lecturer/events',
      });
    }

    if (status === 'accepted' || status === 'cancelled') {
      await this.notifyAdmins(event, status);
    }
  }

  /**
   * Tells every active administrator that a session was confirmed or
   * cancelled. The change is already saved, so a notice that cannot be saved
   * is logged and dropped rather than failing the request that made it.
   */
  private async notifyAdmins(
    event: EventRow,
    status: 'accepted' | 'cancelled',
  ): Promise<void> {
    try {
      await this.notificationsService.createForAdmins(
        adminSessionNotice(event, status),
      );
    } catch (error) {
      this.logger.error(
        `Could not notify administrators that event ${event.event_id} was ${status}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private toEvent(row: EventRow): Event {
    return {
      id: String(row.event_id),
      matchId: String(row.match_id),
      coordinatorId: String(row.match.coordinator_id),
      coordinatorName: row.coordinator_name,
      guestLecturerId: String(row.match.guest_id),
      guestLecturerName: row.guest_lecturer_name,
      title: row.title,
      description: row.description,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      location: row.location,
      format: row.format as Event['format'],
      status: row.status as EventStatus,
      createdAt: row.created_at.toISOString(),
      ...(row.responded_at
        ? { respondedAt: row.responded_at.toISOString() }
        : {}),
      ...(row.completed_at
        ? { completedAt: row.completed_at.toISOString() }
        : {}),
    };
  }
}
