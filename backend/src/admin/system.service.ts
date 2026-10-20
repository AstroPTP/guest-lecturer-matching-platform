import { Injectable } from '@nestjs/common';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import { TimeoutError, withTimeout } from '../common/with-timeout';
import { monitoringStore } from '../monitoring/monitoring.store';
import { prisma } from '../prisma';
import type {
  CheckStatus,
  SecuritySignals,
  SystemCheck,
  SystemSnapshot,
} from './system.types';

/** Any one query that takes longer than this is reported as not answering. */
const QUERY_TIMEOUT_MS = 2000;

/** The window the error rate and the security counts are measured over. */
const WINDOW_MINUTES = 15;

const RECENT_EVENTS = 20;

/** How many of the latest retention.purge entries are read to find the last real run. */
const RETENTION_ENTRIES = 20;

/** Runs that delete data and finished, as opposed to failed, skipped or dry. */
const COUNTED_OUTCOMES: ReadonlySet<string> = new Set(['completed', 'partial']);

/** Shown instead of a server path when SYSTEM_DISK_PATH has not been set. */
const DEFAULT_DISK_LABEL = 'application directory';
const LARGEST_TABLES = 8;
const BYTES_PER_MB = 1024 * 1024;
const MS_PER_DAY = 86_400_000;

const AUTH_PROVIDER_NOTE =
  'Failed sign-ins happen in Auth0 and are not visible to the API. Review them in the Auth0 dashboard under Monitoring, Logs.';

/**
 * The limits a figure is judged against. Read from the environment on every
 * call rather than once at boot, so a value changed on the host applies to the
 * next request. An unset, non-numeric or non-positive value falls back to its
 * default instead of stopping anything: these tune a dashboard, they are not
 * configuration the application cannot run without.
 */
interface Thresholds {
  dbLatencyWarnMs: number;
  storageWarnPct: number;
  storageCriticalPct: number;
  memoryWarnPct: number;
  cpuLoadWarn: number;
  errorRateWarn: number;
  retentionAlertDays: number;
  authFailureWarn: number;
  adminForbiddenWarn: number;
}

function positiveNumber(name: string, max = Infinity): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : undefined;
}

