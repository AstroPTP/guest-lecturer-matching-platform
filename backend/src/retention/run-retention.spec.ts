import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { prisma } from '../prisma';
import { RetentionModule } from './retention.module';
import { RetentionService, type RetentionRun } from './retention.service';
import { runRetentionOnce } from './run-retention';

// The real loader reads backend/.env into the test process.
jest.mock('../config/load-env', () => ({ loadEnvFile: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

const run = (outcome: RetentionRun['outcome']): RetentionRun => ({
  dryRun: false,
  retentionDays: 365,
  cutoff: new Date('2025-10-20T12:00:00.000Z'),
  wouldDelete: 0,
  deleted: 0,
  skippedNullSentAt: 0,
  batches: 0,
  durationMs: 0,
  outcome,
  auditWritten: true,
});

/** An application context that hands back a service whose run is canned. */
function context(result: RetentionRun | null | Error) {
  const service = new RetentionService();
  const runIfEnabled = jest
    .spyOn(service, 'runIfEnabled')
    .mockImplementation(() =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result),
    );
  const close = jest.fn().mockResolvedValue(undefined);
  const create = jest
    .spyOn(NestFactory, 'createApplicationContext')
    .mockResolvedValue({ get: () => service, close } as never);
  const disconnect = jest.spyOn(prisma, '$disconnect');
  return { runIfEnabled, close, create, disconnect };
}

describe('runRetentionOnce', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('starts an application context with only the retention module', async () => {
    const ctx = context(run('completed'));

    await runRetentionOnce();

    expect(ctx.create).toHaveBeenCalledWith(RetentionModule);
    expect(ctx.runIfEnabled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['completed', 0],
    // Another instance doing the work is the lock doing its job, not a fault.
    ['skipped', 0],
    // Some rows went before another instance took over; still no fault.
    ['partial', 0],
    ['failed', 1],
  ] as const)('exits %s with code %i', async (outcome, code) => {
    context(run(outcome));

    await expect(runRetentionOnce()).resolves.toBe(code);
  });

  it('exits 2 when the purge went through but its audit row was not written', async () => {
    context({ ...run('completed'), auditWritten: false });

    await expect(runRetentionOnce()).resolves.toBe(2);
  });

  it('exits 2 for a partial run whose audit row was lost too', async () => {
    context({ ...run('partial'), auditWritten: false });

    await expect(runRetentionOnce()).resolves.toBe(2);
  });

  it('exits 1, not 2, when the purge failed and so did its audit row', async () => {
    context({ ...run('failed'), auditWritten: false });

    await expect(runRetentionOnce()).resolves.toBe(1);
  });

  it('exits 0 without a run when the job is switched off', async () => {
    const ctx = context(null);

    await expect(runRetentionOnce()).resolves.toBe(0);
    expect(ctx.runIfEnabled).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero when the run throws, and still closes everything', async () => {
    const ctx = context(new Error('boom'));

    await expect(runRetentionOnce()).resolves.toBe(1);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(ctx.disconnect).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero when the context cannot start, logging the error class only', async () => {
    jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockRejectedValue(new Error('postgresql://user:secret@host/db'));
    const error = jest.spyOn(Logger.prototype, 'error');
    const disconnect = jest.spyOn(prisma, '$disconnect');

    await expect(runRetentionOnce()).resolves.toBe(1);
    expect(error.mock.calls.flat().join(' ')).not.toContain('secret');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('closes the context and the database connection after a normal run', async () => {
    const ctx = context(run('completed'));

    await runRetentionOnce();

    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(ctx.disconnect).toHaveBeenCalledTimes(1);
  });
});
