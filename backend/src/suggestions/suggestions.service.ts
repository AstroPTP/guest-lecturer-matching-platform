// cspell:ignore deletedat
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { visibleGuestsWhere } from '../admin/platform-rules';
import { ErrorCode } from '../common/error-codes';
import { profileImageUrl } from '../images/images.service';
import { prisma } from '../prisma';
import { readMatchingSettings } from './matching-settings';
import {
  DEFAULT_LIMIT,
  type SuggestionsQueryDto,
} from './dto/suggestions-query.dto';
import {
  exposureScore,
  fitScore,
  isAvailable,
  isReliable,
  lastSessionBand,
  parseClock,
  rankScore,
  recordedAvailability,
  reliabilityScore,
  roundTo,
  rotationScore,
  sessionsBand,
  sharedTopics,
  weekdayOf,
  type LastSessionBand,
  type SessionsBand,
  type TimeWindow,
  type WeeklyAvailability,
} from './scoring';

/** Where the coordinator already stands with a suggested lecturer. */
export type SuggestionMatchStatus =
  | 'none'
  | 'interest-sent'
  | 'interest-received'
  | 'matched';

/**
 * The only part of a lecturer's score that leaves the server. Fit comes from
 * topics both sides have published, so it is safe to show, to 2 decimals, 0 to
 * 1. Rotation, exposure and the total are derived from other coordinators'
 * activity and are never returned: the order of the list already shows the
 * ranking, and the exact terms could be turned back into dates and counts.
 */
export interface SuggestionScore {
  fit: number;
}

/**
 * One suggested lecturer.
 *
 * Nothing here may let one coordinator read another's activity. The exact
 * session count, the exact date of the last session and the reliability figure
 * are all held back, and so are the rotation, exposure and total terms: the
 * server ranks on the exact values and the response carries only coarse bands
 * and the fit. Do not add a field that is, or can be inverted to, one of them.
 */
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
  score: SuggestionScore;
  /** How long since the lecturer last had a session with anyone. */
  lastSessionBand: LastSessionBand;
  /** How many sessions the lecturer has had with anyone. */
  sessionsBand: SessionsBand;
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

/** Where the topics used for the search came from. */
export type TopicsFrom = 'request' | 'profile' | 'none';

export interface SuggestionsResult {
  /** What the search used. A null was not asked for and so did not narrow it. */
  session: {
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    topics: string[];
    /**
     * "request" when the caller named topics, "profile" when none were named
     * and the coordinator's own expertise was used, "none" when neither exists
     * and so no topic rule was applied.
     */
    topicsFrom: TopicsFrom;
  };
  stages: SuggestionStages;
  /** Best first, at most `limit`. `stages.reliable` is how many were ranked. */
  suggestions: Suggestion[];
}

/**
 * The shared visibility rule, called with the viewer. The cast keeps this
 * compiling whether or not the rule takes one, and the call is made here, not
 * captured at import, so a test can replace the rule.
 */
function visibleGuestsFor(
  viewerAuth0Id: string,
): Promise<Prisma.guestsWhereInput> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const rule = visibleGuestsWhere as (
    viewerAuth0Id?: string,
  ) => Promise<Prisma.guestsWhereInput>;
  return rule(viewerAuth0Id);
}

/** Match states that end the coordinator's interest in that lecturer for good. */
const CLOSED_MATCH_STATUSES = new Set(['UNMATCHED', 'REJECTED']);

/**
 * When a session took place, for the rotation term: the moment the coordinator
 * marked it complete, else the event's own date, else when it was created. The
 * date is typed by the coordinator and stored as a string, so one that does not
 * read as a date is not used, and one that does is held between when the event
 * was created and now: a future date reads as now, a back-dated one as created.
 */
function sessionDate(
  event: { date: string; completed_at: Date | null; created_at: Date },
  now: Date,
): Date {
  if (event.completed_at) {
    return event.completed_at;
  }
  const planned = new Date(event.date);
  if (Number.isNaN(planned.getTime())) {
    return event.created_at;
  }
  return new Date(
    Math.min(
      now.getTime(),
      Math.max(planned.getTime(), event.created_at.getTime()),
    ),
  );
}

