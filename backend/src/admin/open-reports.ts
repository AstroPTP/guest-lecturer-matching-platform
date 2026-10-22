import { ConflictException } from '@nestjs/common';
import { prisma, resolveUserId } from '../prisma';
import type { Prisma } from '../../generated/prisma/client';

/** The root client or a transaction's: either can run these reads. */
type Db = Prisma.TransactionClient;

/**
 * Reports nobody has decided yet, and what they do to the people involved.
 * Plain functions, like platform-rules, so the services that apply the rules
 * need one import and no module dependency.
 *
 * A report is an append-only 'user.reported' audit entry whose actor is the
 * reporter and whose target is the person reported. A decision is a later
 * 'report.resolved' entry whose target is the report's entry id. A report is
 * open until such a decision exists.
 *
 * An open report does two separate things:
 *
 *  - It blocks the pair at once. The reporter and the person reported stop
 *    seeing each other in Discovery and cannot message each other. Nobody
 *    else is affected, so a report alone cannot take someone off the platform.
 *
 *  - It can put the person on hold, which hides them from everyone and stops
 *    them sending or receiving messages. That needs open reports from at least
 *    REPORT_HOLD_THRESHOLD different people, or an administrator placing the
 *    hold ('user.held', lifted by 'user.released'). An administrator's hold
 *    names the reports that were open when it was placed, and counts only
 *    while one of those is still open, so it cannot outlive the complaint it
 *    was placed for and catch out a later, unrelated report.
 */

/**
 * Namespaces for the two advisory locks below. They are the first argument of
 * pg_advisory_xact_lock(int, int), so a person's id in one namespace never
 * clashes with the same id in the other.
 */
const REPORTER_LOCK_NAMESPACE = 0x52_50_01;
const REPORTED_LOCK_NAMESPACE = 0x52_50_02;

/**
 * Takes a lock on one person that lasts until the transaction ends, waiting
 * if another transaction holds it. A transaction-level lock rather than a
 * session one, because the database can sit behind a transaction-mode pooler:
 * the transaction pins one connection, so the lock and the statements it
 * protects share it, and nothing is left held when the connection is returned.
 * The id is folded into 32 bits, which only ever makes two people share a
 * lock, never lets one go unprotected.
 */
