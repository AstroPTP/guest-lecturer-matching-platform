import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { RETENTION_LOCK_KEY, RetentionService } from './retention.service';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const ENV_NAMES = [
  'RETENTION_ENABLED',
  'RETENTION_IN_PROCESS_SCHEDULE',
  'RETENTION_DRY_RUN',
  'RETENTION_DAYS_MESSAGE_LOG',
  'RETENTION_BATCH_SIZE',
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  // The service logs on every run; keep the test output quiet.
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

/** The SQL a tagged-template call carried, with its parameters. */
function sqlOf(call: unknown[]) {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return { text: strings.join('?').replace(/\s+/g, ' ').trim(), values };
}

/**
 * Stands in for the database. Answers the lock, the two counts and each delete
 * batch from what the test asked for, telling them apart by their SQL.
 */
function fakeDatabase(
  options: {
    locked?: boolean;
    expired?: number;
    unsent?: number;
    batches?: number[];
  } = {},
) {
  const remaining = [...(options.batches ?? [])];
  const queryRaw = jest.spyOn(prisma, '$queryRaw').mockImplementation(((
    strings: TemplateStringsArray,
  ) => {
    const text = strings.join('?');
    if (text.includes('pg_try_advisory_xact_lock')) {
      return Promise.resolve([{ acquired: options.locked ?? true }]);
    }
    if (text.includes('IS NULL')) {
      return Promise.resolve([{ count: options.unsent ?? 0 }]);
    }
    return Promise.resolve([{ count: options.expired ?? 0 }]);
  }) as never);
  const executeRaw = jest
    .spyOn(prisma, '$executeRaw')
    .mockImplementation((() =>
      Promise.resolve(remaining.shift() ?? 0)) as never);
  const transaction = jest.spyOn(prisma, '$transaction');
  const audit = jest
    .spyOn(prisma.audit_entries, 'create')
    .mockResolvedValue({} as never);
  return { queryRaw, executeRaw, transaction, audit };
}

/** The `data` of the single audit row a run wrote. */
function auditedRow(audit: jest.SpyInstance) {
  expect(audit).toHaveBeenCalledTimes(1);
  const [{ data }] = audit.mock.calls[0] as [
    { data: Record<string, unknown> & { detail: Record<string, unknown> } },
  ];
  return data;
}

describe('RetentionService cut-off', () => {
  const service = new RetentionService();

  it('is now minus 365 days by default', async () => {
    const db = fakeDatabase();

    const run = await service.purge();

    expect(run.retentionDays).toBe(365);
    expect(run.cutoff).toEqual(daysAgo(365));
    expect(auditedRow(db.audit).detail.cutoff).toBe(daysAgo(365).toISOString());
  });

  it('follows RETENTION_DAYS_MESSAGE_LOG, and the delete uses that same instant', async () => {
    process.env.RETENTION_DAYS_MESSAGE_LOG = '90';
    const db = fakeDatabase({ batches: [1, 0] });

    const run = await service.purge();

    expect(run.cutoff).toEqual(daysAgo(90));
    for (const call of db.executeRaw.mock.calls) {
      expect(sqlOf(call).values[0]).toEqual(daysAgo(90));
    }
  });

  it('clamps a window under 30 days to 30 and warns', async () => {
    process.env.RETENTION_DAYS_MESSAGE_LOG = '3';
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const db = fakeDatabase({ batches: [0] });

    const run = await service.purge();

    expect(run.retentionDays).toBe(30);
    expect(run.cutoff).toEqual(daysAgo(30));
    expect(sqlOf(db.executeRaw.mock.calls[0]).values[0]).toEqual(daysAgo(30));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('minimum'));
    expect(auditedRow(db.audit).detail.retentionDays).toBe(30);
  });
});

