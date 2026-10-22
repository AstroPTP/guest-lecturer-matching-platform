// cspell:ignore deletedat
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { profileImageUrl } from '../images/images.service';
import { prisma } from '../prisma';
import {
  DEFAULT_LIMIT,
  type SuggestionsQueryDto,
} from './dto/suggestions-query.dto';
import {
  coversSession,
  exposureScore,
  fitScore,
  isReliable,
  overlaps,
  parseClock,
  rankScore,
  reliabilityScore,
  rotationScore,
  sharedTopics,
  weekdayOf,
} from './scoring';

/** Where the coordinator already stands with a suggested lecturer. */
export type SuggestionMatchStatus =
  | 'none'
  | 'interest-sent'
  | 'interest-received'
  | 'matched';

export interface Suggestion {
  /** The same id Discovery and Matches use for this lecturer. */
  guestId: string;
  name: string;
  field: string;
  role: string;
  photoUrl: string;
  /** The requested topics this lecturer covers, as they wrote them. */
  sharedTopics: string[];
  matchStatus: SuggestionMatchStatus;
  /** The ordering score, 0 to 100. */
  score: number;
  /** The three parts of the score, each 0 to 100, before weighting. */
  fit: number;
  rotation: number;
  exposure: number;
  /** Bayesian reliability, 0 to 100. A pass or fail gate, not part of score. */
  reliability: number;
  sessionsSoFar: number;
  /** When the lecturer last matched with anyone, or null if never. */
  lastSessionAt: string | null;
}

/**
 * How many lecturers are left after each rule, in the order the rules run.
 * Each number is cumulative, so it never rises from one rule to the next.
 */
export interface SuggestionStages {
  /** Every lecturer profile on the platform. */
  considered: number;
  eligible: number;
  available: number;
  sharesTopic: number;
  reliable: number;
}

export interface SuggestionsResult {
  session: {
    date: string;
    startTime: string;
    endTime: string;
    topics: string[];
  };
  stages: SuggestionStages;
  /** Best first, at most `limit`. `stages.reliable` is how many were ranked. */
  suggestions: Suggestion[];
}

/** Match states that end the coordinator's interest in that lecturer for good. */
const CLOSED_MATCH_STATUSES = new Set(['UNMATCHED', 'REJECTED']);

/** Event states that still hold the lecturer's time. */
const TIME_HOLDING_EVENT_STATUSES = ['invitation-sent', 'accepted'];

/**
 * Ranks the guest lecturers who could give one session, for one coordinator.
 *
 * Nothing is stored. There is no migration, no ranking table and no counter
 * to keep in step. How many sessions a lecturer has had, and when they last
 * had one, are read from the ACCEPTED rows of `match_requests` each time, and
 * a lecturer's record of delivering sessions is read from `events`. Those are
 * the same rows the Matches and Event pages show, so the list cannot disagree
 * with them or drift away from them.
 *
 * The rules, in order (the arithmetic is in ./scoring.ts):
 *
 *   1. Eligible: a finished profile, consent to be matched, an active account,
 *      and not dismissed or unmatched by this coordinator.
 *   2. Available: the lecturer's weekly window holds the whole session, and no
 *      open event of theirs overlaps it.
 *   3. Shares a topic: at least one of the requested topics.
 *   4. Reliable: a Bayesian record of delivering the sessions they accepted.
 *
 * Whoever passes is ranked by fit, then time since their last session, then
 * fewer sessions so far. Nobody is removed for being popular: a lecturer with
 * many sessions only ranks lower.
 *
 * "Sessions so far" counts a lecturer's ACCEPTED matches with every
 * coordinator, not only this one, because the aim is to spread sessions across
 * the whole pool. A match is counted as soon as both sides have agreed,
 * whether or not an event has been created for it yet.
 */
