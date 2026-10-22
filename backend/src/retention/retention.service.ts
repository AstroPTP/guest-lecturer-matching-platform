// cspell:ignore timestamptz
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { prisma } from '../prisma';
import { recordAudit } from '../admin/platform-rules';
import { readRetentionConfig, type RetentionConfig } from './retention.config';

/**
 * Key for the advisory lock that keeps two API instances from purging at once.
 * An arbitrary constant (the ASCII bytes of a project and job tag), chosen so
 * it is unlikely to collide with any other advisory lock on this database.
 */
export const RETENTION_LOCK_KEY = 0x474c4d5052455445n;

const DAY_MS = 86_400_000;

/**
 * Interactive transactions default to a five second limit, which a full batch
 * can exceed on a busy or remote database. A batch that overruns is rolled
 * back whole, so a generous limit costs nothing but a slow query.
 */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 60_000 };

/**
 * How a run ended. 'skipped' means another instance held the lock from the
 * start and nothing was deleted; 'partial' means this run deleted some rows
 * before another instance took the lock.
 */
export type RetentionOutcome = 'completed' | 'skipped' | 'partial' | 'failed';

/** What one run did. Counts and flags only, never anything from a message. */
export interface RetentionRun {
  dryRun: boolean;
  retentionDays: number;
  cutoff: Date;
  /** Rows a dry run found past the cut-off. Zero for a real run. */
  wouldDelete: number;
  /** Support messages a dry run found past the cut-off. Zero for a real run. */
  supportWouldDelete: number;
  deleted: number;
  /** Support messages deleted, counted apart from the match messages above. */
  supportDeleted: number;
  /** Messages with no sent_at, which no run ever deletes. */
  skippedNullSentAt: number;
  /** Batches that removed at least one row. */
  batches: number;
  durationMs: number;
  outcome: RetentionOutcome;
  /**
   * False when the audit row could not be written. Not part of the row; it
   * lets the one-shot command exit non-zero, because a purge with no record of
   * it is a compliance gap someone has to hear about.
   */
  auditWritten: boolean;
}

/** What the administrator's preview returns. */
export interface RetentionPreview {
  dryRun: true;
  retentionDays: number;
  cutoff: string;
  wouldDelete: number;
  supportWouldDelete: number;
  skippedNullSentAt: number;
}