describe('RetentionService batching', () => {
  const service = new RetentionService();

  it('keeps deleting until a batch removes nothing, and sums the rows and batches', async () => {
    const db = fakeDatabase({ batches: [5000, 5000, 120, 0, 999] });

    const run = await service.purge();

    expect(run).toMatchObject({
      outcome: 'completed',
      deleted: 10_120,
      batches: 3,
    });
    // The 999 queued after the empty batch is never asked for.
    expect(db.executeRaw).toHaveBeenCalledTimes(4);
    expect(db.transaction).toHaveBeenCalledTimes(4);
  });

  it('is idempotent: a run with nothing to delete does one empty batch and stops', async () => {
    const db = fakeDatabase({ batches: [] });

    const run = await service.purge();

    expect(run).toMatchObject({
      outcome: 'completed',
      deleted: 0,
      batches: 0,
    });
    expect(db.executeRaw).toHaveBeenCalledTimes(1);
  });

  it('limits each batch to RETENTION_BATCH_SIZE, 5000 by default', async () => {
    const first = fakeDatabase({ batches: [0] });
    await service.purge();
    expect(sqlOf(first.executeRaw.mock.calls[0]).values[1]).toBe(5000);

    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    process.env.RETENTION_BATCH_SIZE = '200';
    const second = fakeDatabase({ batches: [0] });
    await service.purge();
    expect(sqlOf(second.executeRaw.mock.calls[0]).values[1]).toBe(200);
  });

  it('deletes by primary key through a sub-select with a LIMIT', async () => {
    const db = fakeDatabase({ batches: [0] });

    await service.purge();

    const { text } = sqlOf(db.executeRaw.mock.calls[0]);
    expect(text).toMatch(/^DELETE FROM messages WHERE message_id IN \(/);
    expect(text).toContain('SELECT message_id FROM messages');
    expect(text).toContain('LIMIT ?');
  });
});

describe('RetentionService unsent messages', () => {
  const service = new RetentionService();

  it('never puts a NULL sent_at in the delete predicate', async () => {
    const db = fakeDatabase({ batches: [3, 0] });

    await service.purge();

    for (const call of db.executeRaw.mock.calls) {
      const { text, values } = sqlOf(call);
      expect(text).toContain('sent_at IS NOT NULL');
      expect(text).toContain('sent_at < ?');
      expect(text).not.toMatch(/\bIS NULL\b/);
      expect(text).not.toMatch(/\bOR\b/);
      expect(values).toEqual([daysAgo(365), 5000]);
    }
  });

  it('counts the same predicate when asked to count what would be deleted', async () => {
    process.env.RETENTION_DRY_RUN = 'true';
    const db = fakeDatabase({ expired: 4 });

    await service.purge();

    const count = db.queryRaw.mock.calls
      .map(sqlOf)
      .find((sql) => sql.text.includes('sent_at <'));
    expect(count?.text).toContain('sent_at IS NOT NULL AND sent_at < ?');
    expect(count?.text).not.toMatch(/\bIS NULL\b/);
  });

  it('reports how many there are, in the run and the audit row', async () => {
    const db = fakeDatabase({ unsent: 17, batches: [0] });

    const run = await service.purge();

    expect(run.skippedNullSentAt).toBe(17);
    expect(auditedRow(db.audit).detail.skippedNullSentAt).toBe(17);
  });
});

describe('RetentionService dry run', () => {
  const service = new RetentionService();

  it('deletes nothing, takes no lock and reports what it would delete', async () => {
    process.env.RETENTION_DRY_RUN = 'true';
    const db = fakeDatabase({ expired: 42, unsent: 7, batches: [5000] });

    const run = await service.purge();

    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      dryRun: true,
      outcome: 'completed',
      wouldDelete: 42,
      deleted: 0,
      batches: 0,
      skippedNullSentAt: 7,
    });
  });

  it('still leaves one audit row, flagged as a dry run', async () => {
    process.env.RETENTION_DRY_RUN = 'true';
    const db = fakeDatabase({ expired: 42 });

    await service.purge();

    expect(auditedRow(db.audit).detail).toMatchObject({
      dryRun: true,
      deleted: 0,
      wouldDelete: 42,
    });
  });

  it('leaves wouldDelete out of the audit row of a real run', async () => {
    const db = fakeDatabase({ batches: [0] });

    await service.purge();

    expect(auditedRow(db.audit).detail).not.toHaveProperty('wouldDelete');
  });
});

