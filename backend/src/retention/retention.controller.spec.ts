import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { prisma } from '../prisma';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

// The window comes from the environment, so pin it rather than trust whatever
// the machine running the tests has set.
const ENV_NAME = 'RETENTION_DAYS_MESSAGE_LOG';
let savedDays: string | undefined;

beforeEach(() => {
  savedDays = process.env[ENV_NAME];
  process.env[ENV_NAME] = '120';
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (savedDays === undefined) delete process.env[ENV_NAME];
  else process.env[ENV_NAME] = savedDays;
});

describe('RetentionController access', () => {
  it('is restricted to CCAE administrators at class level, so every route inherits it', () => {
    expect(Reflect.getMetadata(ROLES_KEY, RetentionController)).toEqual([
      AppRole.CcaeAdmin,
    ]);
  });

  it('is not public, on the class or on its route', () => {
    const handler = Object.getOwnPropertyDescriptor(
      RetentionController.prototype,
      'dryRun',
    )?.value as object;

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, RetentionController),
    ).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it('is its own controller under admin/retention', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RetentionController)).toBe(
      'admin/retention',
    );
  });

  it('exposes the preview as POST dry-run and nothing else', () => {
    const proto = RetentionController.prototype;
    const routes = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor',
    );

    // Read the handler off the descriptor; the method is never called here.
    const handler = Object.getOwnPropertyDescriptor(proto, 'dryRun')
      ?.value as object;

    expect(routes).toEqual(['dryRun']);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('dry-run');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });
});

describe('RetentionController dry-run', () => {
  const controller = new RetentionController(new RetentionService());

  it('returns the preview and never deletes, locks or writes an audit row', async () => {
    const queryRaw = jest.spyOn(prisma, '$queryRaw').mockImplementation(((
      strings: TemplateStringsArray,
    ) => {
      const text = strings.join('?');
      const count = text.includes('support_messages')
        ? 5
        : text.includes('IS NULL')
          ? 3
          : 12;
      return Promise.resolve([{ count }]);
    }) as never);
    const executeRaw = jest.spyOn(prisma, '$executeRaw');
    const transaction = jest.spyOn(prisma, '$transaction');
    const audit = jest.spyOn(prisma.audit_entries, 'create');

    const result = await controller.dryRun();

    expect(Object.keys(result).sort()).toEqual([
      'cutoff',
      'dryRun',
      'retentionDays',
      'skippedNullSentAt',
      'supportWouldDelete',
      'wouldDelete',
    ]);
    expect(result).toMatchObject({
      dryRun: true,
      retentionDays: 120,
      wouldDelete: 12,
      supportWouldDelete: 5,
      skippedNullSentAt: 3,
    });
    expect(Number.isNaN(Date.parse(result.cutoff))).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
