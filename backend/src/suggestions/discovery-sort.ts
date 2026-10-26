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
 *   active  the most recent sign-in first, people who never signed in last
 *   best    the ranked order, only while ranked matching is on
 *
 * Every sort breaks a tie by the order people joined (their id order), so a
 * list is always in one fixed order. Only the order changes: who is listed is
 * decided before any of this runs, and neither a sign-in time nor a count is
 * ever put in what a card carries.
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
 * @param lastSignIn when each account last signed in, for `active`
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: ManualSort,
  place: (row: T) => Placeable,
  context: {
    topicsByUser?: ReadonlyMap<bigint, readonly string[]>;
    viewerTopics?: readonly string[];
    lastSignIn?: ReadonlyMap<bigint, Date | null>;
  } = {},
): T[] {
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
      signedInAt: signedIn === null ? null : signedIn.getTime(),
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
      placed.sort((a, b) => {
        if (a.signedInAt === null || b.signedInAt === null) {
          if (a.signedInAt === b.signedInAt) {
            return joined(a, b);
          }
          // Someone who never signed in goes last, not first.
          return a.signedInAt === null ? 1 : -1;
        }
        return b.signedInAt - a.signedInAt || joined(a, b);
      });
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
 * Orders a Discovery list by a manual sort, reading only what that sort needs:
 * nothing for joined, newest and name; the viewer's own topics for topics; and
 * one read of the sign-in times of the people listed for active.
 *
 * `expertiseRows` is the topics of the people listed, already read for the
 * cards. The sign-in times are used to place a row and thrown away; they are
 * never copied onto it.
 */
export async function sortDiscovery<T>(
  rows: T[],
  sort: ManualSort,
  place: (row: T) => Placeable,
  expertiseRows: readonly TopicRow[],
  viewerAuth0Id?: string,
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
    const people = await prisma.users.findMany({
      where: { userid: { in: userIds } },
      select: { userid: true, lastloginat: true },
    });
    return sortRows(rows, sort, place, {
      lastSignIn: new Map(people.map((p) => [p.userid, p.lastloginat])),
    });
  }

  return sortRows(rows, sort, place);
}
