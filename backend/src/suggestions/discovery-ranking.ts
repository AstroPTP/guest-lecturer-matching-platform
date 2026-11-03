import { prisma } from '../prisma';
import { readActiveMatchingSettings } from './matching-settings';
import {
  exposureScore,
  fitScore,
  rankScore,
  recordedAvailability,
  roundTo,
  rotationScore,
  type RecordedAvailability,
  type ScoreWeights,
  type WeeklyAvailability,
} from './scoring';
import {
  SESSION_EVENTS_WHERE,
  sessionDate,
  type SessionEventDates,
} from './session-history';

/**
 * The order Discovery lists people in while Suggested speakers is switched on.
 *
 * Only the order changes. The people listed, the filters, dismissals, report
 * pauses and visibility are decided before anything here runs, and nothing
 * here removes anyone or adds a field to what a card carries. A score is
 * worked out to place a card and is then thrown away: showing it would let
 * one coordinator read another's activity back out of the numbers.
 *
 * A coordinator browsing guests sees them in the order Suggested speakers
 * would give with no date or time asked for, except that nobody is dropped for
 * sharing no topic (the arithmetic is in ./scoring.ts). A guest browsing
 * coordinators sees them by how well the topics match, then by how much their
 * available days and hours overlap. How busy a coordinator has been plays no
 * part in that.
 *
 * Switched off, or for a viewer who has no profile on the other side, the rows
 * come back exactly as they were given.
 */

/** Scores are compared to this many decimal places, so rounding noise is not read as a difference. */
const SCORE_PLACES = 9;

/** One row of `user_expertise`. */
interface TopicRow {
  user_id: bigint;
  expertise: string;
}

/** One event, as far as the history of sessions needs: its dates and the guest it is with. */
interface SessionEventRow extends SessionEventDates {
  match: { guest_id: bigint };
}

/** A guest card's row, as far as placing it needs. */
export interface RankableGuest {
  guest_id: bigint;
  user_id: bigint | null;
  created_at: Date;
}

/** A coordinator card's row, as far as placing it needs. */
export interface RankableCoordinator {
  coordinator_id: bigint;
  user_id: bigint | null;
  created_at: Date;
}

/** How many sessions each guest has had, and when the latest was. */
export interface SessionHistory {
  sessions: ReadonlyMap<bigint, number>;
  lastSessionAt: ReadonlyMap<bigint, Date>;
}

/** The topics each person names, grouped once so each card is a lookup. */
function groupTopics(rows: readonly TopicRow[]): Map<bigint, string[]> {
  const byUser = new Map<bigint, string[]>();
  for (const row of rows) {
    const topics = byUser.get(row.user_id) ?? [];
    topics.push(row.expertise);
    byUser.set(row.user_id, topics);
  }
  return byUser;
}

/**
 * Counts each guest's sessions and finds the latest, the same way Suggested
 * speakers does: the rows are the events that count as sessions (see
 * ./session-history.ts), each event is one session whatever has since
 * happened to its match, and the date of a session is read by `sessionDate`.
 */
export function summariseSessions(
  rows: readonly SessionEventRow[],
  now: Date,
): SessionHistory {
  const sessions = new Map<bigint, number>();
  const lastSessionAt = new Map<bigint, Date>();
  for (const row of rows) {
    const guestId = row.match.guest_id;
    sessions.set(guestId, (sessions.get(guestId) ?? 0) + 1);
    const when = sessionDate(row, now);
    const latest = lastSessionAt.get(guestId);
    if (!latest || when > latest) {
      lastSessionAt.set(guestId, when);
    }
  }
  return { sessions, lastSessionAt };
}

