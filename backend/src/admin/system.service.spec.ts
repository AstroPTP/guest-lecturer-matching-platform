import fs from 'node:fs';
import os from 'node:os';
import { monitoringStore } from '../monitoring/monitoring.store';
import { prisma } from '../prisma';
import { restoreRealTimers } from '../testing/timers';
import { overallOf, SystemService } from './system.service';
import type { CheckStatus, SystemCheck, SystemSnapshot } from './system.types';

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const DAY = 86_400_000;

const ENV_KEYS = [
  'DB_LATENCY_WARN_MS',
  'DB_SIZE_LIMIT_MB',
  'STORAGE_WARN_PCT',
  'STORAGE_CRITICAL_PCT',
  'SYSTEM_DISK_PATH',
  'MEMORY_WARN_PCT',
  'CPU_LOAD_WARN',
  'ERROR_RATE_WARN',
  'RETENTION_ALERT_DAYS',
  'AUTH_FAILURE_WARN',
  'ADMIN_FORBIDDEN_WARN',
];

/** What a driver might put in an error: the sort of thing that must not leak. */
const DRIVER_ERROR =
  'connect ECONNREFUSED 10.0.0.5:5432 password authentication failed for user "svc_glma"';

const fail = () => Promise.reject(new Error(DRIVER_ERROR));

/** Per-test control of what each raw query answers. */
interface Sql {
  select1: () => Promise<unknown>;
  size: () => Promise<unknown>;
  tables: () => Promise<unknown>;
}

let sql: Sql;
let savedEnv: Record<string, string | undefined>;
const service = new SystemService();

function statfsOf(usedPct: number) {
  const blocks = 1_000_000;
  const used = Math.round((blocks * usedPct) / 100);
  return {
    type: 0,
    bsize: 4096,
    blocks,
    bfree: blocks - used,
    bavail: blocks - used,
    files: 0,
    ffree: 0,
  };
}

beforeEach(() => {
  monitoringStore.reset();
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  sql = {
    select1: () => Promise.resolve([{ '?column?': 1 }]),
    size: () => Promise.resolve([{ bytes: BigInt(200 * MB) }]),
    tables: () => Promise.resolve([]),
  };
  jest.spyOn(prisma, '$queryRaw').mockImplementation(((
    strings: TemplateStringsArray,
  ) => {
    const text = strings.join(' ');
    if (text.includes('pg_database_size')) return sql.size();
    if (text.includes('pg_class')) return sql.tables();
    return sql.select1();
  }) as never);

  // A calm Linux host, whatever machine the tests actually run on.
  jest.spyOn(os, 'platform').mockReturnValue('linux');
  jest.spyOn(os, 'totalmem').mockReturnValue(16 * GB);
  jest.spyOn(os, 'freemem').mockReturnValue(8 * GB);
  jest.spyOn(os, 'loadavg').mockReturnValue([0.5, 0.5, 0.5]);
  jest
    .spyOn(os, 'cpus')
    .mockReturnValue(Array.from({ length: 4 }, () => ({})) as never);
  jest.spyOn(process.memoryUsage, 'rss').mockReturnValue(150 * MB);
  jest.spyOn(process, 'uptime').mockReturnValue(3725.9);
  jest.spyOn(fs.promises, 'statfs').mockResolvedValue(statfsOf(40));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  restoreRealTimers();
  jest.restoreAllMocks();
});

const checkOf = (snapshot: SystemSnapshot, key: SystemCheck['key']) => {
  const found = snapshot.checks.find((c) => c.key === key);
  if (!found) throw new Error(`no ${key} check`);
  return found;
};

/** Runs a snapshot on fake timers, letting `ms` of "waiting" pass. */
async function snapshotAfter(ms: number): Promise<SystemSnapshot> {
  jest.useFakeTimers();
  const pending = service.snapshot();
  await jest.advanceTimersByTimeAsync(ms);
  return pending;
}