@Injectable()
export class SuggestionsService {
  async suggest(
    auth0Id: string,
    query: SuggestionsQueryDto,
    now: Date = new Date(),
  ): Promise<SuggestionsResult> {
    const session = this.readSession(query);
    const coordinatorId = await this.findCoordinatorId(auth0Id);

    // Rule 1: eligible.
    const guests = await prisma.guests.findMany({
      orderBy: { guest_id: 'asc' },
      select: {
        guest_id: true,
        user_id: true,
        first_name: true,
        last_name: true,
        field: true,
        role: true,
        profile_image_id: true,
        users: {
          select: { userid: true, deletedat: true, consentstate: true },
        },
      },
    });
    const [dismissed, ownMatches] = await Promise.all([
      prisma.dismissals.findMany({
        where: { coordinator_id: coordinatorId, dismissed_by: 'coordinator' },
        select: { guest_id: true },
      }),
      prisma.match_requests.findMany({
        where: { coordinator_id: coordinatorId },
        select: { guest_id: true, status: true, requested_by: true },
      }),
    ]);

    const dismissedIds = new Set(dismissed.map((row) => row.guest_id));
    const ownMatchByGuest = new Map(
      ownMatches.map((row) => [row.guest_id, row]),
    );

    const eligible = guests.flatMap((guest) => {
      const account = guest.users;
      const own = ownMatchByGuest.get(guest.guest_id);
      const isEligible =
        guest.user_id !== null &&
        account !== null &&
        account.deletedat === null &&
        account.consentstate === true &&
        Boolean(guest.first_name?.trim()) &&
        !dismissedIds.has(guest.guest_id) &&
        !CLOSED_MATCH_STATUSES.has(own?.status ?? '');
      return isEligible && account ? [{ guest, userId: account.userid }] : [];
    });

    const stages: SuggestionStages = {
      considered: guests.length,
      eligible: eligible.length,
      available: 0,
      sharesTopic: 0,
      reliable: 0,
    };

    // Rules 2 and 3 read three small tables for the eligible lecturers.
    const eligibleUserIds = eligible.map((entry) => entry.userId);
    const eligibleGuestIds = eligible.map((entry) => entry.guest.guest_id);
    const [availabilityRows, expertiseRows, openEvents] = await Promise.all([
      prisma.availability.findMany({
        where: { user_id: { in: eligibleUserIds } },
      }),
      prisma.user_expertise.findMany({
        where: { user_id: { in: eligibleUserIds } },
      }),
      prisma.events.findMany({
        where: {
          date: session.date,
          status: { in: TIME_HOLDING_EVENT_STATUSES },
          match: { guest_id: { in: eligibleGuestIds } },
        },
        select: {
          start_time: true,
          end_time: true,
          match: { select: { guest_id: true } },
        },
      }),
    ]);

    // Rule 2: available.
    const busyGuestIds = new Set<bigint>();
    for (const event of openEvents) {
      const start = parseClock(event.start_time);
      const end = parseClock(event.end_time);
      if (
        start !== null &&
        end !== null &&
        overlaps(session.startMinutes, session.endMinutes, start, end)
      ) {
        busyGuestIds.add(event.match.guest_id);
      }
    }

    const available = eligible.filter((entry) => {
      const windows = availabilityRows.filter(
        (row) => row.user_id === entry.userId,
      );
      return (
        !busyGuestIds.has(entry.guest.guest_id) &&
        windows.some((window) =>
          coversSession(
            window,
            session.weekday,
            session.startMinutes,
            session.endMinutes,
          ),
        )
      );
    });
    stages.available = available.length;

    // Rule 3: shares a topic.
    const relevant = available.flatMap((entry) => {
      const offered = expertiseRows
        .filter((row) => row.user_id === entry.userId)
        .map((row) => row.expertise);
      const shared = sharedTopics(query.topics, offered);
      return shared.length > 0
        ? [{ ...entry, shared, fit: fitScore(query.topics, offered) }]
        : [];
    });
    stages.sharesTopic = relevant.length;

    // Rule 4: reliable. Read only for the lecturers still in the running.
    const relevantGuestIds = relevant.map((entry) => entry.guest.guest_id);
    const [record, acceptedMatches] = await Promise.all([
      prisma.events.findMany({
        where: {
          match: { guest_id: { in: relevantGuestIds } },
          OR: [
            { status: 'completed' },
            // Accepted by the lecturer, then cancelled. A cancelled invitation
            // they never answered is not a broken commitment.
            { status: 'cancelled', responded_at: { not: null } },
          ],
        },
        select: { status: true, match: { select: { guest_id: true } } },
      }),
      prisma.match_requests.findMany({
        where: { guest_id: { in: relevantGuestIds }, status: 'ACCEPTED' },
        select: { guest_id: true, requested_at: true, updated_at: true },
      }),
    ]);

    const completedBy = new Map<bigint, number>();
    const brokenBy = new Map<bigint, number>();
    for (const event of record) {
      const tally = event.status === 'completed' ? completedBy : brokenBy;
      tally.set(
        event.match.guest_id,
        (tally.get(event.match.guest_id) ?? 0) + 1,
      );
    }

    const sessionsBy = new Map<bigint, number>();
    const lastSessionBy = new Map<bigint, Date>();
    for (const match of acceptedMatches) {
      sessionsBy.set(match.guest_id, (sessionsBy.get(match.guest_id) ?? 0) + 1);
      // updated_at is when the second side said yes. Older rows may lack it.
      const when = match.updated_at ?? match.requested_at;
      const latest = lastSessionBy.get(match.guest_id);
      if (when && (!latest || when > latest)) {
        lastSessionBy.set(match.guest_id, when);
      }
    }

    const ranked = relevant.flatMap((entry) => {
      const guestId = entry.guest.guest_id;
      const reliability = reliabilityScore(
        completedBy.get(guestId) ?? 0,
        brokenBy.get(guestId) ?? 0,
      );
      if (!isReliable(reliability)) {
        return [];
      }

      const sessionsSoFar = sessionsBy.get(guestId) ?? 0;
      const lastSessionAt = lastSessionBy.get(guestId) ?? null;
      const rotation = rotationScore(lastSessionAt, now);
      const exposure = exposureScore(sessionsSoFar);

      return [
        {
          entry,
          reliability,
          sessionsSoFar,
          lastSessionAt,
          rotation,
          exposure,
          score: rankScore(entry.fit, rotation, exposure),
        },
      ];
    });
    stages.reliable = ranked.length;

    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.fit - a.entry.fit ||
        (a.lastSessionAt?.getTime() ?? 0) - (b.lastSessionAt?.getTime() ?? 0) ||
        a.sessionsSoFar - b.sessionsSoFar ||
        (a.entry.guest.guest_id < b.entry.guest.guest_id ? -1 : 1),
    );

