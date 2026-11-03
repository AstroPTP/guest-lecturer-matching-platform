import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
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

    // A session is completed only after the guest lecturer confirmed it, so an
    // invitation nobody answered, or one that was declined, cannot be.
    if (status === 'completed' && event.status !== 'accepted') {
      throw new ConflictException({
        code: ErrorCode.Conflict,
        message: `This session is ${STATUS_WORDS[event.status as EventStatus] ?? event.status}, so it cannot be marked completed.`,
      });
    }

    const now = new Date();
    const row = await prisma.events.update({
      where: { event_id: event.event_id },
      data: {
        status,
        ...(status === 'accepted' || status === 'declined'
          ? { responded_at: now }
          : {}),
        ...(status === 'completed' ? { completed_at: now } : {}),
      },
      include: { match: matchParties },
    });

    await this.notifyStatusChange(row, status);
    return this.toEvent(row);
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
