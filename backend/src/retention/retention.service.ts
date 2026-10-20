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

export type RetentionOutcome = 'completed' | 'skipped' | 'failed';

/** What one run did. Counts and flags only, never anything from a message. */
export interface RetentionRun {
  dryRun: boolean;
  retentionDays: number;
  cutoff: Date;
  /** Rows a dry run found past the cut-off. Zero for a real run. */
  wouldDelete: number;
  deleted: number;
  /** Messages with no sent_at, which no run ever deletes. */
  skippedNullSentAt: number;
  /** Batches that removed at least one row. */
  batches: number;
  durationMs: number;
  outcome: RetentionOutcome;
}

/** What the administrator's preview returns. */
export interface RetentionPreview {
  dryRun: true;
  retentionDays: number;
  cutoff: string;
  wouldDelete: number;
  skippedNullSentAt: number;
}

/**
 * Deletes in-app messages older than the retention window, once a week.
 *
 * The window is measured from `sent_at`. A message with no `sent_at` has no
 * age to measure, so it is never deleted; the run counts those rows and
 * reports the number instead, so someone can decide what they are.
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
    const [wouldDelete, skippedNullSentAt] = await Promise.all([
      this.countExpired(cutoff),
      this.countNullSentAt(),
    ]);
    return {
      dryRun: true,
      retentionDays,
      cutoff: cutoff.toISOString(),
      wouldDelete,
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
      deleted: 0,
      skippedNullSentAt: 0,
      batches: 0,
      durationMs: 0,
      outcome: 'completed',
    };

    try {
      run.skippedNullSentAt = await this.countNullSentAt();

      if (config.dryRun) {
        run.wouldDelete = await this.countExpired(cutoff);
      } else {
        // The loop ends on the first batch that deletes nothing, which is
        // what makes a re-run safe: it simply finds nothing left to do.
        for (;;) {
          const batch = await this.deleteBatch(cutoff, config.batchSize);
          if (!batch.acquired) {
            run.outcome = 'skipped';
            this.logger.log('Skipped: another instance is running.');
            break;
          }
          if (batch.deleted === 0) break;
          run.deleted += batch.deleted;
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
    await this.audit(run);
    this.logger.log(
      `Message retention ${run.outcome}: dryRun=${run.dryRun} ` +
        `deleted=${run.deleted} wouldDelete=${run.wouldDelete} ` +
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
  ): Promise<{ acquired: boolean; deleted: number }> {
    return prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${RETENTION_LOCK_KEY}::bigint) AS acquired`;
      if (!lock?.acquired) {
        return { acquired: false, deleted: 0 };
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
      return { acquired: true, deleted };
    }, TRANSACTION_OPTIONS);
  }

  /** Same predicate as deleteBatch, so a dry run reports what a run deletes. */
  private async countExpired(cutoff: Date): Promise<number> {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM messages
      WHERE sent_at IS NOT NULL AND sent_at < ${cutoff}::timestamp`;
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
   * what was purged. A failure here is logged and swallowed: the run has
   * already happened, and throwing would only hide that.
   */
  private async audit(run: RetentionRun): Promise<void> {
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
          // A dry run deletes nothing, so without this the row would say
          // nothing about what the run found.
          ...(run.dryRun ? { wouldDelete: run.wouldDelete } : {}),
          skippedNullSentAt: run.skippedNullSentAt,
          batches: run.batches,
          durationMs: run.durationMs,
          outcome: run.outcome,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Message retention audit entry not written: ${describeError(error)}`,
      );
    }
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} (${code})` : error.name;
}