describe('RetentionService locking', () => {
  const service = new RetentionService();

  it('takes a transaction-level advisory lock inside the batch transaction', async () => {
    const db = fakeDatabase({ batches: [0] });

    await service.purge();

    const lock = db.queryRaw.mock.calls
      .map(sqlOf)
      .find((sql) => sql.text.includes('pg_try_advisory_xact_lock'));
    expect(lock?.text).toContain('pg_try_advisory_xact_lock(?::bigint)');
    expect(lock?.values).toEqual([RETENTION_LOCK_KEY]);
    // A session-level lock would be unreliable behind a transaction pooler.
    expect(lock?.text).not.toContain('pg_try_advisory_lock');
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('ends the run as skipped, deleting nothing, when another instance holds the lock', async () => {
    const db = fakeDatabase({ locked: false, batches: [5000] });

    const run = await service.purge();

    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(run).toMatchObject({ outcome: 'skipped', deleted: 0, batches: 0 });
    expect(auditedRow(db.audit).detail.outcome).toBe('skipped');
  });

  it('says why it skipped', async () => {
    fakeDatabase({ locked: false });
    const log = jest.spyOn(Logger.prototype, 'log');

    await service.purge();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('another instance is running'),
    );
  });
});

describe('RetentionService audit', () => {
  const service = new RetentionService();

  it('writes exactly one row for a run of many batches', async () => {
    const db = fakeDatabase({ batches: [5000, 5000, 5000, 1, 0] });

    await service.purge();

    expect(db.audit).toHaveBeenCalledTimes(1);
  });

  it('records the system as the actor, against the messages table', async () => {
    const db = fakeDatabase({ batches: [0] });
    const findFirst = jest.spyOn(prisma.users, 'findFirst');

    await service.purge();

    const data = auditedRow(db.audit);
    expect(data).toMatchObject({
      actor_user_id: null,
      action: 'retention.purge',
      target_type: 'messages',
    });
    // No actor means no lookup of one.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('holds only counts and flags, never message content or who wrote it', async () => {
    const db = fakeDatabase({ batches: [5000, 10, 0], unsent: 2 });

    await service.purge();

    const { detail, target_id: targetId } = auditedRow(db.audit);
    expect(Object.keys(detail).sort()).toEqual(
      [
        'batches',
        'cutoff',
        'deleted',
        'dryRun',
        'durationMs',
        'outcome',
        'retentionDays',
        'skippedNullSentAt',
      ].sort(),
    );
    expect(detail).toMatchObject({
      dryRun: false,
      retentionDays: 365,
      cutoff: daysAgo(365).toISOString(),
      deleted: 5010,
      skippedNullSentAt: 2,
      batches: 2,
      outcome: 'completed',
    });
    expect(typeof detail.durationMs).toBe('number');
    expect(targetId).toBeUndefined();
    expect(JSON.stringify(detail)).not.toMatch(
      /content|message_id|match_id|user|sent_by|image/i,
    );
  });

  describe('when the run fails', () => {
    it('still writes the audit row, with outcome failed and what was deleted before', async () => {
      const db = fakeDatabase({ batches: [5000] });
      db.executeRaw
        .mockResolvedValueOnce(5000)
        .mockRejectedValueOnce(new Error('connection lost'));

      const run = await service.purge();

      expect(run).toMatchObject({
        outcome: 'failed',
        deleted: 5000,
        batches: 1,
      });
      expect(auditedRow(db.audit).detail).toMatchObject({
        outcome: 'failed',
        deleted: 5000,
        batches: 1,
      });
    });

    it('does not throw, so the scheduler survives a bad night', async () => {
      fakeDatabase();
      jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('down'));

      await expect(service.purge()).resolves.toMatchObject({
        outcome: 'failed',
      });
    });

    it('warns with the error class only, never its message, which may quote rows', async () => {
      const db = fakeDatabase();
      const error = Object.assign(
        new Error('Key (content)=(hello Ann) is bad'),
        {
          code: 'P2010',
        },
      );
      db.executeRaw.mockRejectedValue(error);
      const warn = jest.spyOn(Logger.prototype, 'warn');

      await service.purge();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Error (P2010)'),
      );
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).not.toContain('hello Ann');
      expect(logged).not.toContain('content');
    });

    it('survives the audit write failing as well', async () => {
      const db = fakeDatabase({ batches: [0] });
      db.audit.mockRejectedValue(new Error('audit down'));
      const warn = jest.spyOn(Logger.prototype, 'warn');

      await expect(service.purge()).resolves.toMatchObject({
        outcome: 'completed',
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('audit entry not written'),
      );
    });
  });
});

