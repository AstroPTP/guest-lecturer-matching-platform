// cspell:ignore timestamptz
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
  // Whatever a test is about, the lock and the delete belong inside the
  // transaction. Run on the root client they would not be in it, and the lock
  // would be released the moment its own statement finished.
  if (current) {
    expect(current.rootExecuteRaw).not.toHaveBeenCalled();
    expect(
      current.queryRaw.mock.calls
        .map(sqlOf)
        .some((sql) => sql.text.includes('pg_try_advisory')),
    ).toBe(false);
    current = undefined;
  }
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

/** The database most recently faked, so afterEach can check where SQL ran. */
let current: ReturnType<typeof fakeDatabase> | undefined;

/**
 * Stands in for the database. Answers the lock, the two counts and each delete
 * batch from what the test asked for, telling them apart by their SQL.
 *
 * The lock and the delete are answered by `tx`, a client separate from
 * `prisma`, which is all `$transaction` hands its callback. The root client
 * answers only the counts. A statement run on the wrong one therefore goes
 * unanswered and is caught by the check in afterEach.
 */
function fakeDatabase(
  options: {
    locked?: boolean;
    /** One answer per lock attempt, then `locked` for any after that. */
    lockResults?: boolean[];
    expired?: number;
    /** What the count of support messages past the cut-off answers. */
    supportExpired?: number;
    unsent?: number;
    batches?: number[];
    /**
     * One entry per support batch: the attachment_id of each support message
     * that batch deleted, null for a message with no file.
     */
    supportBatches?: (bigint | null)[][];
    /**
     * For each support batch, the thread of each message it deleted, in the
     * same order. Every message is in thread 7 unless this says otherwise.
     */
    supportThreads?: bigint[][];
  } = {},
) {
  const remaining = [...(options.batches ?? [])];
  const remainingSupport = [...(options.supportBatches ?? [])];
  const remainingThreads = [...(options.supportThreads ?? [])];
  const lockResults = [...(options.lockResults ?? [])];
  const lock = jest.fn((..._args: unknown[]) =>
    Promise.resolve([
      { acquired: lockResults.shift() ?? options.locked ?? true },
    ]),
  );
  const supportDelete = jest.fn((..._args: unknown[]) => {
    const threads = remainingThreads.shift() ?? [];
    return Promise.resolve(
      (remainingSupport.shift() ?? []).map((id, index) => ({
        attachment_id: id,
        thread_id: threads[index] ?? 7n,
      })),
    );
  });
  const messagesDelete = jest.fn((..._args: unknown[]) =>
    Promise.resolve(remaining.shift() ?? 0),
  );
  const attachmentDelete = jest.fn((..._args: unknown[]) => Promise.resolve(0));
  const threadDelete = jest.fn((..._args: unknown[]) => Promise.resolve(0));
  const textOf = (strings: TemplateStringsArray) => strings.join('?');
  const tx = {
    // The lock and the support delete both come through $queryRaw; they are
    // told apart by their SQL, and each answers to its own mock.
    $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
      textOf(strings).includes('support_messages')
        ? supportDelete(strings, ...values)
        : lock(strings, ...values),
    ),
    $executeRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) =>
        textOf(strings).includes('support_attachments')
          ? attachmentDelete(strings, ...values)
          : textOf(strings).includes('support_threads')
            ? threadDelete(strings, ...values)
            : messagesDelete(strings, ...values),
    ),
  };
  const queryRaw = jest.spyOn(prisma, '$queryRaw').mockImplementation(((
    strings: TemplateStringsArray,
  ) => {
    const text = strings.join('?');
    if (text.includes('support_messages')) {
      return Promise.resolve([{ count: options.supportExpired ?? 0 }]);
    }
    if (text.includes('IS NULL')) {
      return Promise.resolve([{ count: options.unsent ?? 0 }]);
    }
    return Promise.resolve([{ count: options.expired ?? 0 }]);
  }) as never);
  const rootExecuteRaw = jest
    .spyOn(prisma, '$executeRaw')
    .mockImplementation((() => Promise.resolve(0)) as never);
  const transaction = jest
    .spyOn(prisma, '$transaction')
    .mockImplementation(((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx)) as never);
  const audit = jest
    .spyOn(prisma.audit_entries, 'create')
    .mockResolvedValue({} as never);
  const db = {
    queryRaw,
    /** The match messages delete, as run on the transaction client. */
    executeRaw: messagesDelete,
    /** The support messages delete, as run on the transaction client. */
    supportDelete,
    /** The delete of files no support message refers to any more. */
    attachmentDelete,
    /** The delete of support threads left with no messages. */
    threadDelete,
    /** The lock, as run on the transaction client. */
    lockQuery: lock,
    rootExecuteRaw,
    transaction,
    audit,
  };
  current = db;
  return db;
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

  it('limits each batch to 5000 rows by default', async () => {
    const db = fakeDatabase({ batches: [0] });

    await service.purge();

    expect(sqlOf(db.executeRaw.mock.calls[0]).values[1]).toBe(5000);
  });

  it('limits each batch to RETENTION_BATCH_SIZE when it is set', async () => {
    process.env.RETENTION_BATCH_SIZE = '200';
    const db = fakeDatabase({ batches: [0] });

    await service.purge();

    expect(sqlOf(db.executeRaw.mock.calls[0]).values[1]).toBe(200);
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

describe('RetentionService support messages', () => {
  const service = new RetentionService();

  it('deletes support messages past the cut-off in the same transaction as the lock', async () => {
    const db = fakeDatabase({ batches: [0], supportBatches: [[null, null]] });

    const run = await service.purge();

    expect(run).toMatchObject({
      outcome: 'completed',
      deleted: 0,
      supportDeleted: 2,
      batches: 1,
    });
    const { text, values } = sqlOf(db.supportDelete.mock.calls[0]);
    expect(text).toMatch(
      /^DELETE FROM support_messages WHERE message_id IN \(/,
    );
    expect(text).toContain('sent_at < ?::timestamptz');
    expect(text).toContain('LIMIT ?');
    expect(text).toContain('RETURNING attachment_id');
    expect(values).toEqual([daysAgo(365), 5000]);
    // One lock and one transaction cover the batch, support messages included.
    expect(db.lockQuery).toHaveBeenCalledTimes(2);
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('follows RETENTION_DAYS_MESSAGE_LOG and RETENTION_BATCH_SIZE like the match messages', async () => {
    process.env.RETENTION_DAYS_MESSAGE_LOG = '90';
    process.env.RETENTION_BATCH_SIZE = '200';
    const db = fakeDatabase({ supportBatches: [[null], []] });

    await service.purge();

    expect(sqlOf(db.supportDelete.mock.calls[0]).values).toEqual([
      daysAgo(90),
      200,
    ]);
  });

  it('keeps going while either kind of message is still being removed', async () => {
    const db = fakeDatabase({
      batches: [10, 0, 0],
      supportBatches: [[null], [null, null], []],
    });

    const run = await service.purge();

    expect(run).toMatchObject({
      outcome: 'completed',
      deleted: 10,
      supportDeleted: 3,
      batches: 2,
    });
    expect(db.transaction).toHaveBeenCalledTimes(3);
  });

  it('stops after one empty batch when there is nothing of either kind to delete', async () => {
    const db = fakeDatabase({ batches: [], supportBatches: [] });

    const run = await service.purge();

    expect(run).toMatchObject({ deleted: 0, supportDeleted: 0, batches: 0 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('deletes the files the removed messages pointed at, in the same transaction', async () => {
    const db = fakeDatabase({ supportBatches: [[11n, null, 12n], []] });

    await service.purge();

    expect(db.attachmentDelete).toHaveBeenCalledTimes(1);
    const { text, values } = sqlOf(db.attachmentDelete.mock.calls[0]);
    expect(text).toMatch(/^DELETE FROM support_attachments a WHERE/);
    expect(values).toEqual([[11n, 12n]]);
    // Only files nothing else refers to.
    expect(text).toContain('NOT EXISTS');
    expect(text).toContain('m.attachment_id = a.attachment_id');
    expect(db.rootExecuteRaw).not.toHaveBeenCalled();
  });

  it('deletes the threads the removed messages leave empty, in the same transaction', async () => {
    const db = fakeDatabase({
      supportBatches: [[null, null, null], []],
      supportThreads: [[7n, 7n, 8n]],
    });

    await service.purge();

    expect(db.threadDelete).toHaveBeenCalledTimes(1);
    const { text, values } = sqlOf(db.threadDelete.mock.calls[0]);
    expect(text).toMatch(/^DELETE FROM support_threads t WHERE/);
    // Each thread once, however many of its messages went.
    expect(values).toEqual([[7n, 8n]]);
    // Only a thread with no message left; one still holding newer messages stays.
    expect(text).toContain('NOT EXISTS');
    expect(text).toContain('m.thread_id = t.thread_id');
    expect(db.rootExecuteRaw).not.toHaveBeenCalled();
  });

  it('deletes the empty threads after the messages and the files', async () => {
    const db = fakeDatabase({ supportBatches: [[11n], []] });

    await service.purge();

    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
    expect(order(db.supportDelete)).toBeLessThan(order(db.attachmentDelete));
    expect(order(db.attachmentDelete)).toBeLessThan(order(db.threadDelete));
  });

  it('does not look for empty threads when no support message was removed', async () => {
    const db = fakeDatabase({ batches: [4, 0], supportBatches: [] });

    await service.purge();

    expect(db.threadDelete).not.toHaveBeenCalled();
  });

  it('does not touch the attachments table when no removed message had a file', async () => {
    const db = fakeDatabase({ supportBatches: [[null, null], []] });

    await service.purge();

    expect(db.attachmentDelete).not.toHaveBeenCalled();
  });

  it('deletes nothing at all when another instance holds the lock', async () => {
    const db = fakeDatabase({ locked: false, supportBatches: [[1n, 2n]] });

    const run = await service.purge();

    expect(run).toMatchObject({ outcome: 'skipped', supportDeleted: 0 });
    expect(db.supportDelete).not.toHaveBeenCalled();
    expect(db.attachmentDelete).not.toHaveBeenCalled();
  });

  it('counts support messages in a partial run when the lock is lost afterwards', async () => {
    fakeDatabase({
      lockResults: [true, false],
      batches: [3],
      supportBatches: [[null, null]],
    });
    const log = jest.spyOn(Logger.prototype, 'log');

    const run = await service.purge();

    expect(run).toMatchObject({
      outcome: 'partial',
      deleted: 3,
      supportDeleted: 2,
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('another instance took over after 5 rows'),
    );
  });

  it('reports a partial run on support messages alone', async () => {
    fakeDatabase({
      lockResults: [true, false],
      supportBatches: [[null]],
    });

    await expect(service.purge()).resolves.toMatchObject({
      outcome: 'partial',
      deleted: 0,
      supportDeleted: 1,
    });
  });

  it('records how many support messages were deleted in the audit row, as a count only', async () => {
    const db = fakeDatabase({ supportBatches: [[5n, 6n], []] });

    await service.purge();

    const { detail } = auditedRow(db.audit);
    expect(detail.supportDeleted).toBe(2);
    expect(detail).not.toHaveProperty('supportWouldDelete');
    expect(JSON.stringify(detail)).not.toMatch(/attachment|filename|subject/i);
  });

  describe('in a dry run', () => {
    beforeEach(() => {
      process.env.RETENTION_DRY_RUN = 'true';
    });

    it('counts the support messages that would be deleted and deletes none', async () => {
      const db = fakeDatabase({
        expired: 4,
        supportExpired: 9,
        supportBatches: [[1n]],
      });

      const run = await service.purge();

      expect(run).toMatchObject({
        dryRun: true,
        wouldDelete: 4,
        supportWouldDelete: 9,
        deleted: 0,
        supportDeleted: 0,
      });
      expect(db.supportDelete).not.toHaveBeenCalled();
      expect(db.attachmentDelete).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('counts with the same predicate the delete uses', async () => {
      const db = fakeDatabase({ supportExpired: 1 });

      await service.purge();

      const count = db.queryRaw.mock.calls
        .map(sqlOf)
        .find((sql) => sql.text.includes('FROM support_messages'));
      expect(count?.text).toContain('sent_at < ?::timestamptz');
      expect(count?.values).toEqual([daysAgo(365)]);
    });

    it('puts the support count in the audit row', async () => {
      const db = fakeDatabase({ supportExpired: 9 });

      await service.purge();

      expect(auditedRow(db.audit).detail).toMatchObject({
        dryRun: true,
        supportDeleted: 0,
        supportWouldDelete: 9,
      });
    });
  });
});

describe('RetentionService locking', () => {
  const service = new RetentionService();

  it('takes a transaction-level advisory lock inside the batch transaction', async () => {
    const db = fakeDatabase({ batches: [0] });

    await service.purge();

    // On the transaction client, which is what $transaction hands the callback.
    expect(db.lockQuery).toHaveBeenCalledTimes(1);
    const lock = sqlOf(db.lockQuery.mock.calls[0]);
    expect(lock.text).toContain('pg_try_advisory_xact_lock(?::bigint)');
    expect(lock.values).toEqual([RETENTION_LOCK_KEY]);
    // A session-level lock would be unreliable behind a transaction pooler.
    expect(lock.text).not.toContain('pg_try_advisory_lock');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // And never on the root client, where the lock would not be in the
    // transaction (afterEach also checks this for every test).
    expect(
      db.queryRaw.mock.calls
        .map(sqlOf)
        .some((sql) => sql.text.includes('pg_try_advisory')),
    ).toBe(false);
  });

  it('runs the delete on the same transaction client as the lock', async () => {
    const db = fakeDatabase({ batches: [7, 0] });

    await service.purge();

    expect(db.executeRaw).toHaveBeenCalledTimes(2);
    expect(db.lockQuery).toHaveBeenCalledTimes(2);
    expect(db.rootExecuteRaw).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('ends the run as skipped, deleting nothing, when another instance holds the lock', async () => {
    const db = fakeDatabase({ locked: false, batches: [5000] });

    const run = await service.purge();

    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(run).toMatchObject({ outcome: 'skipped', deleted: 0, batches: 0 });
    expect(auditedRow(db.audit).detail.outcome).toBe('skipped');
  });

  it('ends the run as partial, keeping the count, when the lock is lost after some batches', async () => {
    const db = fakeDatabase({
      lockResults: [true, true, false],
      batches: [5000, 120, 5000],
    });

    const run = await service.purge();

    expect(run).toMatchObject({
      outcome: 'partial',
      deleted: 5120,
      batches: 2,
    });
    // The third batch never ran: the lock was refused before its delete.
    expect(db.executeRaw).toHaveBeenCalledTimes(2);
    expect(auditedRow(db.audit).detail).toMatchObject({
      outcome: 'partial',
      deleted: 5120,
      batches: 2,
    });
  });

  it('is skipped, not partial, when the lock is refused before anything is deleted', async () => {
    const db = fakeDatabase({ lockResults: [false], batches: [5000] });

    const run = await service.purge();

    expect(run).toMatchObject({ outcome: 'skipped', deleted: 0, batches: 0 });
    expect(db.executeRaw).not.toHaveBeenCalled();
  });

  it('says that another instance took over when it stops part-way', async () => {
    fakeDatabase({ lockResults: [true, false], batches: [30] });
    const log = jest.spyOn(Logger.prototype, 'log');

    await service.purge();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('another instance took over after 30 rows'),
    );
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

  it('reports that the audit row was written', async () => {
    fakeDatabase({ batches: [0] });

    await expect(service.purge()).resolves.toMatchObject({
      auditWritten: true,
    });
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
        'supportDeleted',
      ].sort(),
    );
    expect(detail).toMatchObject({
      dryRun: false,
      retentionDays: 365,
      cutoff: daysAgo(365).toISOString(),
      deleted: 5010,
      supportDeleted: 0,
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
        auditWritten: false,
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
    fakeDatabase({ expired: 31, supportExpired: 8, unsent: 4 });

    await expect(service.preview()).resolves.toEqual({
      dryRun: true,
      retentionDays: 120,
      cutoff: daysAgo(120).toISOString(),
      wouldDelete: 31,
      supportWouldDelete: 8,
      skippedNullSentAt: 4,
    });
  });

  it('never deletes, locks or audits, even with RETENTION_DRY_RUN off', async () => {
    const db = fakeDatabase({ expired: 31, batches: [5000] });

    await service.preview();

    expect(db.executeRaw).not.toHaveBeenCalled();
    expect(db.supportDelete).not.toHaveBeenCalled();
    expect(db.attachmentDelete).not.toHaveBeenCalled();
    expect(db.lockQuery).not.toHaveBeenCalled();
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