/**
 * Deletes in-app messages older than the retention window, once a week. That
 * covers the messages between matched people and the messages in requests for
 * details, together with the files attached to the latter.
 *
 * The window is measured from `sent_at`. A message with no `sent_at` has no
 * age to measure, so it is never deleted; the run counts those rows and
 * reports the number instead, so someone can decide what they are. Support
 * messages always have one.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  /**
   * Sundays at 02:00 UTC, the quiet hour for the Perth-based users.
   *
   * Only fires where a process stays up. On a host that does not (serverless),
   * an external scheduler runs `npm run retention:run` and this switches
   * itself off with RETENTION_IN_PROCESS_SCHEDULE=false, so the two cannot
   * both run.
   */
  @Cron('0 2 * * 0', { name: 'message-retention', timeZone: 'UTC' })
  async scheduledPurge(): Promise<void> {
    if (!this.config().inProcessSchedule) {
      this.logger.log(
        'In-process schedule is off (RETENTION_IN_PROCESS_SCHEDULE=false); ' +
          'an external scheduler is expected to run retention:run.',
      );
      return;
    }
    await this.runIfEnabled();
  }

  /**
   * One run unless RETENTION_ENABLED is false, in which case nothing happens
   * and null comes back. Shared by the in-process schedule and the one-shot
   * command, so both honour the switch the same way.
   */
  async runIfEnabled(): Promise<RetentionRun | null> {
    const config = this.config();
    if (!config.enabled) {
      this.logger.log('Message retention is switched off; nothing to do.');
      return null;
    }
    return this.purge(config);
  }

  /**
   * Counts what a run would delete without deleting, locking or auditing
   * anything. Backs the administrator's preview.
   */
  async preview(): Promise<RetentionPreview> {
    const { retentionDays } = this.config();
    const cutoff = this.cutoffFor(retentionDays);
    const [wouldDelete, supportWouldDelete, skippedNullSentAt] =
      await Promise.all([
        this.countExpired(cutoff),
        this.countExpiredSupport(cutoff),
        this.countNullSentAt(),
      ]);
    return {
      dryRun: true,
      retentionDays,
      cutoff: cutoff.toISOString(),
      wouldDelete,
      supportWouldDelete,
      skippedNullSentAt,
    };
  }

  /**
   * One retention run. Never throws: a failure is logged, recorded in the
   * audit trail and returned as outcome 'failed', so a bad night cannot take
   * the scheduler down with it.
   */
  async purge(config: RetentionConfig = this.config()): Promise<RetentionRun> {
    const startedAt = Date.now();
    const cutoff = this.cutoffFor(config.retentionDays);
    const run: RetentionRun = {
      dryRun: config.dryRun,
      retentionDays: config.retentionDays,
      cutoff,
      wouldDelete: 0,
      supportWouldDelete: 0,
      deleted: 0,
      supportDeleted: 0,
      skippedNullSentAt: 0,
      batches: 0,
      durationMs: 0,
      outcome: 'completed',
      auditWritten: false,
    };

    try {
      run.skippedNullSentAt = await this.countNullSentAt();

      if (config.dryRun) {
        run.wouldDelete = await this.countExpired(cutoff);
        run.supportWouldDelete = await this.countExpiredSupport(cutoff);
      } else {
        // The loop ends on the first batch that deletes nothing, which is
        // what makes a re-run safe: it simply finds nothing left to do.
        for (;;) {
          const batch = await this.deleteBatch(cutoff, config.batchSize);
          if (!batch.acquired) {
            // Rows already deleted in this run stay deleted, so a lock lost
            // part-way is not the same as never having had it.
            const removedSoFar = run.deleted + run.supportDeleted;
            if (removedSoFar > 0) {
              run.outcome = 'partial';
              this.logger.log(
                `Stopped early: another instance took over after ${removedSoFar} rows.`,
              );
            } else {
              run.outcome = 'skipped';
              this.logger.log('Skipped: another instance is running.');
            }
            break;
          }
          if (batch.deleted + batch.supportDeleted === 0) break;
          run.deleted += batch.deleted;
          run.supportDeleted += batch.supportDeleted;
          run.batches += 1;
        }
      }
    } catch (error) {
      run.outcome = 'failed';
      // The class and code only. The message text can carry the query and its
      // parameters, and nothing here should put row data in a log.
      this.logger.warn(`Message retention failed: ${describeError(error)}`);
    }

    run.durationMs = Date.now() - startedAt;
    run.auditWritten = await this.audit(run);
    this.logger.log(
      `Message retention ${run.outcome}: dryRun=${run.dryRun} ` +
        `deleted=${run.deleted} wouldDelete=${run.wouldDelete} ` +
        `supportDeleted=${run.supportDeleted} ` +
        `supportWouldDelete=${run.supportWouldDelete} ` +
        `skippedNullSentAt=${run.skippedNullSentAt} batches=${run.batches} ` +
        `durationMs=${run.durationMs}`,
    );
    return run;
  }

  private config(): RetentionConfig {
    return readRetentionConfig(process.env, (message) =>
      this.logger.warn(message),
    );
  }

  private cutoffFor(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * DAY_MS);
  }

  /**
   * Deletes one batch under the retention lock.
   *
   * The lock serialises batches, not whole runs: it is released when each
   * batch's transaction ends. Two instances that start together can therefore
   * alternate between batches, each deleting some of the rows. That is safe,
   * because a delete only ever removes rows past the cut-off and a re-run
   * finds nothing left, and the batches never overlap, so no two deletes run
   * at once. An instance that finds the lock taken stops, and says so in its
   * outcome.
   *
   * One batch removes up to `batchSize` match messages and up to `batchSize`
   * support messages, and then any attached files the removed support
   * messages leave with nothing pointing at them. All of it is in the one
   * transaction, so a file is never deleted while a message still refers to
   * it, and never left behind when its message goes.
   *
   * The lock is a transaction-level advisory lock taken inside the same
   * transaction as the delete, not a session-level one. The database can sit
   * behind a transaction-mode pooler (PgBouncer, Supabase), which hands each
   * statement outside a transaction to whichever connection is free. A
   * session lock would be taken on one connection and the delete would run on
   * another, so it would protect nothing, and it could be left held on a
   * pooled connection with no owner. A transaction lock lives and dies with
   * the transaction, on the one connection the pooler pins for its duration.
   */
  private deleteBatch(
    cutoff: Date,
    batchSize: number,
  ): Promise<{ acquired: boolean; deleted: number; supportDeleted: number }> {
    return prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${RETENTION_LOCK_KEY}::bigint) AS acquired`;
      if (!lock?.acquired) {
        return { acquired: false, deleted: 0, supportDeleted: 0 };
      }

      // `sent_at IS NOT NULL` is redundant, since a comparison with NULL is
      // never true, but it makes the promise that unsent rows survive visible
      // in the statement rather than leaving it to SQL's three-valued logic.
      const deleted = await tx.$executeRaw`
        DELETE FROM messages
        WHERE message_id IN (
          SELECT message_id FROM messages
          WHERE sent_at IS NOT NULL AND sent_at < ${cutoff}::timestamp
          ORDER BY sent_at, message_id
          LIMIT ${batchSize}
        )`;

      // RETURNING hands back the files these messages pointed at, which is
      // how the files that are now unreferenced are found.
      const removed = await tx.$queryRaw<{ attachment_id: bigint | null }[]>`
        DELETE FROM support_messages
        WHERE message_id IN (
          SELECT message_id FROM support_messages
          WHERE sent_at < ${cutoff}::timestamptz
          ORDER BY sent_at, message_id
          LIMIT ${batchSize}
        )
        RETURNING attachment_id`;
      const attachmentIds = removed.flatMap((row) =>
        row.attachment_id === null ? [] : [row.attachment_id],
      );
      if (attachmentIds.length > 0) {
        // The NOT EXISTS keeps a file that something else still refers to.
        await tx.$executeRaw`
          DELETE FROM support_attachments a
          WHERE a.attachment_id = ANY(${attachmentIds}::bigint[])
            AND NOT EXISTS (
              SELECT 1 FROM support_messages m
              WHERE m.attachment_id = a.attachment_id
            )`;
      }
      return { acquired: true, deleted, supportDeleted: removed.length };
    }, TRANSACTION_OPTIONS);
  }

  /** Same predicate as deleteBatch, so a dry run reports what a run deletes. */
  private async countExpired(cutoff: Date): Promise<number> {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM messages
      WHERE sent_at IS NOT NULL AND sent_at < ${cutoff}::timestamp`;
    return row?.count ?? 0;
  }

  /** Same predicate as the support delete in deleteBatch. */
  private async countExpiredSupport(cutoff: Date): Promise<number> {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM support_messages
      WHERE sent_at < ${cutoff}::timestamptz`;
    return row?.count ?? 0;
  }

  private async countNullSentAt(): Promise<number> {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM messages WHERE sent_at IS NULL`;
    return row?.count ?? 0;
  }

  /**
   * One audit row per run. The detail holds counts and flags only, so the
   * trail records that a purge happened without becoming a second copy of
   * what was purged. A failure here is logged and reported through the return
   * value rather than thrown: the run has already happened, and throwing would
   * only hide that. The one-shot command turns it into a non-zero exit.
   */
  private async audit(run: RetentionRun): Promise<boolean> {
    try {
      await recordAudit(
        null,
        'retention.purge',
        { type: 'messages' },
        {
          dryRun: run.dryRun,
          retentionDays: run.retentionDays,
          cutoff: run.cutoff.toISOString(),
          deleted: run.deleted,
          supportDeleted: run.supportDeleted,
          // A dry run deletes nothing, so without this the row would say
          // nothing about what the run found.
          ...(run.dryRun
            ? {
                wouldDelete: run.wouldDelete,
                supportWouldDelete: run.supportWouldDelete,
              }
            : {}),
          skippedNullSentAt: run.skippedNullSentAt,
          batches: run.batches,
          durationMs: run.durationMs,
          outcome: run.outcome,
        },
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Message retention audit entry not written: ${describeError(error)}`,
      );
      return false;
    }
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} (${code})` : error.name;
}