/**
 * Ranks the guest lecturers who could give one session, for one coordinator.
 *
 * No ranking is stored: there is no ranking table and no counter to keep in
 * step. Only the administrator's settings are. How many sessions a lecturer has had, and when they last
 * had one, are read from the `events` table each time. That is the same table
 * the Event page shows, so the list cannot disagree with it or drift away
 * from it.
 *
 * Every part of the request is optional. No date means any day, no times means
 * any time, and no topics means the coordinator's own expertise. An
 * unspecified requirement is never a reason to remove someone.
 *
 * The rules, in order (the arithmetic is in ./scoring.ts):
 *
 *   1. Eligible: visible to this coordinator under the platform's own rule
 *      (visibleGuestsWhere, the same one Discovery uses), a finished profile,
 *      consent to be matched, and not dismissed or unmatched by this
 *      coordinator.
 *   2. Available: isAvailable() for the day and times asked for. Other
 *      coordinators' events are deliberately not consulted: probing for a
 *      clash would reveal their bookings.
 *   3. Shares a topic: at least one of the topics in play. If there are none,
 *      the rule is not applied.
 *   4. Reliable: a Bayesian average of the lecturer's ratings. Ratings are not
 *      stored yet, so every lecturer is given an empty list, sits at the
 *      neutral 50 and passes. The gate is in place for when they are stored.
 *
 * Whoever passes is ranked by fit, then time since their last session, then
 * fewer sessions so far. The weights (65/20/15 by default) and the half-life of
 * the time-since term (90 days) are the administrator's, read from Settings on
 * each request; fit is held at 50 or more, so topic fit always counts most.
 * Nobody is removed for being popular: a lecturer with many sessions only ranks
 * lower.
 *
 * The ranking uses exact values. The response does not: it carries bands and
 * the fit only, because the exact numbers would show one coordinator when
 * another had a session with a lecturer. See Suggestion.
 *
 * "Sessions so far" counts a lecturer's events with every coordinator, not
 * only this one, because the aim is to spread sessions across the whole pool.
 * An event is a session once the lecturer has agreed to it: it is accepted, or
 * it is completed and the lecturer had replied. The status order is not
 * enforced, so a completed event with no reply is an invitation nobody
 * answered. An invitation still waiting, a declined one and a cancelled one
 * are not sessions either. It counts whatever has since happened to the match,
 * so a lecturer keeps their history after a match ends, and a match with no
 * event yet counts for nothing. Each event is one session, so a coordinator who
 * has a lecturer back several times adds several.
 */
