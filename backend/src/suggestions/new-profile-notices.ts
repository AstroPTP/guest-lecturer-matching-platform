import { Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { readSettings, visibleGuestsWhere } from '../admin/platform-rules';
import {
  NotificationsService,
  type AdminNotice,
} from '../notifications/notifications.service';
import { prisma } from '../prisma';
import { visibleCoordinatorsWhere } from '../unit-coordinators/coordinator-visibility';
import { readMatchingSettings } from './matching-settings';

/**
 * Tells people when someone who shares their topics first appears.
 *
 * While Suggested speakers is on, a guest lecturer who first becomes visible
 * is announced to every unit coordinator who shares at least one of their
 * topics, and a unit coordinator who first becomes visible is announced to
 * every guest lecturer who shares one of theirs. The notice names no one: it
 * points to the page where the new people can be found.
 *
 * Plain functions rather than an injectable, like the platform rules, so the
 * services that call them need one import and no module dependency. They
 * never throw: a notice that cannot be raised must not undo the save or the
 * approval that caused it.
 */

const logger = new Logger('NewProfileNotices');

/** NotificationsService keeps no state, so one instance serves every call. */
const notifications = new NotificationsService();

/**
 * The most people one new profile will notify. A bound on the single insert,
 * not a target: it is far above the number of coordinators or guest lecturers
 * the platform has.
 */
export const MAX_NOTICE_RECIPIENTS = 1000;

/** Sent to coordinators when a guest lecturer who shares a topic appears. */
export const NEW_GUEST_NOTICE: AdminNotice = {
  type: 'match',
  title: 'New suggested speakers match your topics',
  description:
    'Guest lecturers who share your topics have joined. See who suits your units.',
  actionLabel: 'View suggestions',
  href: '/unit_coordinator/suggestions',
};

/** Sent to guest lecturers when a unit coordinator who shares a topic appears. */
export const NEW_COORDINATOR_NOTICE: AdminNotice = {
  type: 'match',
  title: 'New units match your expertise',
  description:
    'Unit coordinators who need your topics have joined. See who is looking for a guest lecturer.',
  actionLabel: 'Open Discovery',
  href: '/guest_lecturer/discovery',
};

/**
 * What made the guest lecturer visible: finishing the profile, or an
 * administrator approving it. An approval only changes who can see the guest
 * while approval is required, so with approval off it announces no one.
 */
export type GuestVisibleBecause = 'completed' | 'approved';

/**
 * Escapes the characters that mean something to a LIKE pattern. A case
 * insensitive match is sent to the database as a pattern, and a topic of "%"
 * would otherwise match everybody.
 */
function exactPattern(topic: string): string {
  return topic.replace(/[\\%_]/g, '\\$&');
}

/** A filter for people who name at least one of the topics, whatever the case. */
function sharingAnyOf(topics: string[]): {
  users: { is: Prisma.usersWhereInput };
} {
  return {
    users: {
      is: {
        user_expertise: {
          some: {
            OR: topics.map((topic) => ({
              expertise: {
                equals: exactPattern(topic),
                mode: 'insensitive' as const,
              },
            })),
          },
        },
      },
    },
  };
}

/** The distinct, non-empty topics a person names. */
async function topicsOf(userId: bigint): Promise<string[]> {
  const rows = await prisma.user_expertise.findMany({
    where: { user_id: userId },
    select: { expertise: true },
  });
  return [...new Set(rows.map((row) => row.expertise.trim()))].filter(Boolean);
}

/**
 * Tells every unit coordinator who shares a topic that a guest lecturer has
 * just become visible. Returns how many notices were written.
 *
 * Goes ahead only when Suggested speakers is on and the guest lecturer is
 * someone Discovery lists and Suggested speakers could suggest: a finished
 * profile on an active account, approved while approval is required, and not
 * on hold. Coordinators who are deactivated, on hold, or who have an open
 * report with the guest lecturer are never told.
 */
export async function noticeCoordinatorsOfNewGuest(
  guestAuth0Id: string,
  because: GuestVisibleBecause,
): Promise<number> {
  try {
    if (!(await readMatchingSettings()).enabled) {
      return 0;
    }
    if (
      because === 'approved' &&
      !(await readSettings()).require_admin_approval
    ) {
      return 0;
    }

    const guest = await prisma.guests.findFirst({
      where: {
        AND: [
          await visibleGuestsWhere(),
          {
            first_name: { not: null },
            NOT: { first_name: '' },
            users: {
              is: {
                auth0Id: guestAuth0Id,
                deletedat: null,
                consentstate: true,
              },
            },
          },
        ],
      },
      select: { user_id: true },
    });
    if (!guest || guest.user_id === null) {
      return 0;
    }
    const topics = await topicsOf(guest.user_id);
    if (topics.length === 0) {
      return 0;
    }

    // One read for everyone who should be told.
    const coordinators = await prisma.coordinators.findMany({
      where: {
        AND: [
          await visibleCoordinatorsWhere(guestAuth0Id),
          { user_id: { not: null } },
          sharingAnyOf(topics),
        ],
      },
      select: { user_id: true },
      orderBy: { user_id: 'asc' },
      take: MAX_NOTICE_RECIPIENTS,
    });
    return await notifications.createUnlessRecentForUsers(
      coordinators.flatMap((row) =>
        row.user_id === null ? [] : [row.user_id],
      ),
      NEW_GUEST_NOTICE,
    );
  } catch (error) {
    // Only the error's name: a database error's message can quote ids.
    logger.warn(
      'Could not notify coordinators of a new guest lecturer: ' +
        (error instanceof Error ? error.name : 'UnknownError'),
    );
    return 0;
  }
}

/**
 * Tells every guest lecturer who shares a topic that a unit coordinator has
 * just become visible. Returns how many notices were written.
 *
 * Goes ahead only when Suggested speakers is on and the coordinator is someone
 * Discovery lists: a finished profile on an active account, not on hold. Guest
 * lecturers who are deactivated, on hold, not yet approved while approval is
 * required, or who have an open report with the coordinator are never told.
 */
export async function noticeGuestsOfNewCoordinator(
  coordinatorAuth0Id: string,
): Promise<number> {
  try {
    if (!(await readMatchingSettings()).enabled) {
      return 0;
    }

    const coordinator = await prisma.coordinators.findFirst({
      where: {
        AND: [
          await visibleCoordinatorsWhere(),
          {
            users: {
              is: {
                auth0Id: coordinatorAuth0Id,
                deletedat: null,
                consentstate: true,
              },
            },
          },
        ],
      },
      select: { user_id: true },
    });
    if (!coordinator || coordinator.user_id === null) {
      return 0;
    }
    const topics = await topicsOf(coordinator.user_id);
    if (topics.length === 0) {
      return 0;
    }

    // One read for everyone who should be told.
    const guests = await prisma.guests.findMany({
      where: {
        AND: [
          await visibleGuestsWhere(coordinatorAuth0Id),
          { user_id: { not: null } },
          sharingAnyOf(topics),
        ],
      },
      select: { user_id: true },
      orderBy: { user_id: 'asc' },
      take: MAX_NOTICE_RECIPIENTS,
    });
    return await notifications.createUnlessRecentForUsers(
      guests.flatMap((row) => (row.user_id === null ? [] : [row.user_id])),
      NEW_COORDINATOR_NOTICE,
    );
  } catch (error) {
    logger.warn(
      'Could not notify guest lecturers of a new coordinator: ' +
        (error instanceof Error ? error.name : 'UnknownError'),
    );
    return 0;
  }
}
