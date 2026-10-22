/**
 * The arithmetic behind Suggested speakers.
 *
 * Everything here is a pure function of its arguments. No database, no clock
 * (callers pass `now`), so every number can be checked in a unit test and the
 * weights can be read in one place.
 *
 * The four rules a lecturer must pass, in order:
 *
 *   1. eligible        decided in the service, from the profile and the
 *                      coordinator's own history with the lecturer
 *   2. available       coversSession(), plus a clash check against events
 *   3. shares a topic  fitScore() > 0
 *   4. reliable        isReliable(), a pass or fail gate that never enters
 *                      the ordering
 *
 * Whoever passes is ranked by `rankScore`: fit counts most, then the time
 * since the lecturer's last session, then how few sessions they have had.
 *
 * THE NUMBERS BELOW ARE STARTING VALUES. They are defensible, not measured:
 * there is no usage data behind the weights, the half-life or the threshold.
 * Change them here and nowhere else.
 */

/** Weight of how well the lecturer's topics match the session's. */
export const WEIGHT_FIT = 0.65;
/** Weight of time since the lecturer's last session. */
export const WEIGHT_ROTATION = 0.2;
/** Weight of having had fewer sessions so far. */
export const WEIGHT_EXPOSURE = 0.15;

/** Days after which the rotation term has covered half the distance to 1. */
export const ROTATION_HALF_LIFE_DAYS = 90;

/** A lecturer with no history starts here, on a 0 to 100 scale. */
export const RELIABILITY_NEUTRAL = 50;
/** How many observations the neutral starting point is worth. */
export const RELIABILITY_TRUST = 5;
/** Below this the lecturer is left out of the list altogether. */
export const RELIABILITY_THRESHOLD = 45;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Lower-cases and collapses whitespace so "Taxation  Law" equals "taxation law". */
export function normaliseTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toTopicSet(topics: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const topic of topics) {
    const normalised = normaliseTopic(topic);
    if (normalised) {
      set.add(normalised);
    }
  }
  return set;
}

/** The topics both lists name, spelled as the second (the lecturer's) list has them. */
export function sharedTopics(
  requested: readonly string[],
  offered: readonly string[],
): string[] {
  const wanted = toTopicSet(requested);
  const seen = new Set<string>();
  const shared: string[] = [];
  for (const topic of offered) {
    const key = normaliseTopic(topic);
    if (wanted.has(key) && !seen.has(key)) {
      seen.add(key);
      shared.push(topic.trim());
    }
  }
  return shared;
}

/**
 * Cosine similarity of two topic lists treated as yes or no vectors:
 * shared / sqrt(requested * offered). 1 when they name exactly the same
 * topics, 0 when they share none.
 *
 * Cosine rather than a plain overlap share (shared over everything either
 * names) because that punishes breadth: a lecturer who covers all three
 * requested topics and five others would score lower than one who covers
 * exactly the three, which is the wrong way round for a coordinator.
 */
export function fitScore(
  requested: readonly string[],
  offered: readonly string[],
): number {
  const wanted = toTopicSet(requested);
  const have = toTopicSet(offered);
  if (wanted.size === 0 || have.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const topic of wanted) {
    if (have.has(topic)) {
      shared += 1;
    }
  }
  return shared / Math.sqrt(wanted.size * have.size);
}

/**
 * How long it has been since the lecturer's last session, from 0 to 1.
 *
 * Grows with the gap: 0 for a session today, 0.5 after one half-life, and
 * towards 1 after that. A lecturer who has never had a session scores 1.
 *
 * It must grow with time. A version of this term that returned 1 for "engaged
 * today" rewarded repeat use and put the busiest lecturer first, which is the
 * opposite of what the list is for.
 */
export function rotationScore(lastSessionAt: Date | null, now: Date): number {
  if (!lastSessionAt) {
    return 1;
  }
  const days = Math.max(
    0,
    (now.getTime() - lastSessionAt.getTime()) / MS_PER_DAY,
  );
  return 1 - Math.pow(0.5, days / ROTATION_HALF_LIFE_DAYS);
}

/**
 * Having had fewer sessions so far, from 0 to 1: 1 with none, a half with one,
 * a third with two. It falls smoothly and never reaches 0, so a very busy
 * lecturer ranks lower but is never removed for it.
 */
export function exposureScore(sessionsSoFar: number): number {
  return 1 / (1 + Math.max(0, sessionsSoFar));
}

/** The ordering score, 0 to 1. Reliability is deliberately not part of it. */
export function rankScore(
  fit: number,
  rotation: number,
  exposure: number,
): number {
  return (
    WEIGHT_FIT * fit + WEIGHT_ROTATION * rotation + WEIGHT_EXPOSURE * exposure
  );
}

/**
 * Bayesian average of a lecturer's record, 0 to 100.
 *
 * Starts at the neutral 50 worth `RELIABILITY_TRUST` observations, then each
 * completed session pulls towards 100 and each broken commitment towards 0.
 * A newcomer sits at 50 and passes. A long record moves the number; a lone
 * data point cannot swing it far, which is the point of averaging this way.
 *
 * @param completed Sessions the lecturer delivered.
 * @param broken Sessions the lecturer accepted that were later cancelled.
 */
export function reliabilityScore(completed: number, broken: number): number {
  const done = Math.max(0, completed);
  const lost = Math.max(0, broken);
  return (
    (RELIABILITY_TRUST * RELIABILITY_NEUTRAL + 100 * done) /
    (RELIABILITY_TRUST + done + lost)
  );
}

export function isReliable(score: number): boolean {
  return score >= RELIABILITY_THRESHOLD;
}

/** The weekday columns the availability table stores, Monday to Friday. */
export interface WeeklyAvailability {
  monday: boolean | null;
  tuesday: boolean | null;
  wednesday: boolean | null;
  thursday: boolean | null;
  friday: boolean | null;
  available_from: Date | null;
  available_to: Date | null;
}

const WEEKDAY_COLUMNS = [
  null, // Sunday
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  null, // Saturday
] as const;

/** Minutes after midnight for "HH:MM", or null if it is not a valid time. */
export function parseClock(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes after midnight of a TIME column, which Prisma returns as a 1970 UTC date. */
export function minutesOfTimeColumn(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

/**
 * Day of the week for a YYYY-MM-DD date, 0 for Sunday to 6 for Saturday, or
 * null if it is not a real calendar date. Worked out in UTC from the parts, so
 * the server's time zone cannot move the date by a day.
 */
export function weekdayOf(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  return isReal ? parsed.getUTCDay() : null;
}

/**
 * Whether a lecturer's weekly window holds the whole session.
 *
 * The weekday must be ticked and the window must run from at or before the
 * start to at or after the end. A window that finishes exactly as the session
 * begins does not hold it: they are gone before it starts.
 *
 * A lecturer who ticked days but gave no hours is not treated as free. The
 * list would otherwise offer people whose availability nobody has stated.
 */
export function coversSession(
  availability: WeeklyAvailability,
  weekday: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  const column = WEEKDAY_COLUMNS[weekday];
  if (!column || !availability[column]) {
    return false;
  }
  if (!availability.available_from || !availability.available_to) {
    return false;
  }
  return (
    minutesOfTimeColumn(availability.available_from) <= startMinutes &&
    endMinutes <= minutesOfTimeColumn(availability.available_to)
  );
}

/** Whether two time ranges overlap. Touching at an end point is not overlap. */
export function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}