    const suggestions = ranked
      .slice(0, query.limit ?? DEFAULT_LIMIT)
      .map((item): Suggestion => {
        const { guest } = item.entry;
        return {
          guestId: String(guest.guest_id),
          name: [guest.first_name, guest.last_name].filter(Boolean).join(' '),
          field: guest.field ?? '',
          role: guest.role ?? '',
          photoUrl: profileImageUrl(guest.profile_image_id),
          sharedTopics: item.entry.shared,
          matchStatus: this.matchStatusOf(ownMatchByGuest.get(guest.guest_id)),
          score: toPercent(item.score),
          fit: toPercent(item.entry.fit),
          rotation: toPercent(item.rotation),
          exposure: toPercent(item.exposure),
          reliability: Math.round(item.reliability * 10) / 10,
          sessionsSoFar: item.sessionsSoFar,
          lastSessionAt: item.lastSessionAt?.toISOString() ?? null,
        };
      });

    return {
      session: {
        date: query.date,
        startTime: query.startTime,
        endTime: query.endTime,
        topics: query.topics,
      },
      stages,
      suggestions,
    };
  }

  /** Checks the date and times, which the DTO can only check the shape of. */
  private readSession(query: SuggestionsQueryDto) {
    const weekday = weekdayOf(query.date);
    const startMinutes = parseClock(query.startTime);
    const endMinutes = parseClock(query.endTime);

    if (weekday === null) {
      throw this.badRequest('date is not a real calendar date');
    }
    if (startMinutes === null || endMinutes === null) {
      throw this.badRequest('startTime and endTime must be HH:MM');
    }
    if (endMinutes <= startMinutes) {
      throw this.badRequest('endTime must be later than startTime');
    }
    return { date: query.date, weekday, startMinutes, endMinutes };
  }

  private badRequest(message: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.ValidationFailed,
      message,
    });
  }

  /**
   * The caller's coordinator profile. A read only: it never creates the user
   * row, so asking for suggestions cannot leave a half-made account behind.
   */
  private async findCoordinatorId(auth0Id: string): Promise<bigint> {
    const user = await prisma.users.findUnique({
      where: { auth0Id },
      select: { userid: true },
    });
    const coordinator = user
      ? await prisma.coordinators.findUnique({
          where: { user_id: user.userid },
          select: { coordinator_id: true },
        })
      : null;
    if (!coordinator) {
      throw new ForbiddenException(
        'Complete your profile before asking for suggested speakers.',
      );
    }
    return coordinator.coordinator_id;
  }

  private matchStatusOf(
    row: { status: string | null; requested_by: string | null } | undefined,
  ): SuggestionMatchStatus {
    if (!row) {
      return 'none';
    }
    if (row.status === 'ACCEPTED') {
      return 'matched';
    }
    // Rows from before requested_by existed were all sent by coordinators.
    return (row.requested_by ?? 'coordinator') === 'coordinator'
      ? 'interest-sent'
      : 'interest-received';
  }
}

/** A 0 to 1 value as a percentage with one decimal place. */
function toPercent(value: number): number {
  return Math.round(value * 1000) / 10;
}
