import { ConflictException } from '@nestjs/common';
import { currentCorrelationId } from '../common/request-context';
import { prisma } from '../prisma';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Rules an administrator can change, and the helpers other modules use to
 * apply them. Plain functions rather than an injectable so the services that
 * apply a rule need one import, not a module dependency.
 */

/** The settings row. Upserted so the first read cannot race another. */
export function readSettings() {
  return prisma.admin_settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

/**
 * Which guest lecturers coordinators may see: never a deactivated account,
 * and only approved profiles while approval is required.
 */
export async function visibleGuestsWhere(): Promise<Prisma.guestsWhereInput> {
  const { require_admin_approval: approvalRequired } = await readSettings();
  return {
    OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
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
 *
 * When written during a request, the entry also carries that request's
 * correlation id in its detail, which is what ties it to the request log line
 * and to the id on any error the caller saw (NFR-59). Read before the first
 * await, while the request is certainly still the current one.
 */
export async function recordAudit(
  actorAuth0Id: string | null,
  action: string,
  target: { type?: string; id?: string },
  detail?: Prisma.InputJsonValue,
) {
  const linkedDetail = withCorrelationId(detail, currentCorrelationId());

  const actor = actorAuth0Id
    ? await prisma.users.findFirst({
        where: { auth0Id: actorAuth0Id },
        select: { userid: true },
      })
    : null;

  return prisma.audit_entries.create({
    data: {
      actor_user_id: actor?.userid ?? null,
      action,
      target_type: target.type,
      target_id: target.id,
      detail: linkedDetail ?? undefined,
    },
  });
}

/**
 * The detail with the correlation id added, or the detail untouched when there
 * is no id (a scheduled job or the retention command, where no request exists).
 *
 * A key the caller already set is never overwritten. A detail that is not an
 * object (a string, a number, an array) has nowhere to put a key, so it is
 * kept whole under `value` rather than dropped or the id being lost.
 */
function withCorrelationId(
  detail: Prisma.InputJsonValue | undefined,
  correlationId: string | undefined,
): Prisma.InputJsonValue | undefined {
  if (!correlationId) return detail;
  if (detail === undefined) return { correlationId };
  if (isPlainObject(detail)) return { correlationId, ...detail };
  return { correlationId, value: detail };
}

function isPlainObject(value: unknown): value is Prisma.InputJsonObject {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