function expectNoBadNumbers(value: unknown, path = 'snapshot'): void {
  if (typeof value === 'number') {
    expect({ path, finite: Number.isFinite(value) }).toEqual({
      path,
      finite: true,
    });
  } else if (typeof value === 'bigint') {
    throw new Error(`${path} is a bigint, which JSON cannot carry`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => expectNoBadNumbers(item, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      expectNoBadNumbers(item, `${path}.${key}`);
    }
  }
}

const retentionRow = (daysAgo: number) =>
  ({ occurred_at: new Date(Date.now() - daysAgo * DAY) }) as never;

describe('SystemService.snapshot', () => {
  it('reports a healthy system with every check present, in order', async () => {
    jest
      .spyOn(prisma.audit_entries, 'findFirst')
      .mockResolvedValue(retentionRow(2));

    const snap = await service.snapshot();

    expect(snap.checks.map((c) => c.key)).toEqual([
      'api',
      'database',
      'database_size',
      'disk',
      'memory',
      'cpu',
      'error_rate',
      'retention',
    ]);
    expect(snap.checks.map((c) => c.status)).toEqual(Array(8).fill('healthy'));
    expect(snap.overall).toBe('healthy');
    expect(snap.alerts).toEqual([]);
    for (const check of snap.checks) {
      expect(check.checkedAt).toBe(snap.checkedAt);
      expect(check.label).not.toBe('');
      expect(check.message).not.toBe('');
    }
    expect(() => new Date(snap.checkedAt).toISOString()).not.toThrow();
  });

  it('reports uptime from the process', async () => {
    const snap = await service.snapshot();

    expect(snap.uptimeSeconds).toBe(3725);
    expect(checkOf(snap, 'api')).toMatchObject({
      status: 'healthy',
      value: 3725,
      unit: 'seconds',
      threshold: null,
    });
  });

  describe('database', () => {
    it('is unavailable when the query is rejected, and says nothing of why', async () => {
      sql.select1 = fail;

      const snap = await service.snapshot();

      const database = checkOf(snap, 'database');
      expect(database.status).toBe('unavailable');
      expect(database.value).toBeNull();
      expect(database.message).not.toMatch(
        /ECONNREFUSED|5432|svc_glma|password/,
      );
      expect(snap.overall).toBe('unavailable');
      expect(snap.alerts).toContainEqual({
        key: 'database',
        status: 'unavailable',
        message: database.message,
      });
    });

    it('does not ask the database anything else once it has failed to answer', async () => {
      sql.select1 = fail;
      const count = jest.spyOn(prisma.users, 'count');
      const query = jest.spyOn(prisma, '$queryRaw');

      const snap = await service.snapshot();

      expect(query).toHaveBeenCalledTimes(1);
      expect(count).not.toHaveBeenCalled();
      expect(checkOf(snap, 'database_size').status).toBe('unknown');
      expect(checkOf(snap, 'retention').status).toBe('unknown');
      expect(snap.usage).toEqual({
        activeUsers24h: null,
        activeUsers7d: null,
        newAccounts7d: null,
        matchRequests7d: null,
        messages7d: null,
        photosStored: null,
      });
      expect(snap.storage).toMatchObject({
        databaseBytes: null,
        photosBytes: null,
        largestTables: [],
      });
    });

    it('is unavailable when the query does not answer within two seconds', async () => {
      sql.select1 = () => new Promise(() => undefined);

      const snap = await snapshotAfter(2000);

      expect(checkOf(snap, 'database')).toMatchObject({
        status: 'unavailable',
        value: null,
      });
    });

    it.each([
      [499, 'healthy'],
      [500, 'warning'],
      [1500, 'warning'],
    ])('measures a %i ms answer as %s', async (delay, expected) => {
      sql.select1 = () =>
        new Promise((resolve) => setTimeout(() => resolve([{}]), delay));

      const snap = await snapshotAfter(delay);

      expect(checkOf(snap, 'database')).toMatchObject({
        status: expected,
        value: delay,
        unit: 'ms',
        threshold: { warning: 500, critical: null },
      });
    });

    it('takes the latency limit from DB_LATENCY_WARN_MS', async () => {
      process.env.DB_LATENCY_WARN_MS = '100';
      sql.select1 = () =>
        new Promise((resolve) => setTimeout(() => resolve([{}]), 150));

      const snap = await snapshotAfter(150);

      expect(checkOf(snap, 'database')).toMatchObject({
        status: 'warning',
        threshold: { warning: 100, critical: null },
      });
    });

    it.each(['abc', '-5', '0', '', 'NaN', 'Infinity'])(
      'falls back to 500 ms for DB_LATENCY_WARN_MS=%j',
      async (bad) => {
        process.env.DB_LATENCY_WARN_MS = bad;
        sql.select1 = () =>
          new Promise((resolve) => setTimeout(() => resolve([{}]), 400));

        const snap = await snapshotAfter(400);

        expect(checkOf(snap, 'database')).toMatchObject({
          status: 'healthy',
          threshold: { warning: 500, critical: null },
        });
      },
    );
  });

  describe('database size', () => {
    it('reports bytes, and says no limit is set, when DB_SIZE_LIMIT_MB is unset', async () => {
      const snap = await service.snapshot();

      expect(checkOf(snap, 'database_size')).toMatchObject({
        status: 'healthy',
        value: 200 * MB,
        unit: 'bytes',
        threshold: null,
      });
      expect(checkOf(snap, 'database_size').message).toMatch(/no size limit/i);
      expect(snap.storage.databaseBytes).toBe(200 * MB);
      expect(snap.storage.databaseLimitBytes).toBeNull();
    });

    it('reports percent of the limit when one is set', async () => {
      process.env.DB_SIZE_LIMIT_MB = '1000';
      sql.size = () => Promise.resolve([{ bytes: BigInt(500 * MB) }]);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'database_size')).toMatchObject({
        status: 'healthy',
        value: 50,
        unit: 'percent',
        threshold: { warning: 80, critical: 90 },
      });
      expect(snap.storage.databaseLimitBytes).toBe(1000 * MB);
    });

    it.each([
      [790, 'healthy', false],
      [800, 'warning', false],
      [899, 'warning', false],
      [900, 'warning', true],
      [980, 'warning', true],
    ])(
      'at %i of a 1000 MB limit is %s (critical wording: %s)',
      async (usedMb, status, critical) => {
        process.env.DB_SIZE_LIMIT_MB = '1000';
        sql.size = () => Promise.resolve([{ bytes: BigInt(usedMb * MB) }]);

        const snap = await service.snapshot();

        const check = checkOf(snap, 'database_size');
        expect(check.status).toBe(status);
        expect(/critical/i.test(check.message)).toBe(critical);
      },
    );

    it('takes its levels from STORAGE_WARN_PCT and STORAGE_CRITICAL_PCT', async () => {
      process.env.DB_SIZE_LIMIT_MB = '100';
      process.env.STORAGE_WARN_PCT = '50';
      process.env.STORAGE_CRITICAL_PCT = '60';

      sql.size = () => Promise.resolve([{ bytes: BigInt(55 * MB) }]);
      const warn = checkOf(await service.snapshot(), 'database_size');
      sql.size = () => Promise.resolve([{ bytes: BigInt(65 * MB) }]);
      const critical = checkOf(await service.snapshot(), 'database_size');

      expect(warn.status).toBe('warning');
      expect(warn.message).not.toMatch(/critical/i);
      expect(critical.status).toBe('warning');
      expect(critical.message).toMatch(/critical/i);
      expect(critical.threshold).toEqual({ warning: 50, critical: 60 });
    });

    it.each(['abc', '-1', '0', ''])(
      'treats DB_SIZE_LIMIT_MB=%j as no limit',
      async (bad) => {
        process.env.DB_SIZE_LIMIT_MB = bad;

        const snap = await service.snapshot();

        expect(snap.storage.databaseLimitBytes).toBeNull();
        expect(checkOf(snap, 'database_size').unit).toBe('bytes');
      },
    );

    it.each([
      ['a string', '12345', 12345],
      ['a number', 12345, 12345],
    ])(
      'reads the size when the driver returns %s',
      async (_label, raw, bytes) => {
        sql.size = () => Promise.resolve([{ bytes: raw }]);

        const snap = await service.snapshot();

        expect(snap.storage.databaseBytes).toBe(bytes);
      },
    );

    it('is unknown when the size cannot be read, with no driver text', async () => {
      process.env.DB_SIZE_LIMIT_MB = '1000';
      sql.size = fail;

      const snap = await service.snapshot();

      const check = checkOf(snap, 'database_size');
      expect(check).toMatchObject({ status: 'unknown', value: null });
      expect(check.message).toMatch(/could not be read/i);
      expect(check.message).not.toMatch(/ECONNREFUSED|5432|svc_glma/);
      expect(snap.storage.databaseBytes).toBeNull();
      // Unmeasured is not unwell: it must not raise an alert.
      expect(snap.alerts.map((a) => a.key)).not.toContain('database_size');
    });

    it('is unknown when the answer is not a number', async () => {
      sql.size = () => Promise.resolve([{ bytes: 'lots' }]);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'database_size').status).toBe('unknown');
      expect(snap.storage.databaseBytes).toBeNull();
    });
  });

  describe('disk', () => {
    it('reports percent used, measured on the working directory by default', async () => {
      const statfs = jest.spyOn(fs.promises, 'statfs');

      const snap = await service.snapshot();

      expect(statfs).toHaveBeenCalledWith(process.cwd());
      expect(checkOf(snap, 'disk')).toMatchObject({
        status: 'healthy',
        value: 40,
        unit: 'percent',
        threshold: { warning: 80, critical: 90 },
      });
      expect(snap.storage.disk).toEqual({
        path: process.cwd(),
        totalBytes: 1_000_000 * 4096,
        freeBytes: 600_000 * 4096,
      });
    });

    it('measures SYSTEM_DISK_PATH when it is set', async () => {
      process.env.SYSTEM_DISK_PATH = '/var/lib/data';
      const statfs = jest.spyOn(fs.promises, 'statfs');

      const snap = await service.snapshot();

      expect(statfs).toHaveBeenCalledWith('/var/lib/data');
      expect(snap.storage.disk?.path).toBe('/var/lib/data');
    });

    it('counts blocks reserved for root as used, the way df does', async () => {
      jest.spyOn(fs.promises, 'statfs').mockResolvedValue({
        type: 0,
        bsize: 4096,
        blocks: 1000,
        bfree: 300,
        bavail: 100,
        files: 0,
        ffree: 0,
      });

      const snap = await service.snapshot();

      // used 700 against used + available 800 = 87.5%.
      expect(checkOf(snap, 'disk').value).toBe(87.5);
      expect(snap.storage.disk?.freeBytes).toBe(100 * 4096);
    });

    it.each([
      [79, 'healthy', false],
      [85, 'warning', false],
      [95, 'warning', true],
    ])(
      'at %i%% used is %s (critical wording: %s)',
      async (pct, status, critical) => {
        jest.spyOn(fs.promises, 'statfs').mockResolvedValue(statfsOf(pct));

        const snap = await service.snapshot();

        const check = checkOf(snap, 'disk');
        expect(check.status).toBe(status);
        expect(/critical/i.test(check.message)).toBe(critical);
      },
    );

    it('is unknown when statfs throws', async () => {
      jest.spyOn(fs.promises, 'statfs').mockRejectedValue(new Error('ENOSYS'));

      const snap = await service.snapshot();

      expect(checkOf(snap, 'disk')).toMatchObject({
        status: 'unknown',
        value: null,
      });
      expect(snap.storage.disk).toBeNull();
      expect(snap.alerts.map((a) => a.key)).not.toContain('disk');
    });

    it('is unknown when statfs does not exist on this Node', async () => {
      // Older Node has no fs.promises.statfs. Swap the beforeEach mock out for
      // undefined, and put it back so restoreAllMocks sees what it expects.
      const mocked = fs.promises.statfs;
      Object.assign(fs.promises, { statfs: undefined });
      try {
        const snap = await service.snapshot();

        expect(checkOf(snap, 'disk').status).toBe('unknown');
        expect(snap.storage.disk).toBeNull();
      } finally {
        Object.assign(fs.promises, { statfs: mocked });
      }
    });

    it.each([
      ['no blocks', { bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }],
      ['a NaN block size', { bsize: NaN, blocks: 10, bfree: 5, bavail: 5 }],
      ['a missing field', { bsize: 4096, blocks: 10, bfree: 5 }],
    ])('is unknown when statfs reports %s', async (_label, stats) => {
      jest.spyOn(fs.promises, 'statfs').mockResolvedValue(stats as never);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'disk')).toMatchObject({
        status: 'unknown',
        value: null,
      });
      expect(snap.storage.disk).toBeNull();
    });
  });

  describe('memory', () => {
    it('reports host percent used and mentions the process RSS', async () => {
      const snap = await service.snapshot();

      const check = checkOf(snap, 'memory');
      expect(check).toMatchObject({
        status: 'healthy',
        value: 50,
        unit: 'percent',
        threshold: { warning: 85, critical: null },
      });
      expect(check.message).toMatch(/RSS/);
      expect(check.message).toContain('150');
      expect(snap.storage.memory).toEqual({
        totalBytes: 16 * GB,
        freeBytes: 8 * GB,
        processRssBytes: 150 * MB,
      });
    });

    it.each([
      [84, 'healthy'],
      [85, 'warning'],
      [97, 'warning'],
    ])('at %i%% used is %s', async (pct, status) => {
      jest.spyOn(os, 'totalmem').mockReturnValue(100);
      jest.spyOn(os, 'freemem').mockReturnValue(100 - pct);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'memory')).toMatchObject({ status, value: pct });
    });

    it('takes its level from MEMORY_WARN_PCT', async () => {
      process.env.MEMORY_WARN_PCT = '95';
      jest.spyOn(os, 'freemem').mockReturnValue(2 * GB);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'memory')).toMatchObject({
        status: 'healthy',
        threshold: { warning: 95, critical: null },
      });
    });

    it.each([
      ['zero', 0],
      ['NaN', NaN],
    ])(
      'is unknown, not NaN, when total memory reads %s',
      async (_label, total) => {
        jest.spyOn(os, 'totalmem').mockReturnValue(total);

        const snap = await service.snapshot();

        expect(checkOf(snap, 'memory')).toMatchObject({
          status: 'unknown',
          value: null,
        });
        expect(snap.storage.memory.totalBytes).toBe(0);
        expectNoBadNumbers(snap);
      },
    );
  });

  describe('cpu', () => {
    it('is unknown on Windows, where the load average is always zero', async () => {
      jest.spyOn(os, 'platform').mockReturnValue('win32');
      jest.spyOn(os, 'loadavg').mockReturnValue([0, 0, 0]);

      const snap = await service.snapshot();

      const cpu = checkOf(snap, 'cpu');
      expect(cpu).toMatchObject({ status: 'unknown', value: null });
      expect(cpu.message).toMatch(/Windows/);
    });

    it('divides the one-minute load by the core count', async () => {
      jest.spyOn(os, 'loadavg').mockReturnValue([2, 1, 1]);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'cpu')).toMatchObject({
        status: 'healthy',
        value: 0.5,
        threshold: { warning: 1.5, critical: null },
      });
    });

    it.each([
      [6, 'healthy'],
      [6.4, 'warning'],
      [8, 'warning'],
    ])(
      'a load of %d over 4 cores is %s (warns only above 1.5 per core)',
      async (load, status) => {
        jest.spyOn(os, 'loadavg').mockReturnValue([load, 0, 0]);

        const snap = await service.snapshot();

        expect(checkOf(snap, 'cpu').status).toBe(status);
      },
    );

    it('takes its level from CPU_LOAD_WARN', async () => {
      process.env.CPU_LOAD_WARN = '3';
      jest.spyOn(os, 'loadavg').mockReturnValue([8, 0, 0]);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'cpu')).toMatchObject({
        status: 'healthy',
        value: 2,
        threshold: { warning: 3, critical: null },
      });
    });

    it('is unknown, not Infinity, when the core count is unavailable', async () => {
      jest.spyOn(os, 'cpus').mockReturnValue([]);
      jest.spyOn(os, 'loadavg').mockReturnValue([3, 0, 0]);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'cpu')).toMatchObject({
        status: 'unknown',
        value: null,
      });
      expectNoBadNumbers(snap);
    });

    it('is unknown when the load average is not a number', async () => {
      jest.spyOn(os, 'loadavg').mockReturnValue([NaN, 0, 0]);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'cpu').status).toBe('unknown');
    });
  });

  describe('error rate', () => {
    const serverErrors = (count: number, at = new Date()) => {
      for (let i = 0; i < count; i += 1) {
        monitoringStore.record({ status: 500, method: 'GET', path: '/x', at });
      }
    };

    it('is healthy with no errors', async () => {
      const snap = await service.snapshot();

      expect(checkOf(snap, 'error_rate')).toMatchObject({
        status: 'healthy',
        value: 0,
        threshold: { warning: 5, critical: null },
      });
    });

    it.each([
      [4, 'healthy'],
      [5, 'warning'],
      [30, 'warning'],
    ])('%i server errors in 15 minutes is %s', async (count, status) => {
      serverErrors(count);

      const snap = await service.snapshot();

      const check = checkOf(snap, 'error_rate');
      expect(check).toMatchObject({ status, value: count });
      expect(snap.alerts.some((a) => a.key === 'error_rate')).toBe(
        status === 'warning',
      );
    });

    it('does not count errors older than fifteen minutes', async () => {
      serverErrors(10, new Date(Date.now() - 20 * 60_000));

      const snap = await service.snapshot();

      expect(checkOf(snap, 'error_rate')).toMatchObject({
        status: 'healthy',
        value: 0,
      });
    });

    it('counts only server errors, not refusals', async () => {
      for (let i = 0; i < 50; i += 1) {
        monitoringStore.record({ status: 401, method: 'GET', path: '/x' });
        monitoringStore.record({ status: 429, method: 'GET', path: '/x' });
      }

      const snap = await service.snapshot();

      expect(checkOf(snap, 'error_rate').value).toBe(0);
    });

    it('takes its level from ERROR_RATE_WARN', async () => {
      process.env.ERROR_RATE_WARN = '2';
      serverErrors(2);

      const snap = await service.snapshot();

      expect(checkOf(snap, 'error_rate')).toMatchObject({
        status: 'warning',
        threshold: { warning: 2, critical: null },
      });
    });
  });

  describe('retention', () => {
    it('is unknown when no run has been recorded', async () => {
      const snap = await service.snapshot();

      expect(checkOf(snap, 'retention')).toMatchObject({
        status: 'unknown',
        value: null,
        message: 'No retention run recorded yet.',
      });
    });

    it('looks for the most recent retention.purge entry', async () => {
      const find = jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockResolvedValue(retentionRow(1));

      await service.snapshot();

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: 'retention.purge' },
          orderBy: { occurred_at: 'desc' },
        }),
      );
    });

    it.each([
      [0.5, 'healthy'],
      [3, 'healthy'],
      [7.9, 'healthy'],
      [9, 'warning'],
      [30, 'warning'],
    ])('a run %d days ago is %s', async (daysAgo, status) => {
      jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockResolvedValue(retentionRow(daysAgo));

      const snap = await service.snapshot();

      expect(checkOf(snap, 'retention')).toMatchObject({
        status,
        value: daysAgo,
        unit: 'days',
        threshold: { warning: 8, critical: null },
      });
      expect(snap.alerts.some((a) => a.key === 'retention')).toBe(
        status === 'warning',
      );
    });

    it('takes its limit from RETENTION_ALERT_DAYS', async () => {
      process.env.RETENTION_ALERT_DAYS = '14';
      jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockResolvedValue(retentionRow(9));

      const snap = await service.snapshot();

      expect(checkOf(snap, 'retention')).toMatchObject({
        status: 'healthy',
        threshold: { warning: 14, critical: null },
      });
    });

    it('is unknown, with no driver text, when the history cannot be read', async () => {
      jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockRejectedValue(new Error(DRIVER_ERROR));

      const snap = await service.snapshot();

      const check = checkOf(snap, 'retention');
      expect(check.status).toBe('unknown');
      expect(check.message).not.toMatch(/ECONNREFUSED|5432|svc_glma/);
    });
  });

  describe('largest tables and photos', () => {
    const table = (name: string, bytes: unknown, rows: unknown = 10) => ({
      table_name: name,
      row_estimate: rows,
      bytes,
    });

    it('keeps the eight largest and finds the images table wherever it ranks', async () => {
      sql.tables = () =>
        Promise.resolve([
          ...Array.from({ length: 9 }, (_, i) =>
            table(`t${i + 1}`, BigInt((100 - i) * MB), BigInt(i)),
          ),
          table('images', BigInt(5 * MB), BigInt(3)),
        ]);

      const snap = await service.snapshot();

      expect(snap.storage.largestTables).toHaveLength(8);
      expect(snap.storage.largestTables[0]).toEqual({
        table: 't1',
        rows: 0,
        bytes: 100 * MB,
      });
      expect(snap.storage.largestTables.map((t) => t.table)).not.toContain(
        'images',
      );
      expect(snap.storage.photosBytes).toBe(5 * MB);
    });

    it('clamps a negative row estimate, which Postgres uses for "never analysed"', async () => {
      sql.tables = () => Promise.resolve([table('users', BigInt(8 * MB), -1)]);

      const snap = await service.snapshot();

      expect(snap.storage.largestTables).toEqual([
        { table: 'users', rows: 0, bytes: 8 * MB },
      ]);
    });

    it('rounds a fractional row estimate and accepts strings', async () => {
      sql.tables = () => Promise.resolve([table('messages', '2048', '41.6')]);

      const snap = await service.snapshot();

      expect(snap.storage.largestTables).toEqual([
        { table: 'messages', rows: 42, bytes: 2048 },
      ]);
    });

    it('leaves photosBytes null when there is no images table', async () => {
      sql.tables = () => Promise.resolve([table('users', BigInt(MB))]);

      const snap = await service.snapshot();

      expect(snap.storage.photosBytes).toBeNull();
    });

    it('drops a row it cannot read rather than inventing a size', async () => {
      sql.tables = () =>
        Promise.resolve([table('broken', 'huge'), table('users', BigInt(MB))]);

      const snap = await service.snapshot();

      expect(snap.storage.largestTables.map((t) => t.table)).toEqual(['users']);
    });

    it('answers empty and null when the query fails', async () => {
      sql.tables = fail;

      const snap = await service.snapshot();

      expect(snap.storage.largestTables).toEqual([]);
      expect(snap.storage.photosBytes).toBeNull();
      // The rest of the snapshot is unaffected.
      expect(checkOf(snap, 'database').status).toBe('healthy');
    });
  });

  describe('usage', () => {
    it('counts activity from the tables that record it', async () => {
      jest
        .spyOn(prisma.users, 'count')
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(11)
        .mockResolvedValueOnce(5);
      jest.spyOn(prisma.match_requests, 'count').mockResolvedValue(7);
      jest.spyOn(prisma.messages, 'count').mockResolvedValue(40);
      jest.spyOn(prisma.images, 'count').mockResolvedValue(12);

      const snap = await service.snapshot();

      expect(snap.usage).toEqual({
        activeUsers24h: 3,
        activeUsers7d: 11,
        newAccounts7d: 5,
        matchRequests7d: 7,
        messages7d: 40,
        photosStored: 12,
      });
    });

    it('asks for the right windows', async () => {
      const users = jest.spyOn(prisma.users, 'count');
      const requests = jest.spyOn(prisma.match_requests, 'count');
      const messages = jest.spyOn(prisma.messages, 'count');
      const before = Date.now();

      await service.snapshot();

      const since = (call: unknown[], field: string) => {
        const where = (call[0] as { where: Record<string, { gte: Date }> })
          .where;
        return before - where[field].gte.getTime();
      };
      const near = (elapsed: number, expected: number) =>
        Math.abs(elapsed - expected) < 5000;

      expect(near(since(users.mock.calls[0], 'lastloginat'), DAY)).toBe(true);
      expect(near(since(users.mock.calls[1], 'lastloginat'), 7 * DAY)).toBe(
        true,
      );
      expect(near(since(users.mock.calls[2], 'createdat'), 7 * DAY)).toBe(true);
      expect(near(since(requests.mock.calls[0], 'requested_at'), 7 * DAY)).toBe(
        true,
      );
      expect(near(since(messages.mock.calls[0], 'sent_at'), 7 * DAY)).toBe(
        true,
      );
    });

    it('does not count deactivated accounts as active', async () => {
      const users = jest.spyOn(prisma.users, 'count');

      await service.snapshot();

      expect(users.mock.calls[0][0]).toMatchObject({
        where: { deletedat: null },
      });
      expect(users.mock.calls[1][0]).toMatchObject({
        where: { deletedat: null },
      });
    });

    it('nulls only the figure that failed', async () => {
      jest.spyOn(prisma.users, 'count').mockResolvedValue(2);
      jest.spyOn(prisma.match_requests, 'count').mockResolvedValue(4);
      jest
        .spyOn(prisma.messages, 'count')
        .mockRejectedValue(new Error(DRIVER_ERROR));
      jest.spyOn(prisma.images, 'count').mockResolvedValue(6);

      const snap = await service.snapshot();

      expect(snap.usage).toEqual({
        activeUsers24h: 2,
        activeUsers7d: 2,
        newAccounts7d: 2,
        matchRequests7d: 4,
        messages7d: null,
        photosStored: 6,
      });
    });

    it('nulls a count that is not a number', async () => {
      jest.spyOn(prisma.images, 'count').mockResolvedValue(NaN);

      const snap = await service.snapshot();

      expect(snap.usage.photosStored).toBeNull();
    });
  });

  describe('overall and alerts', () => {
    it('derives alerts from the checks in warning or unavailable, in order', async () => {
      jest.spyOn(os, 'freemem').mockReturnValue(1 * GB);
      jest.spyOn(os, 'platform').mockReturnValue('win32');
      for (let i = 0; i < 5; i += 1) {
        monitoringStore.record({ status: 500, method: 'GET', path: '/x' });
      }

      const snap = await service.snapshot();

      expect(snap.overall).toBe('warning');
      expect(snap.alerts.map((a) => [a.key, a.status])).toEqual([
        ['memory', 'warning'],
        ['error_rate', 'warning'],
      ]);
      expect(snap.alerts[0].message).toBe(checkOf(snap, 'memory').message);
      // cpu is unknown on win32, retention is unknown with no history, and
      // neither is an alert.
      expect(snap.alerts.map((a) => a.key)).not.toContain('cpu');
      expect(snap.alerts.map((a) => a.key)).not.toContain('retention');
    });

    it('is unavailable when the database is, even beside warnings', async () => {
      sql.select1 = fail;
      jest.spyOn(os, 'freemem').mockReturnValue(1 * GB);

      const snap = await service.snapshot();

      expect(snap.overall).toBe('unavailable');
      expect(snap.alerts.map((a) => a.key)).toEqual(['database', 'memory']);
    });

    it('is healthy when the only non-healthy checks are unknown', async () => {
      jest.spyOn(os, 'platform').mockReturnValue('win32');
      jest.spyOn(fs.promises, 'statfs').mockRejectedValue(new Error('ENOSYS'));

      const snap = await service.snapshot();

      expect(
        snap.checks.filter((c) => c.status === 'unknown'),
      ).not.toHaveLength(0);
      expect(snap.overall).toBe('healthy');
      expect(snap.alerts).toEqual([]);
    });
  });

  describe('never invents a number', () => {
    it('has no NaN, Infinity or bigint in a healthy snapshot', async () => {
      jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockResolvedValue(retentionRow(2));

      const snap = await service.snapshot();

      expectNoBadNumbers(snap);
      expect(() => JSON.stringify(snap)).not.toThrow();
    });

    it('has none when everything that can fail has failed', async () => {
      sql.size = fail;
      sql.tables = fail;
      jest.spyOn(os, 'totalmem').mockReturnValue(NaN);
      jest.spyOn(os, 'freemem').mockReturnValue(NaN);
      jest.spyOn(os, 'cpus').mockReturnValue([]);
      jest.spyOn(os, 'loadavg').mockReturnValue([NaN, NaN, NaN]);
      jest.spyOn(process.memoryUsage, 'rss').mockReturnValue(NaN);
      jest.spyOn(fs.promises, 'statfs').mockRejectedValue(new Error('ENOSYS'));
      jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockRejectedValue(new Error(DRIVER_ERROR));
      for (const model of [
        prisma.users,
        prisma.match_requests,
        prisma.messages,
        prisma.images,
      ]) {
        jest.spyOn(model, 'count').mockRejectedValue(new Error(DRIVER_ERROR));
      }

      const snap = await service.snapshot();

      expectNoBadNumbers(snap);
      expect(JSON.stringify(snap)).not.toMatch(
        /ECONNREFUSED|5432|svc_glma|password/,
      );
      expect(
        snap.checks
          .filter((c) =>
            ['database_size', 'disk', 'memory', 'cpu', 'retention'].includes(
              c.key,
            ),
          )
          .map((c) => c.status),
      ).toEqual(Array(5).fill('unknown'));
    });

    it('has none when the database is unreachable', async () => {
      sql.select1 = fail;

      const snap = await service.snapshot();

      expectNoBadNumbers(snap);
      expect(JSON.stringify(snap)).not.toMatch(/ECONNREFUSED|5432|svc_glma/);
    });
  });
});