function readThresholds(): Thresholds {
  return {
    dbLatencyWarnMs: positiveNumber('DB_LATENCY_WARN_MS') ?? 500,
    storageWarnPct: positiveNumber('STORAGE_WARN_PCT', 100) ?? 80,
    storageCriticalPct: positiveNumber('STORAGE_CRITICAL_PCT', 100) ?? 90,
    memoryWarnPct: positiveNumber('MEMORY_WARN_PCT', 100) ?? 85,
    cpuLoadWarn: positiveNumber('CPU_LOAD_WARN') ?? 1.5,
    errorRateWarn: positiveNumber('ERROR_RATE_WARN') ?? 5,
    retentionAlertDays: positiveNumber('RETENTION_ALERT_DAYS') ?? 8,
    authFailureWarn: positiveNumber('AUTH_FAILURE_WARN') ?? 20,
    adminForbiddenWarn: positiveNumber('ADMIN_FORBIDDEN_WARN') ?? 3,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const megabytes = (bytes: number): string =>
  round1(bytes / BYTES_PER_MB).toString();
const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Raw queries hand back bigint for bigint columns and sometimes strings for
 * numerics. Anything that is not a finite number becomes null, so a bad cell
 * shows as "not measured" rather than as NaN.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A byte count from the host, never negative and never NaN. */
const hostBytes = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Runs the database queries of one snapshot, one at a time.
 *
 * Each gets the usual timeout, and the first one to time out ends the run: the
 * ones after it are not sent, because a database too slow to answer in two
 * seconds is not helped by being asked more. Any other failure, a missing
 * permission for one catalogue query for instance, costs only that figure.
 *
 * A failure and a skipped query both come back as null. The error itself is
 * dropped on purpose: a driver message can name the database host.
 */
class QueryBudget {
  timedOut = false;

  async run<T>(work: () => PromiseLike<T>): Promise<T | null> {
    if (this.timedOut) return null;
    try {
      return await withTimeout(work(), QUERY_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof TimeoutError) this.timedOut = true;
      return null;
    }
  }
}

const SKIPPED_AFTER_TIMEOUT =
  'Not checked because an earlier database query timed out.';

interface DiskReading {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedPct: number;
}

interface TableReading {
  largestTables: SystemSnapshot['storage']['largestTables'];
  photosBytes: number | null;
}

interface TableRow {
  table_name: unknown;
  row_estimate: unknown;
  bytes: unknown;
}

interface UsageRow {
  active_24h: unknown;
  active_7d: unknown;
  new_accounts_7d: unknown;
  match_requests_7d: unknown;
  messages_7d: unknown;
  photos_stored: unknown;
}

type Usage = SystemSnapshot['usage'];

const NO_TABLES: TableReading = { largestTables: [], photosBytes: null };

const NO_USAGE: Usage = {
  activeUsers24h: null,
  activeUsers7d: null,
  newAccounts7d: null,
  matchRequests7d: null,
  messages7d: null,
  photosStored: null,
};

/**
 * Health and security figures for the CCAE administrator.
 *
 * The rule throughout is that a figure is either measured or admitted to be
 * unmeasured. Each check catches its own failure and reports `unknown` or
 * `unavailable` with a message that carries no driver text, so one broken probe
 * can neither take the page down nor put a made-up number on it.
 */
@Injectable()
export class SystemService {
  async snapshot(): Promise<SystemSnapshot> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const limits = readThresholds();

    const budget = new QueryBudget();

    // First and alone, so its timing is not inflated by the queries below and
    // so that an unreachable database is discovered once rather than by every
    // one of them waiting out its own timeout.
    const database = await this.checkDatabase(checkedAt, limits, budget);
    const reachable = database.status !== 'unavailable';

    // Not a database query, so it is not part of the budget.
    const disk = await this.readDisk();

    // One at a time, cheapest first, rather than all at once: the point of the
    // page is to watch the database, and nine simultaneous queries from a
    // refreshing dashboard are a load of its own on a small pooled plan.
    const databaseBytes = reachable
      ? await this.readDatabaseBytes(budget)
      : null;
    const tables = reachable ? await this.readTables(budget) : NO_TABLES;
    const retention = reachable
      ? await this.checkRetention(checkedAt, now, limits, budget)
      : this.build(checkedAt, 'retention', 'Data retention', {
          status: 'unknown',
          message: 'Not checked because the database could not be reached.',
          unit: 'days',
          threshold: { warning: limits.retentionAlertDays, critical: null },
        });
    const usage = reachable ? await this.readUsage(budget) : NO_USAGE;

    const limitMb = positiveNumber('DB_SIZE_LIMIT_MB');
    const databaseLimitBytes =
      limitMb === undefined ? null : Math.round(limitMb * BYTES_PER_MB);

    const checks: SystemCheck[] = [
      this.checkApi(checkedAt),
      database,
      this.checkDatabaseSize(
        checkedAt,
        databaseBytes,
        databaseLimitBytes,
        reachable,
        budget,
        limits,
      ),
      this.checkDisk(checkedAt, disk, limits),
      this.checkMemory(checkedAt, limits),
      this.checkCpu(checkedAt, limits),
      this.checkErrorRate(checkedAt, now, limits),
      retention,
    ];

    return {
      checkedAt,
      overall: overallOf(checks),
      uptimeSeconds: Math.floor(process.uptime()),
      checks,
      storage: {
        databaseBytes,
        databaseLimitBytes,
        photosBytes: tables.photosBytes,
        largestTables: tables.largestTables,
        disk: disk
          ? {
              path: disk.path,
              totalBytes: disk.totalBytes,
              freeBytes: disk.freeBytes,
            }
          : null,
        memory: {
          totalBytes: hostBytes(os.totalmem()),
          freeBytes: hostBytes(os.freemem()),
          processRssBytes: hostBytes(process.memoryUsage.rss()),
        },
      },
      usage,
      alerts: checks
        .filter(
          (c): c is SystemCheck & { status: 'warning' | 'unavailable' } =>
            c.status === 'warning' || c.status === 'unavailable',
        )
        .map((c) => ({ key: c.key, status: c.status, message: c.message })),
    };
  }

  /** Counts of what the API has refused or failed on, from this process only. */
  security(): SecuritySignals {
    const limits = readThresholds();
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
    const counts = monitoringStore.countsSince(since);

    const alerts: SecuritySignals['alerts'] = [];
    if (counts.authFailures >= limits.authFailureWarn) {
      alerts.push({
        key: 'auth_failures',
        status: 'warning',
        message: `${plural(counts.authFailures, 'request')} refused as unauthenticated in the last ${WINDOW_MINUTES} minutes.`,
      });
    }
    if (counts.adminForbidden >= limits.adminForbiddenWarn) {
      alerts.push({
        key: 'admin_forbidden',
        status: 'warning',
        message: `${plural(counts.adminForbidden, 'attempt')} on administrator routes by someone without the role in the last ${WINDOW_MINUTES} minutes.`,
      });
    }

    return {
      startedAt: monitoringStore.startedAt.toISOString(),
      windowMinutes: WINDOW_MINUTES,
      counts,
      countsSinceStart: monitoringStore.countsSinceStart(),
      alerts,
      recent: monitoringStore.recent(RECENT_EVENTS).map((event) => ({
        at: event.at.toISOString(),
        category: event.category,
        method: event.method,
        path: event.path,
        status: event.status,
        userId: event.userId,
      })),
      authProviderNote: AUTH_PROVIDER_NOTE,
    };
  }

  private build(
    checkedAt: string,
    key: SystemCheck['key'],
    label: string,
    fields: {
      status: CheckStatus;
      message: string;
      value?: number | null;
      unit?: string | null;
      threshold?: SystemCheck['threshold'];
    },
  ): SystemCheck {
    return {
      key,
      label,
      status: fields.status,
      value: fields.value ?? null,
      unit: fields.unit ?? null,
      threshold: fields.threshold ?? null,
      message: fields.message,
      checkedAt,
    };
  }

  private checkApi(checkedAt: string): SystemCheck {
    const seconds = Math.floor(process.uptime());
    return this.build(checkedAt, 'api', 'API', {
      status: 'healthy',
      message: 'The API is answering requests.',
      value: seconds,
      unit: 'seconds',
    });
  }

  private async checkDatabase(
    checkedAt: string,
    limits: Thresholds,
    budget: QueryBudget,
  ): Promise<SystemCheck> {
    const threshold = { warning: limits.dbLatencyWarnMs, critical: null };
    const started = Date.now();

    const answer = await budget.run(() => prisma.$queryRaw`SELECT 1`);
    if (answer === null) {
      return this.build(checkedAt, 'database', 'Database', {
        status: 'unavailable',
        message: 'The database did not answer.',
        unit: 'ms',
        threshold,
      });
    }

    const latency = Math.max(0, Date.now() - started);
    const slow = latency >= limits.dbLatencyWarnMs;
    return this.build(checkedAt, 'database', 'Database', {
      status: slow ? 'warning' : 'healthy',
      message: slow
        ? `The database answered in ${latency} ms, slower than the ${limits.dbLatencyWarnMs} ms limit.`
        : `The database answered in ${latency} ms.`,
      value: latency,
      unit: 'ms',
      threshold,
    });
  }

  private async readDatabaseBytes(budget: QueryBudget): Promise<number | null> {
    const rows = await budget.run(
      () =>
        prisma.$queryRaw<
          { bytes: unknown }[]
        >`SELECT pg_database_size(current_database())::bigint AS bytes`,
    );
    return toNumber(rows?.[0]?.bytes);
  }

  private checkDatabaseSize(
    checkedAt: string,
    bytes: number | null,
    limitBytes: number | null,
    reachable: boolean,
    budget: QueryBudget,
    limits: Thresholds,
  ): SystemCheck {
    if (bytes === null) {
      return this.build(checkedAt, 'database_size', 'Database size', {
        status: 'unknown',
        message: !reachable
          ? 'Not checked because the database could not be reached.'
          : budget.timedOut
            ? SKIPPED_AFTER_TIMEOUT
            : 'The database size could not be read. The database user may lack permission to ask.',
        unit: limitBytes === null ? 'bytes' : 'percent',
      });
    }

    if (limitBytes === null) {
      return this.build(checkedAt, 'database_size', 'Database size', {
        status: 'healthy',
        message: `The database holds ${megabytes(bytes)} MB. No size limit is configured, so no percentage can be shown.`,
        value: bytes,
        unit: 'bytes',
      });
    }

    const pct = round1((bytes / limitBytes) * 100);
    return this.build(checkedAt, 'database_size', 'Database size', {
      ...this.judgeStorage(
        pct,
        limits,
        `The database is ${pct}% of its ${megabytes(limitBytes)} MB limit`,
      ),
      value: pct,
      unit: 'percent',
      threshold: {
        warning: limits.storageWarnPct,
        critical: limits.storageCriticalPct,
      },
    });
  }

  /** The same two levels for the database and the disk. Both are 'warning'. */
  private judgeStorage(
    pct: number,
    limits: Thresholds,
    subject: string,
  ): { status: CheckStatus; message: string } {
    if (pct >= limits.storageCriticalPct) {
      return {
        status: 'warning',
        message: `${subject}. This is critical: free space or raise the limit soon.`,
      };
    }
    if (pct >= limits.storageWarnPct) {
      return {
        status: 'warning',
        message: `${subject}, above the ${limits.storageWarnPct}% warning level.`,
      };
    }
    return { status: 'healthy', message: `${subject}.` };
  }

  private async readDisk(): Promise<DiskReading | null> {
    // The directory is measured either way, but its name is shown only when an
    // administrator chose it. The working directory is a path on the server's
    // file system, and the page has no need to tell anyone what it is.
    const configured = process.env.SYSTEM_DISK_PATH?.trim();
    try {
      if (typeof fsPromises.statfs !== 'function') return null;
      const stats = await fsPromises.statfs(configured || process.cwd());

      const blockSize = toNumber(stats.bsize);
      const blocks = toNumber(stats.blocks);
      const freeBlocks = toNumber(stats.bfree);
      const availableBlocks = toNumber(stats.bavail);
      if (
        blockSize === null ||
        blocks === null ||
        freeBlocks === null ||
        availableBlocks === null ||
        blockSize <= 0 ||
        blocks <= 0
      ) {
        return null;
      }

      // The same sum df uses: space in use against space in use plus space
      // available to this user, so blocks reserved for root do not read as free.
      const used = Math.max(0, blocks - freeBlocks);
      const usable = used + availableBlocks;
      if (usable <= 0) return null;

      return {
        path: configured || DEFAULT_DISK_LABEL,
        totalBytes: blocks * blockSize,
        freeBytes: availableBlocks * blockSize,
        usedPct: round1((used / usable) * 100),
      };
    } catch {
      return null;
    }
  }

  private checkDisk(
    checkedAt: string,
    disk: DiskReading | null,
    limits: Thresholds,
  ): SystemCheck {
    if (!disk) {
      return this.build(checkedAt, 'disk', 'Disk', {
        status: 'unknown',
        message: 'Disk usage cannot be read on this host.',
        unit: 'percent',
        threshold: {
          warning: limits.storageWarnPct,
          critical: limits.storageCriticalPct,
        },
      });
    }

    return this.build(checkedAt, 'disk', 'Disk', {
      ...this.judgeStorage(
        disk.usedPct,
        limits,
        `The disk holding the API is ${disk.usedPct}% used`,
      ),
      value: disk.usedPct,
      unit: 'percent',
      threshold: {
        warning: limits.storageWarnPct,
        critical: limits.storageCriticalPct,
      },
    });
  }

  private checkMemory(checkedAt: string, limits: Thresholds): SystemCheck {
    const threshold = { warning: limits.memoryWarnPct, critical: null };
    const total = hostBytes(os.totalmem());
    const free = hostBytes(os.freemem());
    const rss = hostBytes(process.memoryUsage.rss());

    if (total <= 0) {
      return this.build(checkedAt, 'memory', 'Memory', {
        status: 'unknown',
        message: 'Host memory cannot be read.',
        unit: 'percent',
        threshold,
      });
    }

    const pct = round1((Math.max(0, total - free) / total) * 100);
    const warn = pct >= limits.memoryWarnPct;
    return this.build(checkedAt, 'memory', 'Memory', {
      status: warn ? 'warning' : 'healthy',
      message: `Host memory is ${pct}% used${warn ? `, above the ${limits.memoryWarnPct}% warning level` : ''}. This API process holds ${megabytes(rss)} MB (RSS).`,
      value: pct,
      unit: 'percent',
      threshold,
    });
  }

  private checkCpu(checkedAt: string, limits: Thresholds): SystemCheck {
    const threshold = { warning: limits.cpuLoadWarn, critical: null };

    // Windows reports a load average of zero whatever the machine is doing.
    // Showing that zero would be a made-up "healthy".
    if (os.platform() === 'win32') {
      return this.build(checkedAt, 'cpu', 'CPU load', {
        status: 'unknown',
        message: 'Load average is not available on Windows.',
        unit: 'load per core',
        threshold,
      });
    }

    const cores = os.cpus().length;
    const load = os.loadavg()[0];
    if (cores < 1 || !Number.isFinite(load)) {
      return this.build(checkedAt, 'cpu', 'CPU load', {
        status: 'unknown',
        message: 'CPU load cannot be read on this host.',
        unit: 'load per core',
        threshold,
      });
    }

    const perCore = round2(load / cores);
    const warn = perCore > limits.cpuLoadWarn;
    return this.build(checkedAt, 'cpu', 'CPU load', {
      status: warn ? 'warning' : 'healthy',
      message: `One-minute load is ${perCore} per core across ${plural(cores, 'core')}${warn ? `, above the ${limits.cpuLoadWarn} warning level` : ''}.`,
      value: perCore,
      unit: 'load per core',
      threshold,
    });
  }

  private checkErrorRate(
    checkedAt: string,
    now: Date,
    limits: Thresholds,
  ): SystemCheck {
    const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
    const errors = monitoringStore.countsSince(since).serverErrors;
    const warn = errors >= limits.errorRateWarn;
    return this.build(checkedAt, 'error_rate', 'Server errors', {
      status: warn ? 'warning' : 'healthy',
      message: `${errors === 0 ? 'No' : errors} server ${errors === 1 ? 'error' : 'errors'} in the last ${WINDOW_MINUTES} minutes${warn ? `, at or above the warning level of ${limits.errorRateWarn}` : ''}. Counted by this process since it started.`,
      value: errors,
      unit: 'errors',
      threshold: { warning: limits.errorRateWarn, critical: null },
    });
  }

  /**
   * Judged on the last run that actually deleted something and finished.
   *
   * An entry counts only if its outcome is completed or partial and it was not
   * a dry run. Without that, a run that failed on the night, or one that only
   * counted what it would have deleted, would reset the clock and the page
   * would call retention healthy while no data was being removed.
   */
  private async checkRetention(
    checkedAt: string,
    now: Date,
    limits: Thresholds,
    budget: QueryBudget,
  ): Promise<SystemCheck> {
    const threshold = { warning: limits.retentionAlertDays, critical: null };
    const make = (
      status: CheckStatus,
      message: string,
      value: number | null = null,
    ) =>
      this.build(checkedAt, 'retention', 'Data retention', {
        status,
        message,
        value,
        unit: 'days',
        threshold,
      });

    const rows = await budget.run(() =>
      prisma.audit_entries.findMany({
        where: { action: 'retention.purge' },
        orderBy: { occurred_at: 'desc' },
        take: RETENTION_ENTRIES,
        select: { occurred_at: true, detail: true },
      }),
    );
    if (rows === null) {
      return make(
        'unknown',
        budget.timedOut
          ? SKIPPED_AFTER_TIMEOUT
          : 'The retention history could not be read.',
      );
    }

    const entries = rows.flatMap((row) => {
      const entry = readRetentionEntry(row);
      return entry ? [entry] : [];
    });
    if (entries.length === 0) {
      return make('unknown', 'No retention run recorded yet.');
    }

    const daysSince = (at: Date) =>
      round1(Math.max(0, now.getTime() - at.getTime()) / MS_PER_DAY);

    const real = entries.filter((entry) => !entry.dryRun);
    if (real.length === 0) {
      return make(
        'unknown',
        `Only dry runs are recorded (the last was ${daysSince(entries[0].at)} days ago), and a dry run deletes nothing. No real run has been recorded.`,
      );
    }

    const latest = real[0];
    const lastCompleted = real.find((entry) =>
      COUNTED_OUTCOMES.has(entry.outcome ?? ''),
    );
    const completedDays = lastCompleted ? daysSince(lastCompleted.at) : null;

    if (latest.outcome === 'failed') {
      return make(
        'warning',
        `The last run failed on ${isoDate(latest.at)}. ${
          completedDays === null
            ? 'No completed run is on record.'
            : `The last completed run was ${completedDays} days ago.`
        }`,
        completedDays,
      );
    }

    if (completedDays === null) {
      const inWindow =
        rows.length >= RETENTION_ENTRIES
          ? ` among the latest ${RETENTION_ENTRIES} entries`
          : '';
      return make(
        'unknown',
        `No completed retention run is recorded${inWindow}. The latest entry was ${latest.outcome ?? 'without an outcome'} on ${isoDate(latest.at)}.`,
      );
    }

    return completedDays > limits.retentionAlertDays
      ? make(
          'warning',
          `The last completed run was ${completedDays} days ago, longer than the ${limits.retentionAlertDays} day limit.`,
          completedDays,
        )
      : make(
          'healthy',
          `The last completed run was ${completedDays} days ago.`,
          completedDays,
        );
  }

  private async readTables(budget: QueryBudget): Promise<TableReading> {
    const rows = await budget.run(
      () => prisma.$queryRaw<TableRow[]>`
        SELECT c.relname AS table_name,
               GREATEST(c.reltuples, 0)::bigint AS row_estimate,
               pg_total_relation_size(c.oid)::bigint AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY bytes DESC`,
    );
    if (!Array.isArray(rows)) return NO_TABLES;

    const tables = rows.flatMap((row) => {
      const bytes = toNumber(row.bytes);
      const estimate = toNumber(row.row_estimate);
      return bytes === null ||
        estimate === null ||
        typeof row.table_name !== 'string'
        ? []
        : [
            {
              table: row.table_name,
              rows: Math.max(0, Math.round(estimate)),
              bytes: Math.max(0, bytes),
            },
          ];
    });

    return {
      largestTables: tables.slice(0, LARGEST_TABLES),
      photosBytes: tables.find((t) => t.table === 'images')?.bytes ?? null,
    };
  }

  /**
   * Six counts from one statement: one round trip, one scan of each table, and
   * windows measured on the database's own clock in UTC, which is how Prisma
   * stores a DateTime in these timestamp columns. A failure takes all six, and
   * they all come back null.
   */
  private async readUsage(budget: QueryBudget): Promise<Usage> {
    const rows = await budget.run(
      () => prisma.$queryRaw<UsageRow[]>`
        WITH bounds AS (
          SELECT (NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours' AS day,
                 (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days' AS week
        )
        SELECT u.active_24h, u.active_7d, u.new_accounts_7d,
               m.match_requests_7d, g.messages_7d, i.photos_stored
        FROM bounds b
        CROSS JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE lastloginat >= b.day AND deletedat IS NULL) AS active_24h,
                 COUNT(*) FILTER (WHERE lastloginat >= b.week AND deletedat IS NULL) AS active_7d,
                 COUNT(*) FILTER (WHERE createdat >= b.week) AS new_accounts_7d
          FROM public.users) u
        CROSS JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE requested_at >= b.week) AS match_requests_7d
          FROM public.match_requests) m
        CROSS JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE sent_at >= b.week) AS messages_7d
          FROM public.messages) g
        CROSS JOIN LATERAL (
          SELECT COUNT(*) AS photos_stored FROM public.images) i`,
    );

    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return NO_USAGE;

    return {
      activeUsers24h: toNumber(row.active_24h),
      activeUsers7d: toNumber(row.active_7d),
      newAccounts7d: toNumber(row.new_accounts_7d),
      matchRequests7d: toNumber(row.match_requests_7d),
      messages7d: toNumber(row.messages_7d),
      photosStored: toNumber(row.photos_stored),
    };
  }
}

interface RetentionEntry {
  at: Date;
  outcome: string | null;
  dryRun: boolean;
}

/**
 * Reads what the retention job recorded. The detail column is free-form JSON,
 * so nothing in it is trusted to be there: a missing outcome is null, and only
 * a literal true makes an entry a dry run.
 */
function readRetentionEntry(row: {
  occurred_at: Date;
  detail: unknown;
}): RetentionEntry | null {
  if (!(row.occurred_at instanceof Date)) return null;
  const detail =
    row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail)
      ? (row.detail as Record<string, unknown>)
      : {};
  return {
    at: row.occurred_at,
    outcome: typeof detail.outcome === 'string' ? detail.outcome : null,
    dryRun: detail.dryRun === true,
  };
}

const isoDate = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * The worst thing found. Unknown does not count against the system, since "we
 * could not measure it" is not "it is unwell", but a system where nothing at
 * all could be measured is reported as unknown rather than healthy.
 */
export function overallOf(checks: SystemCheck[]): CheckStatus {
  if (checks.some((c) => c.status === 'unavailable')) return 'unavailable';
  if (checks.some((c) => c.status === 'warning')) return 'warning';
  if (checks.some((c) => c.status === 'healthy')) return 'healthy';
  return 'unknown';
}
