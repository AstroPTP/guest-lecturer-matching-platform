import 'reflect-metadata';
import {
  Logger,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { runInRequestContext } from '../common/request-context';
import { prisma } from '../prisma';
import { JwtAuthGuard, recordSignIn } from './jwt.guard';

const CORRELATION_ID = '01HZX3K9QJ0000000000000000';

/** The first argument of the spy's first call. */
function firstArg(spy: jest.SpyInstance): unknown {
  return (spy.mock.calls as unknown[][])[0][0];
}

/**
 * The actions written to the audit trail, in order. Every audit write goes
 * through prisma.audit_entries.create, so this is the whole trail.
 */
function auditedActions(create: jest.SpyInstance): string[] {
  return create.mock.calls.map(
    ([args]: [{ data: { action: string } }]) => args.data.action,
  );
}

describe('recordSignIn', () => {
  let updateMany: jest.SpyInstance;
  let findFirst: jest.SpyInstance;
  let create: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    updateMany = jest
      .spyOn(prisma.users, 'updateMany')
      .mockResolvedValue({ count: 1 });
    findFirst = jest
      .spyOn(prisma.users, 'findFirst')
      .mockResolvedValue({ userid: 42n } as never);
    create = jest.spyOn(prisma.audit_entries, 'create');
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes exactly one user.signed_in row when the update changed the user', async () => {
    await runInRequestContext({ correlationId: CORRELATION_ID }, () =>
      recordSignIn('auth0|abc', { audit: true }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(firstArg(create)).toEqual({
      data: {
        actor_user_id: 42n,
        action: 'user.signed_in',
        target_type: 'user',
        target_id: '42',
        detail: { correlationId: CORRELATION_ID },
      },
    });
  });

  it('writes nothing when the update changed no row, because they signed in within the hour', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await recordSignIn('auth0|abc', { audit: true });

    expect(create).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('writes nothing when told it is the demo bypass, even though the update happened', async () => {
    await recordSignIn('demo|unit_coordinator', { audit: false });

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('does nothing at all without an Auth0 id', async () => {
    await recordSignIn(undefined, { audit: true });

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('only updates users who are not deleted and whose last sign-in is missing or over an hour old', async () => {
    await recordSignIn('auth0|abc', { audit: true });

    const [{ where }] = updateMany.mock.calls[0] as [
      { where: { auth0Id: string; deletedat: null; OR: unknown[] } },
    ];
    expect(where.auth0Id).toBe('auth0|abc');
    expect(where.deletedat).toBeNull();
    expect(where.OR).toHaveLength(2);
  });

  it('writes no row when the user was deleted between the update and the lookup', async () => {
    findFirst.mockResolvedValue(null);

    await recordSignIn('auth0|abc', { audit: true });

    expect(create).not.toHaveBeenCalled();
  });

  it('resolves, and writes no row, when the update itself fails', async () => {
    updateMany.mockRejectedValue(new Error('connection lost'));

    await expect(
      recordSignIn('auth0|abc', { audit: true }),
    ).resolves.toBeUndefined();

    expect(create).not.toHaveBeenCalled();
  });

  it('resolves when the client throws synchronously', async () => {
    updateMany.mockImplementation(() => {
      throw new Error('client not connected');
    });

    await expect(
      recordSignIn('auth0|abc', { audit: true }),
    ).resolves.toBeUndefined();
  });

  it('resolves and warns, without the error text, when the audit write fails', async () => {
    create.mockRejectedValue(
      new Error('insert failed for auth0Id = auth0|abc'),
    );

    await expect(
      recordSignIn('auth0|abc', { audit: true }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(firstArg(warn))).toMatch(/not written/);
    expect(String(firstArg(warn))).not.toContain('auth0|abc');
  });

  it('still updates the last sign-in time when the audit write fails', async () => {
    create.mockRejectedValue(new Error('audit table locked'));

    await recordSignIn('auth0|abc', { audit: true });

    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

/**
 * The users table as the guard sees it. The guard asks twice: whether the
 * account is deleted (a query carrying `deletedat`), and later who the user is.
 */
function stubUsers({ deleted }: { deleted: boolean }) {
  return jest
    .spyOn(prisma.users, 'findFirst')
    .mockImplementation(((args: { where: { deletedat?: unknown } }) =>
      Promise.resolve(
        args.where.deletedat
          ? deleted
            ? { userid: 42n }
            : null
          : { userid: 42n },
      )) as never);
}

describe('JwtAuthGuard sign-in auditing', () => {
  const savedEnv = {
    bypass: process.env.DEMO_AUTH_BYPASS,
    role: process.env.DEMO_AUTH_ROLE,
  };
  let updateMany: jest.SpyInstance;
  let create: jest.SpyInstance;

  /** The guard with the metadata lookup answered: this route is not public. */
  const guard = () =>
    new JwtAuthGuard({
      getAllAndOverride: () => false,
    } as unknown as Reflector);

  const contextFor = (request: Record<string, unknown>) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  /** Lets the fire-and-forget chain finish: every mock resolves immediately. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    updateMany = jest
      .spyOn(prisma.users, 'updateMany')
      .mockResolvedValue({ count: 1 });
    stubUsers({ deleted: false });
    create = jest.spyOn(prisma.audit_entries, 'create');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, value] of [
      ['DEMO_AUTH_BYPASS', savedEnv.bypass],
      ['DEMO_AUTH_ROLE', savedEnv.role],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe('on the demo bypass', () => {
    beforeEach(() => {
      process.env.DEMO_AUTH_BYPASS = 'true';
      process.env.DEMO_AUTH_ROLE = 'unit_coordinator';
    });

    it('lets the request through and keeps the last-sign-in update, but writes no audit row', async () => {
      const allowed = await guard().canActivate(contextFor({}));
      await settle();

      expect(allowed).toBe(true);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('with a verified token', () => {
    let authenticate: jest.SpyInstance;

    beforeEach(() => {
      delete process.env.DEMO_AUTH_BYPASS;
      // The parent class is passport's guard. Standing in for it keeps this
      // about what happens after a token has been accepted; the token checks
      // themselves are covered in auth.guards.spec.ts.
      authenticate = jest
        .spyOn(
          Object.getPrototypeOf(JwtAuthGuard.prototype) as {
            canActivate: (context: ExecutionContext) => Promise<boolean>;
          },
          'canActivate',
        )
        .mockResolvedValue(true);
    });

    it('writes one user.signed_in row for the first request of the hour', async () => {
      const request = { user: { id: 'auth0|abc' } };

      const allowed = await runInRequestContext(
        { correlationId: CORRELATION_ID },
        () => guard().canActivate(contextFor(request)),
      );
      await settle();

      expect(allowed).toBe(true);
      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(auditedActions(create)).toEqual(['user.signed_in']);
      expect(firstArg(create)).toMatchObject({
        data: { target_id: '42', detail: { correlationId: CORRELATION_ID } },
      });
    });

    it('writes no row for the later requests of the same hour', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await guard().canActivate(contextFor({ user: { id: 'auth0|abc' } }));
      await settle();

      expect(create).not.toHaveBeenCalled();
    });

    it('writes no row, and refuses the request, for a deleted account', async () => {
      stubUsers({ deleted: true });

      await expect(
        guard().canActivate(contextFor({ user: { id: 'auth0|abc' } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await settle();

      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('answers the request without waiting for the audit write', async () => {
      let finishAudit: () => void = () => undefined;
      create.mockImplementation(
        () => new Promise<void>((resolve) => (finishAudit = resolve)) as never,
      );

      const allowed = await guard().canActivate(
        contextFor({ user: { id: 'auth0|abc' } }),
      );

      expect(allowed).toBe(true);
      finishAudit();
      await settle();
    });
  });
});
