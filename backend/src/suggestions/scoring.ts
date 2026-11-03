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
 *   2. available       isAvailable(), from the day and hours asked for
 *   3. shares a topic  fitScore() > 0
 *   4. reliable        isReliable(), a pass or fail gate that never enters
 *                      the ordering
 *
 * Whoever passes is ranked by `rankScore`: fit counts most, then the time
 * since the lecturer's last session, then how few sessions they have had.
 *
 * THE NUMBERS BELOW ARE DEFAULTS, and they are starting values: defensible, not
 * measured, with no usage data behind the weights, the half-life or the
 * threshold. Administrators can change the weights and the half-life in
 * Settings, and the service then passes the configured values in their place.
 * The reliability threshold is only set here.
 */

/** Weight of how well the lecturer's topics match the session's. */
export const WEIGHT_FIT = 0.65;
/** Weight of time since the lecturer's last session. */
export const WEIGHT_ROTATION = 0.2;
/** Weight of having had fewer sessions so far. */
export const WEIGHT_EXPOSURE = 0.15;

/** Days after which the rotation term has covered half the distance to 1. */
export const ROTATION_HALF_LIFE_DAYS = 90;

/**
 * The three weights as fractions that add up to 1. The constants above are the
 * defaults; an administrator can change them in Settings, and the service then
 * passes the configured ones instead.
 */
export interface ScoreWeights {
  fit: number;
  rotation: number;
  exposure: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  fit: WEIGHT_FIT,
  rotation: WEIGHT_ROTATION,
  exposure: WEIGHT_EXPOSURE,
};

/** Turns the whole percentages stored in Settings into weights that add up to 1. */
export function weightsFromPercent(
  fit: number,
  rotation: number,
  exposure: number,
): ScoreWeights {
  return { fit: fit / 100, rotation: rotation / 100, exposure: exposure / 100 };
}

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
 * Grows with the gap: 0 for a session today, 0.5 after one half-life (90 days
 * unless an administrator changes it), and towards 1 after that. A lecturer who
 * has never had a session scores 1.
 *
 * It must grow with time. A version of this term that returned 1 for "engaged
 * today" rewarded repeat use and put the busiest lecturer first, which is the
 * opposite of what the list is for.
 */
export function rotationScore(
  lastSessionAt: Date | null,
  now: Date,
  halfLifeDays: number = ROTATION_HALF_LIFE_DAYS,
): number {
  if (!lastSessionAt) {
    return 1;
  }
  const days = Math.max(
    0,
    (now.getTime() - lastSessionAt.getTime()) / MS_PER_DAY,
  );
  return 1 - Math.pow(0.5, days / halfLifeDays);
}

/**
 * Having had fewer sessions so far, from 0 to 1: 1 / (1 + ln(1 + n)). That is 1
 * with none, 0.5906 with one and 0.4191 with three. A logarithm rather than a
 * plain 1 / (1 + n) so that the first few sessions cost a lecturer something
 * but the hundredth costs almost nothing more. It falls smoothly and never
 * reaches 0, so a very busy lecturer ranks lower but is never removed for it.
 */
export function exposureScore(sessionsSoFar: number): number {
  return 1 / (1 + Math.log1p(Math.max(0, sessionsSoFar)));
}

/** How long ago a lecturer last had a session, in coarse steps. */
export type LastSessionBand =
  | 'never'
  | 'within 30 days'
  | '1 to 3 months'
  | 'over 3 months';

/** How many sessions a lecturer has had, in coarse steps. */
export type SessionsBand = 'none' | '1 to 2' | '3 to 5' | '6 or more';

/**
 * The lecturer's last session as a band, for the response.
 *
 * The exact date is never returned. A coordinator who could read it, or the
 * exact rotation term it produces, could work out when another coordinator
 * had a session with that lecturer. The server ranks on the exact value and
 * only the band leaves it.
 */
export function lastSessionBand(
  lastSessionAt: Date | null,
  now: Date,
): LastSessionBand {
  if (!lastSessionAt) {
    return 'never';
  }
  const days = (now.getTime() - lastSessionAt.getTime()) / MS_PER_DAY;
  if (days <= 30) {
    return 'within 30 days';
  }
  return days <= 90 ? '1 to 3 months' : 'over 3 months';
}

