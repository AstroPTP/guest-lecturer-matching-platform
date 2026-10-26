import { prisma } from '../prisma';
import { sharedTopics } from './scoring';

/**
 * The orders a person can choose for the Discovery lists.
 *
 * Five are plain attribute sorts that need no score and no weights, and are
 * always available. `best` is the ranked order (see ./discovery-ranking.ts) and
 * is only given while ranked matching is on.
 *
 *   joined  oldest profile first, which is how Discovery has always listed people
 *   newest  newest profile first
 *   name    A to Z by full name, people with no name last
 *   topics  the most topics shared with the viewer's own first
 *   active  grouped by how recently people signed in (see activityBand), the
 *           most recent group first, people who never signed in in the last
 *   best    the ranked order, only while ranked matching is on
 *
 * Every sort breaks a tie by the order people joined (their id order), so a
 * list is always in one fixed order. Only the order changes: who is listed is
 * decided before any of this runs, and neither a sign-in time nor a count is
 * ever put in what a card carries.
 *
 * `active` is deliberately coarse, so that reloading the list cannot show who
 * signed in moments ago. It orders by a band (see activityBand) and, inside a
 * band, by the order people joined; the time itself never decides a position.
 * It also moves only once a day: a sign-in today is not counted until tomorrow
 * (see lastSignInBefore), so nobody's position changes the moment they sign in.
 */
export const DISCOVERY_SORTS = [
  'joined',
  'newest',
  'name',
  'topics',
  'active',
  'best',
] as const;

export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

/** The sorts that need no ranking, so they are always on offer. */
export type ManualSort = Exclude<DiscoverySort, 'best'>;

/** Whether a requested sort is one of the manual ones, which this module applies. */
export function isManualSort(
  sort: DiscoverySort | undefined,
): sort is ManualSort {
  return sort !== undefined && sort !== 'best';
}

/** What a list row must say about itself for it to be placed. */
export interface Placeable {
  /** The profile's own id; ids rise in the order people joined. */
  id: bigint;
  /** The account behind the profile, or null for a profile with none. */
  userId: bigint | null;
  firstName: string | null;
  lastName: string | null;
}

/** One row of `user_expertise`. */
interface TopicRow {
  user_id: bigint;
  expertise: string;
}

const collator = new Intl.Collator('en', { sensitivity: 'base' });

const DAY_MS = 24 * 60 * 60 * 1000;

/** Australia/Perth is UTC+8 all year: it has no daylight saving. */
const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The longest ago a sign-in can be and still be in a band better than the last. */
const LAST_BAND_AFTER_DAYS = 90;

/**
 * The start of today in Australia/Perth, as an instant. Activity is counted up
 * to this moment and no later, so it changes once a day, at Perth midnight.
 */
export function startOfToday(now: Date): Date {
  const perth = now.getTime() + PERTH_OFFSET_MS;
  return new Date(Math.floor(perth / DAY_MS) * DAY_MS - PERTH_OFFSET_MS);
}

/** The whole Perth calendar day an instant falls on, counted from 1970. */
function perthDay(instant: number): number {
  return Math.floor((instant + PERTH_OFFSET_MS) / DAY_MS);
}

/**
 * How recently someone signed in, as one of four bands. The first is best.
 *
 *   1  within the last 7 days
 *   2  within the last 30 days
 *   3  within the last 90 days
 *   4  longer ago, or never
 *
 * The days are whole Perth calendar days counted back from `reference`, the
 * start of today (see startOfToday), so a person moves from one band to the
 * next at midnight and never in the middle of a day. A sign-in at or after
 * `reference` is today's, which is not counted yet, so it gives the last band,
 * as does a missing or unreadable one.
 */
export type ActivityBand = 1 | 2 | 3 | 4;

export function activityBand(
  lastSignIn: Date | null | undefined,
  reference: Date,
): ActivityBand {
  if (!lastSignIn || !(lastSignIn.getTime() < reference.getTime())) {
    return 4;
  }
  const days = perthDay(reference.getTime()) - perthDay(lastSignIn.getTime());
  if (days <= 7) {
    return 1;
  }
  if (days <= 30) {
    return 2;
  }
  if (days <= LAST_BAND_AFTER_DAYS) {
    return 3;
  }
  return 4;
}

function fullName(row: Placeable): string {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
}