describe('RetentionService schedule', () => {
  const service = new RetentionService();

  it('runs Sundays at 02:00 UTC under the name message-retention', () => {
    // Read the handler off the descriptor; the method is never called here.
    const handler = Object.getOwnPropertyDescriptor(
      RetentionService.prototype,
      'scheduledPurge',
    )?.value as object;
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      handler,
    ) as Record<string, unknown>;

    expect(options).toEqual({
      cronTime: '0 2 * * 0',
      name: 'message-retention',
      timeZone: 'UTC',
    });
  });

  it('does a full run by default', async () => {
    const db = fakeDatabase({ batches: [10, 0] });

    await service.scheduledPurge();

    expect(db.executeRaw).toHaveBeenCalledTimes(2);
    expect(db.audit).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when RETENTION_ENABLED is false', async () => {
    process.env.RETENTION_ENABLED = 'false';
    const db = fakeDatabase({ batches: [10, 0] });

    await service.scheduledPurge();

    expect(db.queryRaw).not.toHaveBeenCalled();
    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('does nothing when RETENTION_IN_PROCESS_SCHEDULE is false, leaving it to an external scheduler', async () => {
    process.env.RETENTION_IN_PROCESS_SCHEDULE = 'false';
    const db = fakeDatabase({ batches: [10, 0] });

    await service.scheduledPurge();

    expect(db.queryRaw).not.toHaveBeenCalled();
    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('still lets the one-shot command run when the in-process schedule is off', async () => {
    process.env.RETENTION_IN_PROCESS_SCHEDULE = 'false';
    const db = fakeDatabase({ batches: [10, 0] });

    const run = await service.runIfEnabled();

    expect(run).toMatchObject({ outcome: 'completed', deleted: 10 });
    expect(db.audit).toHaveBeenCalledTimes(1);
  });

  it('runIfEnabled does nothing and returns null when RETENTION_ENABLED is false', async () => {
    process.env.RETENTION_ENABLED = 'false';
    const db = fakeDatabase({ batches: [10, 0] });

    await expect(service.runIfEnabled()).resolves.toBeNull();
    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('honours RETENTION_DRY_RUN on the scheduled run', async () => {
    process.env.RETENTION_DRY_RUN = 'true';
    const db = fakeDatabase({ expired: 9, batches: [10, 0] });

    await service.scheduledPurge();

    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(auditedRow(db.audit).detail).toMatchObject({
      dryRun: true,
      wouldDelete: 9,
    });
  });
});

describe('RetentionService preview', () => {
  const service = new RetentionService();

  it('returns the preview shape using the configured window', async () => {
    process.env.RETENTION_DAYS_MESSAGE_LOG = '120';
    fakeDatabase({ expired: 31, unsent: 4 });

    await expect(service.preview()).resolves.toEqual({
      dryRun: true,
      retentionDays: 120,
      cutoff: daysAgo(120).toISOString(),
      wouldDelete: 31,
      skippedNullSentAt: 4,
    });
  });

  it('never deletes, locks or audits, even with RETENTION_DRY_RUN off', async () => {
    const db = fakeDatabase({ expired: 31, batches: [5000] });

    await service.preview();

    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
    expect(
      db.queryRaw.mock.calls
        .map(sqlOf)
        .some((sql) => sql.text.includes('pg_try_advisory')),
    ).toBe(false);
  });

  it('works even when the job is switched off, since it is only a look', async () => {
    process.env.RETENTION_ENABLED = 'false';
    fakeDatabase({ expired: 1 });

    await expect(service.preview()).resolves.toMatchObject({ wouldDelete: 1 });
  });
});