async function lockPerson(tx: Db, namespace: number, person: bigint) {
  const key = Number(BigInt.asIntN(32, person));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${namespace}::int, ${key}::int)`;
}

/**
 * Serialises one person's reports, so that two sent together cannot both pass
 * the limit check before either is stored.
 */
export function lockReporter(tx: Db, reporter: bigint) {
  return lockPerson(tx, REPORTER_LOCK_NAMESPACE, reporter);
}

/**
 * Serialises holding, deciding and releasing for one person who has been
 * reported, so that the steps of one decision cannot interleave with another's.
 */
export function lockReported(tx: Db, reported: bigint) {
  return lockPerson(tx, REPORTED_LOCK_NAMESPACE, reported);
}

export const DEFAULT_REPORT_HOLD_THRESHOLD = 2;

/** Most open reports one person may have at a time. */
export const MAX_OPEN_REPORTS_PER_REPORTER = 5;

/**
 * How many different people must have an open report about someone before
 * that person is held for everybody. Read at the moment of use, so a value
 * written into backend/.env by loadEnvFile() is seen. Unset or not a whole
 * number falls back to the default, and 0 is raised to 1.
 */
export function readReportHoldThreshold(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.REPORT_HOLD_THRESHOLD?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_REPORT_HOLD_THRESHOLD;
  return Math.max(1, Number(raw));
}

/**
 * Whether a report was raised through an accepted match. Only these count
 * toward a hold: they come from someone the other person agreed to match
 * with, whereas the plain `reportedUserId` body can name anyone, so counting
 * it would let two throwaway accounts hold any account.
 */
export function isMatchReport(detail: unknown): boolean {
  if (typeof detail !== 'object' || detail === null) return false;
  const { matchId } = detail as { matchId?: unknown };
  return typeof matchId === 'string' && matchId !== '';
}

/** Open reports, oldest first, with the reporter's email. */
export async function findOpenReports(db: Db = prisma) {
  const reports = await db.audit_entries.findMany({
    where: { action: 'user.reported' },
    orderBy: { occurred_at: 'asc' },
    include: { actor: { select: { email: true } } },
  });
  if (reports.length === 0) return [];

  // Only decisions about these reports matter, so the second read is bounded
  // by the number of reports rather than by everything ever resolved.
  const resolutions = await db.audit_entries.findMany({
    where: {
      action: 'report.resolved',
      target_id: { in: reports.map((r) => r.entry_id.toString()) },
    },
    select: { target_id: true },
  });
  const resolved = new Set(resolutions.map((r) => r.target_id));
  return reports.filter((r) => !resolved.has(r.entry_id.toString()));
}

export type OpenReport = Awaited<ReturnType<typeof findOpenReports>>[number];

export type HoldReason = 'threshold' | 'admin';

/** Everything the rules need to know, read once per request. */
export interface ModerationState {
  /** Open reports, oldest first. */
  reports: OpenReport[];
  /** Per person reported, the different people with an open report from a match. */
  reporters: Map<bigint, Set<bigint>>;
  /** Per person, everyone they have an open report with, either way round. */
  blockedWith: Map<bigint, Set<bigint>>;
  /**
   * For each person an administrator has held and not released, the ids of the
   * reports that were open when they did.
   */
  adminHolds: Map<bigint, Set<string>>;
  /** Those people whose hold still counts: one of its reports is still open. */
  adminHeld: Set<bigint>;
  /** People held for everybody, and why. */
  held: Map<bigint, HoldReason[]>;
  /** The threshold in force when this was read. */
  threshold: number;
}

function toUserId(value: string | null): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

/** The report ids a 'user.held' entry names; none when it names none. */
function reportIdsOf(detail: unknown): Set<string> {
  const ids = (detail as { reportIds?: unknown } | null)?.reportIds;
  return new Set(
    Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [],
  );
}

function addTo(map: Map<bigint, Set<bigint>>, key: bigint, value: bigint) {
  const set = map.get(key) ?? new Set<bigint>();
  set.add(value);
  map.set(key, set);
}

/**
 * Reads the open reports and the administrator's holds and works out who is
 * blocked from whom and who is held. Does a single read when nobody has been
 * reported, which is nearly always.
 */
export async function loadModerationState(
  db: Db = prisma,
): Promise<ModerationState> {
  const state: ModerationState = {
    reports: await findOpenReports(db),
    reporters: new Map(),
    blockedWith: new Map(),
    adminHolds: new Map(),
    adminHeld: new Set(),
    held: new Map(),
    threshold: readReportHoldThreshold(),
  };
  if (state.reports.length === 0) return state;

  const reported = new Set<bigint>();
  for (const report of state.reports) {
    const target = toUserId(report.target_id);
    if (target === null) continue;
    reported.add(target);
    if (typeof report.actor_user_id !== 'bigint') continue;

    addTo(state.blockedWith, report.actor_user_id, target);
    addTo(state.blockedWith, target, report.actor_user_id);
    if (isMatchReport(report.detail)) {
      addTo(state.reporters, target, report.actor_user_id);
    }
  }

  // Oldest first, so the last entry for a person is their current state.
  const marks = await db.audit_entries.findMany({
    where: { action: { in: ['user.held', 'user.released'] } },
    orderBy: { entry_id: 'asc' },
    select: { action: true, target_id: true, detail: true },
  });
  for (const mark of marks) {
    const person = toUserId(mark.target_id);
    if (person === null) continue;
    if (mark.action === 'user.held') {
      state.adminHolds.set(person, reportIdsOf(mark.detail));
    } else {
      state.adminHolds.delete(person);
    }
  }
  const openIds = new Set(state.reports.map((r) => r.entry_id.toString()));
  for (const [person, covered] of state.adminHolds) {
    if ([...covered].some((id) => openIds.has(id))) state.adminHeld.add(person);
  }

  // An administrator's hold bridges the wait for a decision on the reports it
  // was placed for, and ends with the last of them.
  for (const person of reported) {
    const reasons: HoldReason[] = [];
    if ((state.reporters.get(person)?.size ?? 0) >= state.threshold) {
      reasons.push('threshold');
    }
    if (state.adminHeld.has(person)) reasons.push('admin');
    if (reasons.length > 0) state.held.set(person, reasons);
  }
  return state;
}

/** Whether two people may not message each other right now. */
export function isConversationPaused(
  state: ModerationState,
  caller: bigint,
  counterpart: bigint | null,
): boolean {
  if (state.held.has(caller)) return true;
  if (counterpart === null) return false;
  return (
    state.held.has(counterpart) ||
    (state.blockedWith.get(caller)?.has(counterpart) ?? false)
  );
}

/**
 * A filter for Discovery queries on a table with a nullable `user_id`: leaves
 * out everyone who is held, and everyone the viewer has an open report with,
 * whichever of them made it. Profiles with no user_id stay, because a NOT IN
 * alone would drop them (NULL is never "not in").
 */
export async function notHiddenWhere(viewerAuth0Id?: string) {
  const state = await loadModerationState();
  const hidden = new Set(state.held.keys());
  if (viewerAuth0Id && state.blockedWith.size > 0) {
    const viewer = await resolveUserId(viewerAuth0Id);
    for (const other of state.blockedWith.get(viewer) ?? []) hidden.add(other);
  }
  return {
    OR: [{ user_id: null }, { user_id: { notIn: [...hidden] } }],
  };
}

/**
 * Refuses a new report that would flood the queue: a second open report from
 * the same person about the same person, or a sixth open report from one
 * person. Both are 409s with wording the reporter can act on.
 */
export function assertReporterWithinLimits(
  open: OpenReport[],
  reporter: bigint,
  reported: bigint,
): void {
  const mine = open.filter((r) => r.actor_user_id === reporter);
  if (mine.some((r) => r.target_id === reported.toString())) {
    throw new ConflictException({
      code: 'REPORT_ALREADY_OPEN',
      message:
        'You have already reported this person. An administrator will review it, so there is nothing more to send.',
    });
  }
  if (mine.length >= MAX_OPEN_REPORTS_PER_REPORTER) {
    throw new ConflictException({
      code: 'REPORT_LIMIT_REACHED',
      message: `You already have ${MAX_OPEN_REPORTS_PER_REPORTER} reports waiting for an administrator. Please wait for a decision on those before sending another.`,
    });
  }
}