/** The number of sessions as a band, for the response. See lastSessionBand. */
export function sessionsBand(sessionsSoFar: number): SessionsBand {
  if (sessionsSoFar <= 0) {
    return 'none';
  }
  if (sessionsSoFar <= 2) {
    return '1 to 2';
  }
  return sessionsSoFar <= 5 ? '3 to 5' : '6 or more';
}

/** Rounds to a number of decimal places. */
export function roundTo(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

/**
 * The ordering score, 0 to 1. Reliability is deliberately not part of it.
 * Uses the default weights unless the configured ones are passed.
 */
export function rankScore(
  fit: number,
  rotation: number,
  exposure: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  return (
    weights.fit * fit +
    weights.rotation * rotation +
    weights.exposure * exposure
  );
}

/**
 * A lecturer's reliability as a Bayesian average of their ratings, 0 to 100:
 * (neutral * trust + sum of ratings) / (trust + number of ratings).
 *
 * A lecturer with no ratings sits exactly at the neutral 50 and passes the
 * gate. Good ratings pull them up and poor ones down, and the trust constant
 * decides how much evidence it takes to move them. A lone rating cannot swing
 * the number far, which is the point of averaging this way.
 *
 * Ratings are not stored yet, so the service passes an empty list and
 * everybody stays at 50. This function and the gate are in place for the day
 * they are. Do not feed it anything else: a cancelled session cannot be
 * attributed to the lecturer or the coordinator, so it is not a rating.
 *
 * @param ratings Each rating on a 0 to 100 scale.
 */
export function reliabilityScore(ratings: readonly number[]): number {
  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return (
    (RELIABILITY_TRUST * RELIABILITY_NEUTRAL + total) /
    (RELIABILITY_TRUST + ratings.length)
  );
}

export function isReliable(score: number): boolean {
  return score >= RELIABILITY_THRESHOLD;
}

/** The weekday columns the availability table stores, Monday (1) to Friday (5). */
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
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const;

/** A time range as minutes after midnight. */
export interface TimeWindow {
  startMinutes: number;
  endMinutes: number;
}

/** What a lecturer has recorded: the weekdays (1 to 5) and the hours. */
export interface RecordedAvailability {
  days: ReadonlySet<number>;
  window: TimeWindow | null;
}

/** What a session asks for. Anything left null is not asked for. */
export interface RequiredAvailability {
  /** 0 for Sunday to 6 for Saturday. */
  weekday: number | null;
  window: TimeWindow | null;
}

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

/** Reads one availability row into the days and hours it records. */
export function recordedAvailability(
  row: WeeklyAvailability | null,
): RecordedAvailability {
  const days = new Set<number>();
  if (row) {
    WEEKDAY_COLUMNS.forEach((column, index) => {
      if (row[column]) {
        days.add(index + 1);
      }
    });
  }
  const window =
    row?.available_from && row.available_to
      ? {
          startMinutes: minutesOfTimeColumn(row.available_from),
          endMinutes: minutesOfTimeColumn(row.available_to),
        }
      : null;
  return { days, window };
}

/**
 * Whether a lecturer can take a session, as a hard yes or no.
 *
 * An unspecified requirement is not a clash. With no day asked for, everyone
 * passes the day check. With no start and end time asked for, a lecturer with
 * no hours recorded is NOT removed. Only when a time window is asked for does
 * "no hours recorded" remove someone, because we cannot show the session is
 * covered. A coordinator browsing with no session in mind should see everybody.
 *
 * When a day is asked for, a lecturer who has recorded days must have it
 * ticked. The table has no weekend columns, so a Saturday or Sunday removes
 * every lecturer who has recorded any day. A lecturer who has recorded no days
 * at all is not removed by the day check, for the same reason as above.
 *
 * When a window is asked for it must sit entirely inside the lecturer's hours.
 * A window that finishes exactly as the session begins does not hold it.
 */
export function isAvailable(
  lecturer: RecordedAvailability,
  required: RequiredAvailability,
): boolean {
  if (required.weekday !== null) {
    if (lecturer.days.size > 0 && !lecturer.days.has(required.weekday)) {
      return false;
    }
  }

  if (required.window) {
    if (!lecturer.window) {
      return false;
    }
    if (
      required.window.startMinutes < lecturer.window.startMinutes ||
      required.window.endMinutes > lecturer.window.endMinutes
    ) {
      return false;
    }
  }

  return true;
}