describe('overallOf', () => {
  const of = (...statuses: CheckStatus[]) =>
    overallOf(statuses.map((status) => ({ status }) as SystemCheck));

  it('is unavailable if any check is', () => {
    expect(of('healthy', 'warning', 'unavailable', 'unknown')).toBe(
      'unavailable',
    );
  });

  it('is warning if any check is and none is unavailable', () => {
    expect(of('healthy', 'unknown', 'warning')).toBe('warning');
  });

  it('ignores unknown beside a healthy check', () => {
    expect(of('unknown', 'healthy', 'unknown')).toBe('healthy');
  });

  it('is unknown only when every check is unknown, or there are none', () => {
    expect(of('unknown', 'unknown')).toBe('unknown');
    expect(of()).toBe('unknown');
  });
});

describe('SystemService.security', () => {
  const record = (status: number, path: string, count = 1, at?: Date) => {
    for (let i = 0; i < count; i += 1) {
      monitoringStore.record({ status, method: 'GET', path, at });
    }
  };

  it('answers with zeros and an empty list before anything has happened', () => {
    const signals = service.security();

    expect(signals).toEqual({
      startedAt: monitoringStore.startedAt.toISOString(),
      windowMinutes: 15,
      counts: {
        authFailures: 0,
        adminForbidden: 0,
        rateLimited: 0,
        serverErrors: 0,
      },
      countsSinceStart: {
        authFailures: 0,
        adminForbidden: 0,
        rateLimited: 0,
        serverErrors: 0,
      },
      alerts: [],
      recent: [],
      authProviderNote:
        'Failed sign-ins happen in Auth0 and are not visible to the API. Review them in the Auth0 dashboard under Monitoring, Logs.',
    });
  });

  it.each([
    [19, 0],
    [20, 1],
    [100, 1],
  ])('%i authentication failures raise %i alert(s)', (count, alerts) => {
    record(401, '/users/me', count);

    const signals = service.security();

    expect(signals.counts.authFailures).toBe(count);
    expect(signals.alerts).toHaveLength(alerts);
    if (alerts) {
      expect(signals.alerts[0]).toMatchObject({
        key: 'auth_failures',
        status: 'warning',
      });
      expect(signals.alerts[0].message).toContain(String(count));
    }
  });

  it.each([
    [2, 0],
    [3, 1],
    [10, 1],
  ])('%i refused admin requests raise %i alert(s)', (count, alerts) => {
    record(403, '/admin/users', count);

    const signals = service.security();

    expect(signals.counts.adminForbidden).toBe(count);
    expect(signals.alerts.map((a) => a.key)).toEqual(
      alerts ? ['admin_forbidden'] : [],
    );
  });

  it('does not count a 403 outside /admin as a security event', () => {
    record(403, '/users/me', 50);

    const signals = service.security();

    expect(signals.counts.adminForbidden).toBe(0);
    expect(signals.alerts).toEqual([]);
    expect(signals.recent).toEqual([]);
  });

  it('counts rate limiting and server errors but raises no alert for them', () => {
    record(429, '/auth/login', 100);
    record(500, '/users', 100);

    const signals = service.security();

    expect(signals.counts).toMatchObject({
      rateLimited: 100,
      serverErrors: 100,
    });
    expect(signals.alerts).toEqual([]);
  });

  it('can raise both alerts at once', () => {
    record(401, '/x', 20);
    record(403, '/admin/x', 3);

    expect(service.security().alerts.map((a) => a.key)).toEqual([
      'auth_failures',
      'admin_forbidden',
    ]);
  });

  it('takes its levels from AUTH_FAILURE_WARN and ADMIN_FORBIDDEN_WARN', () => {
    process.env.AUTH_FAILURE_WARN = '2';
    process.env.ADMIN_FORBIDDEN_WARN = '1';
    record(401, '/x', 2);
    record(403, '/admin/x', 1);

    expect(service.security().alerts.map((a) => a.key)).toEqual([
      'auth_failures',
      'admin_forbidden',
    ]);
  });

  it.each(['abc', '0', '-3', ''])(
    'falls back to the defaults for AUTH_FAILURE_WARN=%j',
    (bad) => {
      process.env.AUTH_FAILURE_WARN = bad;
      record(401, '/x', 19);

      expect(service.security().alerts).toEqual([]);

      record(401, '/x', 1);

      expect(service.security().alerts).toHaveLength(1);
    },
  );

  it('windows the counts to fifteen minutes but keeps the totals since start', () => {
    record(401, '/x', 30, new Date(Date.now() - 20 * 60_000));
    record(401, '/x', 2);

    const signals = service.security();

    expect(signals.counts.authFailures).toBe(2);
    expect(signals.countsSinceStart.authFailures).toBe(32);
    expect(signals.alerts).toEqual([]);
  });

  it('lists the 20 most recent events, newest first, in the agreed shape', () => {
    for (let i = 1; i <= 25; i += 1) {
      monitoringStore.record({
        status: 401,
        method: 'get',
        path: `/p${i}?token=secret`,
      });
    }

    const { recent } = service.security();

    expect(recent).toHaveLength(20);
    expect(recent[0].path).toBe('/p25');
    expect(recent[19].path).toBe('/p6');
    expect(Object.keys(recent[0]).sort()).toEqual([
      'at',
      'category',
      'method',
      'path',
      'status',
      'userId',
    ]);
    expect(recent[0]).toMatchObject({
      category: 'auth_failure',
      method: 'GET',
      status: 401,
      userId: null,
    });
    expect(typeof recent[0].at).toBe('string');
    expect(JSON.stringify(recent)).not.toContain('secret');
  });
});