/** Earlier joiners first, then the lower id, so the order is always the same. */
function byJoinDate(
  a: { created_at: Date; id: bigint },
  b: { created_at: Date; id: bigint },
): number {
  const joined = a.created_at.getTime() - b.created_at.getTime();
  if (joined !== 0) {
    return joined;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Guests best first, for a coordinator who needs the given topics.
 *
 * The score is the one Suggested speakers ranks by: the weighted sum of topic
 * fit, time since the last session and having had fewer sessions. A guest who
 * shares no topic is kept, with a fit of 0. Equal scores keep the order
 * guests joined in.
 */
export function rankGuests<G extends RankableGuest>(
  guests: readonly G[],
  context: {
    viewerTopics: readonly string[];
    topicsByUser: ReadonlyMap<bigint, readonly string[]>;
    history: SessionHistory;
    weights: ScoreWeights;
    halfLifeDays: number;
    now: Date;
  },
): G[] {
  const scored = guests.map((guest) => {
    const offered =
      guest.user_id === null
        ? []
        : (context.topicsByUser.get(guest.user_id) ?? []);
    const fit = fitScore(context.viewerTopics, offered);
    const rotation = rotationScore(
      context.history.lastSessionAt.get(guest.guest_id) ?? null,
      context.now,
      context.halfLifeDays,
    );
    const exposure = exposureScore(
      context.history.sessions.get(guest.guest_id) ?? 0,
    );
    return {
      guest,
      score: roundTo(
        rankScore(fit, rotation, exposure, context.weights),
        SCORE_PLACES,
      ),
    };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      byJoinDate(
        { created_at: a.guest.created_at, id: a.guest.guest_id },
        { created_at: b.guest.created_at, id: b.guest.guest_id },
      ),
  );
  return scored.map((entry) => entry.guest);
}

/**
 * How much two people's available time overlaps: the weekdays both have
 * ticked and, on those days, the minutes their hours have in common. Hours
 * only count when at least one weekday is shared and both people recorded
 * hours.
 */
export function availabilityOverlap(
  a: RecordedAvailability,
  b: RecordedAvailability,
): { days: number; minutes: number } {
  let days = 0;
  for (const day of a.days) {
    if (b.days.has(day)) {
      days += 1;
    }
  }
  if (days === 0 || !a.window || !b.window) {
    return { days, minutes: 0 };
  }
  const start = Math.max(a.window.startMinutes, b.window.startMinutes);
  const end = Math.min(a.window.endMinutes, b.window.endMinutes);
  return { days, minutes: Math.max(0, end - start) };
}

/**
 * Coordinators best first, for a guest with the given topics and time.
 *
 * Ordered by topic fit, then by how much available time overlaps (shared days,
 * then shared minutes), then by the order coordinators joined in. Nothing
 * about how often a coordinator has been matched is used.
 */
export function rankCoordinators<C extends RankableCoordinator>(
  coordinators: readonly C[],
  context: {
    viewerTopics: readonly string[];
    viewerAvailability: RecordedAvailability;
    topicsByUser: ReadonlyMap<bigint, readonly string[]>;
    availabilityByUser: ReadonlyMap<bigint, WeeklyAvailability>;
  },
): C[] {
  const scored = coordinators.map((coordinator) => {
    const userId = coordinator.user_id;
    const needed =
      userId === null ? [] : (context.topicsByUser.get(userId) ?? []);
    const theirs = recordedAvailability(
      userId === null ? null : (context.availabilityByUser.get(userId) ?? null),
    );
    return {
      coordinator,
      fit: roundTo(fitScore(needed, context.viewerTopics), SCORE_PLACES),
      overlap: availabilityOverlap(context.viewerAvailability, theirs),
    };
  });
  scored.sort(
    (a, b) =>
      b.fit - a.fit ||
      b.overlap.days - a.overlap.days ||
      b.overlap.minutes - a.overlap.minutes ||
      byJoinDate(
        {
          created_at: a.coordinator.created_at,
          id: a.coordinator.coordinator_id,
        },
        {
          created_at: b.coordinator.created_at,
          id: b.coordinator.coordinator_id,
        },
      ),
  );
  return scored.map((entry) => entry.coordinator);
}

/**
 * Puts the guests a coordinator is browsing in ranked order, when Suggested
 * speakers is on and the viewer is a coordinator. Otherwise returns them as
 * they came.
 *
 * `expertiseRows` is the topics of these guests, already read for the cards.
 * What is added is a fixed number of reads however many guests there are: the
 * settings, the viewer's profile and topics, and one read of the sessions of
 * all the guests.
 */
export async function orderGuestsForViewer<G extends RankableGuest>(
  guests: G[],
  expertiseRows: readonly TopicRow[],
  viewerAuth0Id?: string,
  now: Date = new Date(),
): Promise<G[]> {
  if (!viewerAuth0Id || guests.length < 2) {
    return guests;
  }
  const settings = await readActiveMatchingSettings();
  if (!settings) {
    return guests;
  }
  const viewer = await prisma.coordinators.findFirst({
    where: { users: { is: { auth0Id: viewerAuth0Id } } },
    select: { user_id: true },
  });
  if (!viewer || viewer.user_id === null) {
    return guests;
  }

  const [ownTopics, sessionEvents] = await Promise.all([
    prisma.user_expertise.findMany({ where: { user_id: viewer.user_id } }),
    prisma.events.findMany({
      where: {
        ...SESSION_EVENTS_WHERE,
        match: {
          is: { guest_id: { in: guests.map((guest) => guest.guest_id) } },
        },
      },
      select: {
        date: true,
        completed_at: true,
        created_at: true,
        match: { select: { guest_id: true } },
      },
    }),
  ]);

  return rankGuests(guests, {
    viewerTopics: ownTopics.map((row) => row.expertise),
    topicsByUser: groupTopics(expertiseRows),
    history: summariseSessions(sessionEvents, now),
    weights: settings.weights,
    halfLifeDays: settings.halfLifeDays,
    now,
  });
}

/**
 * Puts the coordinators a guest is browsing in ranked order, when Suggested
 * speakers is on and the viewer is a guest. Otherwise returns them as they
 * came.
 *
 * `expertiseRows` and `availabilityRows` belong to these coordinators and
 * were already read for the cards, so only the settings and the viewer's own
 * profile, topics and hours are read here.
 */
export async function orderCoordinatorsForViewer<C extends RankableCoordinator>(
  coordinators: C[],
  expertiseRows: readonly TopicRow[],
  availabilityRows: readonly (WeeklyAvailability & {
    user_id: bigint | null;
  })[],
  viewerAuth0Id?: string,
): Promise<C[]> {
  if (!viewerAuth0Id || coordinators.length < 2) {
    return coordinators;
  }
  const settings = await readActiveMatchingSettings();
  if (!settings) {
    return coordinators;
  }
  const viewer = await prisma.guests.findFirst({
    where: { users: { is: { auth0Id: viewerAuth0Id } } },
    select: { user_id: true },
  });
  if (!viewer || viewer.user_id === null) {
    return coordinators;
  }

  const [ownTopics, ownAvailability] = await Promise.all([
    prisma.user_expertise.findMany({ where: { user_id: viewer.user_id } }),
    prisma.availability.findFirst({ where: { user_id: viewer.user_id } }),
  ]);

  // The first row for a person is the one their card shows.
  const availabilityByUser = new Map<bigint, WeeklyAvailability>();
  for (const row of availabilityRows) {
    if (row.user_id !== null && !availabilityByUser.has(row.user_id)) {
      availabilityByUser.set(row.user_id, row);
    }
  }

  return rankCoordinators(coordinators, {
    viewerTopics: ownTopics.map((row) => row.expertise),
    viewerAvailability: recordedAvailability(ownAvailability ?? null),
    topicsByUser: groupTopics(expertiseRows),
    availabilityByUser,
  });
}