function byJoined(a: Placeable, b: Placeable): number {
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Orders rows by one of the manual sorts. A pure function: everything it needs
 * is passed in, so what each sort does can be read and tested on its own.
 *
 * @param topicsByUser the topics each account names, for `topics`
 * @param viewerTopics the topics the person looking has named, for `topics`
 * @param lastSignIn when each account last signed in before today, for
 *   `active`; only its band (see activityBand) is used
 * @param reference the start of today, which the bands are counted from, for
 *   `active`
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: ManualSort,
  place: (row: T) => Placeable,
  context: {
    topicsByUser?: ReadonlyMap<bigint, readonly string[]>;
    viewerTopics?: readonly string[];
    lastSignIn?: ReadonlyMap<bigint, Date | null>;
    reference?: Date;
  } = {},
): T[] {
  const reference = context.reference ?? startOfToday(new Date());
  const placed = rows.map((row) => {
    const at = place(row);
    const offered =
      at.userId === null ? [] : (context.topicsByUser?.get(at.userId) ?? []);
    const signedIn =
      at.userId === null ? null : (context.lastSignIn?.get(at.userId) ?? null);
    return {
      row,
      at,
      // Only the sort asked for reads these, and an absent input counts as none.
      shared: sharedTopics(context.viewerTopics ?? [], offered).length,
      band: activityBand(signedIn, reference),
    };
  });
  type Item = (typeof placed)[number];
  const joined = (a: Item, b: Item) => byJoined(a.at, b.at);

  switch (sort) {
    case 'joined':
      placed.sort(joined);
      break;
    case 'newest':
      placed.sort((a, b) => joined(b, a));
      break;
    case 'name':
      placed.sort((a, b) => {
        const nameA = fullName(a.at);
        const nameB = fullName(b.at);
        if (!nameA !== !nameB) {
          // A profile with no name goes last, not first.
          return nameA ? -1 : 1;
        }
        return collator.compare(nameA, nameB) || joined(a, b);
      });
      break;
    case 'topics':
      placed.sort((a, b) => b.shared - a.shared || joined(a, b));
      break;
    case 'active':
      // By band, then the order people joined: never by the exact time.
      placed.sort((a, b) => a.band - b.band || joined(a, b));
      break;
  }
  return placed.map((item) => item.row);
}

/** The topics each account names, grouped once so each row is a lookup. */
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
 * When each person last signed in, counting only sign-ins before `reference`
 * (the start of today). A sign-in today is left out, so signing in does not
 * move anyone until the next day.
 *
 * The latest `user.signed_in` audit entry before `reference` wins, found with
 * one grouped query for all the people listed and bounded to the days that can
 * still change a band. Someone with no such entry falls back to their stored
 * last sign-in, but only when that is also before `reference`; otherwise they
 * are left out, which counts as the last band until tomorrow.
 */
async function lastSignInBefore(
  userIds: readonly bigint[],
  reference: Date,
): Promise<Map<bigint, Date>> {
  const found = new Map<bigint, Date>();
  if (userIds.length === 0) {
    return found;
  }
  const since = new Date(reference.getTime() - LAST_BAND_AFTER_DAYS * DAY_MS);
  const [audited, people] = await Promise.all([
    prisma.audit_entries.groupBy({
      by: ['actor_user_id'],
      where: {
        action: 'user.signed_in',
        actor_user_id: { in: [...userIds] },
        occurred_at: { gte: since, lt: reference },
      },
      _max: { occurred_at: true },
    }),
    prisma.users.findMany({
      where: { userid: { in: [...userIds] } },
      select: { userid: true, lastloginat: true },
    }),
  ]);
  for (const person of people) {
    if (
      person.lastloginat &&
      person.lastloginat.getTime() < reference.getTime()
    ) {
      found.set(person.userid, person.lastloginat);
    }
  }
  for (const entry of audited) {
    if (entry.actor_user_id !== null && entry._max.occurred_at) {
      found.set(entry.actor_user_id, entry._max.occurred_at);
    }
  }
  return found;
}

/**
 * Orders a Discovery list by a manual sort, reading only what that sort needs:
 * nothing for joined, newest and name; the viewer's own topics for topics; and
 * for active, one grouped read of the people's recorded sign-ins and one of
 * their last sign-in time.
 *
 * `expertiseRows` is the topics of the people listed, already read for the
 * cards. The sign-in times are turned into bands to place a row and thrown
 * away; they are never copied onto it.
 */
export async function sortDiscovery<T>(
  rows: T[],
  sort: ManualSort,
  place: (row: T) => Placeable,
  expertiseRows: readonly TopicRow[],
  viewerAuth0Id?: string,
  now: Date = new Date(),
): Promise<T[]> {
  if (rows.length < 2) {
    return rows;
  }

  if (sort === 'topics') {
    const own = viewerAuth0Id
      ? await prisma.user_expertise.findMany({
          where: { users: { is: { auth0Id: viewerAuth0Id } } },
        })
      : [];
    return sortRows(rows, sort, place, {
      viewerTopics: own.map((row) => row.expertise),
      topicsByUser: groupTopics(expertiseRows),
    });
  }

  if (sort === 'active') {
    const userIds = rows.flatMap((row) => {
      const { userId } = place(row);
      return userId === null ? [] : [userId];
    });
    return sortRows(rows, sort, place, {
      lastSignIn: await lastSignInBefore(userIds, startOfToday(now)),
      reference: startOfToday(now),
    });
  }

  return sortRows(rows, sort, place);
}
