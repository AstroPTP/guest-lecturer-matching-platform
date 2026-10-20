import { Injectable } from '@nestjs/common';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import { withTimeout } from '../common/with-timeout';
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
 * Runs one measurement and turns any failure, including a timeout, into null.
 * The error is dropped on purpose: a driver message can name the database host.
 */
async function measure<T>(work: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await withTimeout(work(), QUERY_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** The count of a Prisma query, or null when it did not answer sensibly. */
async function measureCount(
  work: () => PromiseLike<number>,
): Promise<number | null> {
  return toNumber(await measure(work));
}

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

    // First and alone, so its timing is not inflated by the queries below and
    // so that an unreachable database is discovered once rather than by every
    // one of them waiting out its own timeout.
    const database = await this.checkDatabase(checkedAt, limits);
    const reachable = database.status !== 'unavailable';

    const [databaseBytes, tables, retention, usage, disk] = await Promise.all([
      reachable ? this.readDatabaseBytes() : Promise.resolve(null),
      reachable ? this.readTables() : Promise.resolve(NO_TABLES),
      reachable
        ? this.checkRetention(checkedAt, now, limits)
        : Promise.resolve(
            this.build(checkedAt, 'retention', 'Data retention', {
              status: 'unknown',
              message: 'Not checked because the database could not be reached.',
              unit: 'days',
              threshold: { warning: limits.retentionAlertDays, critical: null },
            }),
          ),
      reachable ? this.readUsage(now) : Promise.resolve(NO_USAGE),
      this.readDisk(),
    ]);

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
  ): Promise<SystemCheck> {
    const threshold = { warning: limits.dbLatencyWarnMs, critical: null };
    const started = Date.now();

    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, QUERY_TIMEOUT_MS);
    } catch {
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

  private async readDatabaseBytes(): Promise<number | null> {
    const rows = await measure(
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
    limits: Thresholds,
  ): SystemCheck {
    if (bytes === null) {
      return this.build(checkedAt, 'database_size', 'Database size', {
        status: 'unknown',
        message: reachable
          ? 'The database size could not be read. The database user may lack permission to ask.'
          : 'Not checked because the database could not be reached.',
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
    const path = process.env.SYSTEM_DISK_PATH?.trim() || process.cwd();
    try {
      if (typeof fsPromises.statfs !== 'function') return null;
      const stats = await fsPromises.statfs(path);

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
        path,
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

  private async checkRetention(
    checkedAt: string,
    now: Date,
    limits: Thresholds,
  ): Promise<SystemCheck> {
    const threshold = { warning: limits.retentionAlertDays, critical: null };
    let row: { occurred_at: Date } | null;
    try {
      row = await withTimeout(
        prisma.audit_entries.findFirst({
          where: { action: 'retention.purge' },
          orderBy: { occurred_at: 'desc' },
          select: { occurred_at: true },
        }),
        QUERY_TIMEOUT_MS,
      );
    } catch {
      return this.build(checkedAt, 'retention', 'Data retention', {
        status: 'unknown',
        message: 'The retention history could not be read.',
        unit: 'days',
        threshold,
      });
    }

    if (!row?.occurred_at) {
      return this.build(checkedAt, 'retention', 'Data retention', {
        status: 'unknown',
        message: 'No retention run recorded yet.',
        unit: 'days',
        threshold,
      });
    }

    const days = round1(
      Math.max(0, now.getTime() - row.occurred_at.getTime()) / MS_PER_DAY,
    );
    const stale = days > limits.retentionAlertDays;
    return this.build(checkedAt, 'retention', 'Data retention', {
      status: stale ? 'warning' : 'healthy',
      message: stale
        ? `The last retention run was ${days} days ago, longer than the ${limits.retentionAlertDays} day limit.`
        : `The last retention run was ${days} days ago.`,
      value: days,
      unit: 'days',
      threshold,
    });
  }

  private async readTables(): Promise<TableReading> {
    const rows = await measure(
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

  private async readUsage(now: Date): Promise<Usage> {
    const day = new Date(now.getTime() - MS_PER_DAY);
    const week = new Date(now.getTime() - 7 * MS_PER_DAY);

    const [
      activeUsers24h,
      activeUsers7d,
      newAccounts7d,
      matchRequests7d,
      messages7d,
      photosStored,
    ] = await Promise.all([
      measureCount(() =>
        prisma.users.count({
          where: { lastloginat: { gte: day }, deletedat: null },
        }),
      ),
      measureCount(() =>
        prisma.users.count({
          where: { lastloginat: { gte: week }, deletedat: null },
        }),
      ),
      measureCount(() =>
        prisma.users.count({ where: { createdat: { gte: week } } }),
      ),
      measureCount(() =>
        prisma.match_requests.count({ where: { requested_at: { gte: week } } }),
      ),
      measureCount(() =>
        prisma.messages.count({ where: { sent_at: { gte: week } } }),
      ),
      measureCount(() => prisma.images.count()),
    ]);

    return {
      activeUsers24h,
      activeUsers7d,
      newAccounts7d,
      matchRequests7d,
      messages7d,
      photosStored,
    };
  }
}

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