@Injectable()
export class SuggestionsService {
  async suggest(
    auth0Id: string,
    query: SuggestionsQueryDto,
    now: Date = new Date(),
  ): Promise<SuggestionsResult> {
    const session = this.readSession(query);
    const { coordinatorId, userId: coordinatorUserId } =
      await this.findCoordinator(auth0Id);
    const topics = await this.topicsInPlay(query, coordinatorUserId);
    // The administrator's weights and half-life, or the defaults.
    const matching = await readMatchingSettings();

    // Rule 1: eligible. Visibility is the platform's shared rule; the profile
    // checks are pushed into the query so only candidates are read.
    // Passes the viewer so contact paused by a report also hides the pair here.
    const visible = await visibleGuestsFor(auth0Id);
    const [visibleGuests, guests] = await Promise.all([
      prisma.guests.findMany({ where: visible, select: { guest_id: true } }),
      prisma.guests.findMany({
        where: {
          AND: [
            visible,
            {
              first_name: { not: null },
              NOT: { first_name: '' },
              users: { is: { deletedat: null, consentstate: true } },
            },
          ],
        },
        orderBy: { guest_id: 'asc' },
        select: {
          guest_id: true,
          user_id: true,
          first_name: true,
          last_name: true,
          field: true,
          role: true,
          profile_image_id: true,
          users: { select: { userid: true } },
        },
      }),
    ]);
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
      const own = ownMatchByGuest.get(guest.guest_id);
      const isEligible =
        guest.users !== null &&
        !dismissedIds.has(guest.guest_id) &&
        !CLOSED_MATCH_STATUSES.has(own?.status ?? '');
      return isEligible && guest.users
        ? [{ guest, userId: guest.users.userid }]
        : [];
    });

    const stages: SuggestionStages = {
      considered: visibleGuests.length,
      eligible: eligible.length,
      available: 0,
      sharesTopic: 0,
      reliable: 0,
    };

    // Rules 2 and 3 read two small tables for the eligible lecturers, grouped
    // once by user so each lecturer is a lookup and not a scan.
    const eligibleUserIds = eligible.map((entry) => entry.userId);
    const [availabilityRows, expertiseRows] = await Promise.all([
      prisma.availability.findMany({
        where: { user_id: { in: eligibleUserIds } },
      }),
      prisma.user_expertise.findMany({
        where: { user_id: { in: eligibleUserIds } },
      }),
    ]);
    const availabilityByUser = new Map<bigint, WeeklyAvailability[]>();
    for (const row of availabilityRows) {
      if (row.user_id !== null) {
        const rows = availabilityByUser.get(row.user_id) ?? [];
        rows.push(row);
        availabilityByUser.set(row.user_id, rows);
      }
    }
    const expertiseByUser = new Map<bigint, string[]>();
    for (const row of expertiseRows) {
      const rows = expertiseByUser.get(row.user_id) ?? [];
      rows.push(row.expertise);
      expertiseByUser.set(row.user_id, rows);
    }

    // Rule 2: available. This is the original isAvailable rule: a requirement
    // that was not asked for is not a clash, so with no day everyone passes
    // the day check, a lecturer with no days recorded passes it too, and a
    // lecturer with no hours fails only when times are given.
    const required = { weekday: session.weekday, window: session.window };
    const available = eligible.filter((entry) => {
      const rows = availabilityByUser.get(entry.userId) ?? [];
      // A lecturer with no availability row has recorded nothing, which is
      // what isAvailable() treats an empty record as.
      const candidates: (WeeklyAvailability | null)[] =
        rows.length > 0 ? rows : [null];
      return candidates.some((row) =>
        isAvailable(recordedAvailability(row), required),
      );
    });
    stages.available = available.length;

    // Rule 3: shares a topic. With no topics in play there is nothing to share
    // and nobody is removed; fit is then 0 for everyone.
    const relevant = available.flatMap((entry) => {
      const offered = expertiseByUser.get(entry.userId) ?? [];
      if (topics.list.length === 0) {
        return [{ ...entry, shared: [] as string[], fit: 0 }];
      }
      const shared = sharedTopics(topics.list, offered);
      return shared.length > 0
        ? [{ ...entry, shared, fit: fitScore(topics.list, offered) }]
        : [];
    });
    stages.sharesTopic = relevant.length;

    // The sessions behind rotation and exposure, for the lecturers still in.
    const relevantGuestIds = relevant.map((entry) => entry.guest.guest_id);
    const sessionEvents = await prisma.events.findMany({
      where: {
        OR: [
          { status: 'accepted' },
          { status: 'completed', responded_at: { not: null } },
        ],
        match: { is: { guest_id: { in: relevantGuestIds } } },
      },
      select: {
        date: true,
        completed_at: true,
        created_at: true,
        match: { select: { guest_id: true } },
      },
    });

    const sessionsBy = new Map<bigint, number>();
    const lastSessionBy = new Map<bigint, Date>();
    for (const event of sessionEvents) {
      const guestId = event.match.guest_id;
      sessionsBy.set(guestId, (sessionsBy.get(guestId) ?? 0) + 1);
      const when = sessionDate(event, now);
      const latest = lastSessionBy.get(guestId);
      if (!latest || when > latest) {
        lastSessionBy.set(guestId, when);
      }
    }

    // Rule 4: reliable, then the exact score. Everything in `ranked` is exact.
    const ranked = relevant.flatMap((entry) => {
      const guestId = entry.guest.guest_id;
      if (!isReliable(reliabilityScore(this.ratingsOf(guestId)))) {
        return [];
      }

      const sessionsSoFar = sessionsBy.get(guestId) ?? 0;
      const lastSessionAt = lastSessionBy.get(guestId) ?? null;
      const rotation = rotationScore(lastSessionAt, now, matching.halfLifeDays);
      const exposure = exposureScore(sessionsSoFar);

      return [
        {
          entry,
          sessionsSoFar,
          lastSessionAt,
          total: rankScore(entry.fit, rotation, exposure, matching.weights),
        },
      ];
    });
    stages.reliable = ranked.length;

    // The order is settled here, on the exact values.
    ranked.sort(
      (a, b) =>
        b.total - a.total ||
        b.entry.fit - a.entry.fit ||
        (a.lastSessionAt?.getTime() ?? 0) - (b.lastSessionAt?.getTime() ?? 0) ||
        a.sessionsSoFar - b.sessionsSoFar ||
        (a.entry.guest.guest_id < b.entry.guest.guest_id ? -1 : 1),
    );

    // Only now are the exact values turned into what may leave the server.
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
          score: { fit: roundTo(item.entry.fit, 2) },
          lastSessionBand: lastSessionBand(item.lastSessionAt, now),
          sessionsBand: sessionsBand(item.sessionsSoFar),
        };
      });

    return {
      session: {
        date: session.date,
        startTime: query.startTime ?? null,
        endTime: query.endTime ?? null,
        topics: topics.list,
        topicsFrom: topics.from,
      },
      stages,
      suggestions,
    };
  }

  /**
   * Checks the date and times, which the DTO can only check the shape of.
   * Anything not given stays null, and null means "not asked for".
   */
  private readSession(query: SuggestionsQueryDto): {
    date: string | null;
    weekday: number | null;
    window: TimeWindow | null;
  } {
    let weekday: number | null = null;
    if (query.date !== undefined) {
      weekday = weekdayOf(query.date);
      if (weekday === null) {
        throw this.badRequest('date is not a real calendar date');
      }
    }

    let window: TimeWindow | null = null;
    if (query.startTime !== undefined || query.endTime !== undefined) {
      if (query.startTime === undefined || query.endTime === undefined) {
        throw this.badRequest('give both startTime and endTime, or neither');
      }
      const startMinutes = parseClock(query.startTime);
      const endMinutes = parseClock(query.endTime);
      if (startMinutes === null || endMinutes === null) {
        throw this.badRequest('startTime and endTime must be HH:MM');
      }
      if (endMinutes <= startMinutes) {
        throw this.badRequest('endTime must be later than startTime');
      }
      window = { startMinutes, endMinutes };
    }

    return { date: query.date ?? null, weekday, window };
  }

  /**
   * The topics the search is about. Those the caller named, or, when it named
   * none, the coordinator's own expertise from their profile. If the profile
   * has none either, the list is empty and no topic rule is applied.
   */
  private async topicsInPlay(
    query: SuggestionsQueryDto,
    coordinatorUserId: bigint,
  ): Promise<{ list: string[]; from: TopicsFrom }> {
    if (query.topics && query.topics.length > 0) {
      return { list: query.topics, from: 'request' };
    }
    const own = await prisma.user_expertise.findMany({
      where: { user_id: coordinatorUserId },
    });
    const list = own.map((row) => row.expertise);
    return { list, from: list.length > 0 ? 'profile' : 'none' };
  }

  /**
   * A lecturer's ratings, each 0 to 100.
   *
   * Ratings are not stored yet, so this is always empty and every lecturer
   * stays at the neutral 50 and passes the reliability gate. Cancelled
   * sessions are deliberately not used in their place: a cancellation cannot
   * be attributed to the lecturer or the coordinator. Read real ratings here
   * once there is somewhere to keep them.
   */
  private ratingsOf(_guestId: bigint): readonly number[] {
    return [];
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
  private async findCoordinator(
    auth0Id: string,
  ): Promise<{ coordinatorId: bigint; userId: bigint }> {
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
    if (!user || !coordinator) {
      throw new ForbiddenException({
        code: ErrorCode.AuthzInsufficientRole,
        message: 'Complete your profile before asking for suggested speakers.',
      });
    }
    return { coordinatorId: coordinator.coordinator_id, userId: user.userid };
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
