import { prisma } from '../prisma';

/**
 * Reports nobody has decided yet, and what an open report does to the person
 * it is about. Plain functions, like platform-rules, so the services that
 * apply the rule need one import and no module dependency.
 *
 * A report is an append-only 'user.reported' audit entry, and a decision is a
 * later 'report.resolved' entry whose target is the report's entry id. A
 * report is open until such a decision exists.
 */

/**
 * Whether a report was raised through an accepted match, which is the only
 * kind that blocks the person it names. A report made without one (the plain
 * `reportedUserId` body) still reaches the moderation queue, but it is not
 * evidence that the two people ever dealt with each other, so letting it
 * block would let anyone hide any account from everybody else.
 */
export function blocksReportedUser(detail: unknown): boolean {
  if (typeof detail !== 'object' || detail === null) return false;
  const { matchId } = detail as { matchId?: unknown };
  return typeof matchId === 'string' && matchId !== '';
}

/** Open reports, oldest first, with the reporter's email. */
export async function findOpenReports() {
  const reports = await prisma.audit_entries.findMany({
    where: { action: 'user.reported' },
    orderBy: { occurred_at: 'asc' },
    include: { actor: { select: { email: true } } },
  });
  if (reports.length === 0) return [];

  // Only decisions about these reports matter, so the second read is bounded
  // by the number of reports rather than by everything ever resolved.
  const resolutions = await prisma.audit_entries.findMany({
    where: {
      action: 'report.resolved',
      target_id: { in: reports.map((r) => r.entry_id.toString()) },
    },
    select: { target_id: true },
  });
  const resolved = new Set(resolutions.map((r) => r.target_id));
  return reports.filter((r) => !resolved.has(r.entry_id.toString()));
}

/**
 * The users.userid of everyone with an open report that blocks them. Empty
 * almost always, so callers can skip further work when it is.
 */
export async function openReportedUserIds(): Promise<Set<bigint>> {
  const open = await findOpenReports();
  const ids = new Set<bigint>();
  for (const report of open) {
    if (!report.target_id || !blocksReportedUser(report.detail)) continue;
    try {
      ids.add(BigInt(report.target_id));
    } catch {
      // A target that is not a numeric id cannot name a user row.
    }
  }
  return ids;
}

/**
 * A filter for Discovery queries on a table with a nullable `user_id`:
 * everyone except the people with an open report. Profiles with no user_id
 * stay, because a NOT IN alone would drop them (NULL is never "not in").
 */
export async function notReportedWhere() {
  const reported = await openReportedUserIds();
  return {
    OR: [{ user_id: null }, { user_id: { notIn: [...reported] } }],
  };
}
