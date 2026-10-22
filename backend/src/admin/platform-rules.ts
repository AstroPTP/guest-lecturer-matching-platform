import { ConflictException } from '@nestjs/common';
import { prisma } from '../prisma';
import { notHiddenWhere } from './open-reports';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Rules an administrator can change, and the helpers other modules use to
 * apply them. Plain functions rather than an injectable so the services that
 * apply a rule need one import, not a module dependency.
 */

/** The settings row. Written as an upsert so the first read cannot race another. */
export function readSettings() {
  return prisma.admin_settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

/**
 * Which guest lecturers a viewer may see: never a deactivated account, only
 * approved profiles while approval is required, and never someone on hold after
 * reports or someone the viewer has an open report with (whoever made it).
 *
 * Shared by the discovery list and by the profile photo route, so a photo is
 * served to exactly the people the profile is listed to.
 */
export async function visibleGuestsWhere(
  viewerAuth0Id?: string,
): Promise<Prisma.guestsWhereInput> {
  const { require_admin_approval: approvalRequired } = await readSettings();
  return {
    OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
    AND: [await notHiddenWhere(viewerAuth0Id)],
    ...(approvalRequired ? { approved_at: { not: null } } : {}),
  };
}

/**
 * Refuses a coordinator's request to a guest lecturer who was already
 * contacted within the configured number of days, by anyone. A limit of 0
 * turns the rule off.
 */
export async function assertGuestCanBeContacted(guestId: bigint) {
  const { contact_limit_days: days } = await readSettings();
  if (days <= 0) return;

  const since = new Date(Date.now() - days * 86_400_000);
  const recent = await prisma.match_requests.findFirst({
    where: {
      guest_id: guestId,
      requested_at: { gte: since },
      OR: [{ requested_by: null }, { requested_by: 'coordinator' }],
    },
    orderBy: { requested_at: 'desc' },
    select: { requested_at: true },
  });
  if (!recent?.requested_at) return;

  const next = new Date(recent.requested_at.getTime() + days * 86_400_000);
  throw new ConflictException({
    code: 'CONTACT_LIMIT_REACHED',
    message: `This guest lecturer can be contacted once every ${days} days. They can be contacted again from ${next.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
  });
}

/**
 * Appends to the audit trail. Never updates or deletes, so an entry cannot be
 * quietly rewritten by whoever it is about.
 */
export async function recordAudit(
  actorAuth0Id: string | null,
  action: string,
  target: { type?: string; id?: string },
  detail?: Prisma.InputJsonValue,
  /** A transaction's client, to write the entry as part of that transaction. */
  db: Prisma.TransactionClient = prisma,
) {
  const actor = actorAuth0Id
    ? await db.users.findFirst({
        where: { auth0Id: actorAuth0Id },
        select: { userid: true },
      })
    : null;

  return db.audit_entries.create({
    data: {
      actor_user_id: actor?.userid ?? null,
      action,
      target_type: target.type,
      target_id: target.id,
      detail: detail ?? undefined,
    },
  });
}
