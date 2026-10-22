import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { prisma } from '../prisma';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';
import { AdminController } from './admin.controller';
import { ModerationController } from './moderation.controller';
import {
  assertGuestCanBeContacted,
  visibleGuestsWhere,
} from './platform-rules';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CreateReportDto } from './dto/create-report.dto';

afterEach(() => jest.restoreAllMocks());

const settingsRow = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    system_name: 'Guest Lecturer Matching Platform',
    support_email: 'ccae@curtin.edu.au',
    require_admin_approval: false,
    contact_limit_days: 90,
    updated_at: new Date('2026-10-01T00:00:00Z'),
    updated_by: null,
    ...overrides,
  }) as never;

describe('platform rules', () => {
  it('hides unapproved profiles only while approval is required', async () => {
    const upsert = jest.spyOn(prisma.admin_settings, 'upsert');

    upsert.mockResolvedValueOnce(settingsRow());
    expect(await visibleGuestsWhere()).not.toHaveProperty('approved_at');

    upsert.mockResolvedValueOnce(settingsRow({ require_admin_approval: true }));
    expect(await visibleGuestsWhere()).toMatchObject({
      approved_at: { not: null },
    });
  });

  it('refuses a second request to the same lecturer inside the limit', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settingsRow());
    jest
      .spyOn(prisma.match_requests, 'findFirst')
      .mockResolvedValue({ requested_at: new Date() } as never);

    await expect(assertGuestCanBeContacted(4n)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows the request when nobody has contacted the lecturer recently', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settingsRow());
    jest.spyOn(prisma.match_requests, 'findFirst').mockResolvedValue(null);

    await expect(assertGuestCanBeContacted(4n)).resolves.toBeUndefined();
  });

  it('does not check at all when the limit is set to 0', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settingsRow({ contact_limit_days: 0 }));
    const lookup = jest.spyOn(prisma.match_requests, 'findFirst');

    await assertGuestCanBeContacted(4n);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('UpdateSettingsDto', () => {
  it.each([
    { contactLimitDays: -1 },
    { contactLimitDays: 400 },
    { supportEmail: 'nope' },
    { systemName: '' },
  ])('rejects %p', async (body) => {
    const errors = await validate(plainToInstance(UpdateSettingsDto, body));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a partial update', async () => {
    const errors = await validate(
      plainToInstance(UpdateSettingsDto, {
        requireAdminApproval: true,
        contactLimitDays: 0,
      }),
    );
    expect(errors).toHaveLength(0);
  });
});

describe('CreateReportDto', () => {
  it('rejects a non-numeric user id and an empty reason', async () => {
    const errors = await validate(
      plainToInstance(CreateReportDto, {
        reportedUserId: '1 OR 1=1',
        reason: '',
      }),
    );
    expect(errors.map((e) => e.property).sort()).toEqual([
      'reason',
      'reportedUserId',
    ]);
  });
});

describe('CreateReportDto bodies', () => {
  const check = (body: object) =>
    validate(plainToInstance(CreateReportDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts a profile id with a reason', async () => {
    expect(await check({ targetId: '12', reason: 'asked for money' })).toEqual(
      [],
    );
  });

  it('still accepts the user id body', async () => {
    expect(
      await check({ reportedUserId: '5', reason: 'asked for money' }),
    ).toEqual([]);
  });

  it.each([
    [{ reason: 'asked for money' }],
    [{ targetId: '12; DROP', reason: 'asked for money' }],
    [{ targetId: '12', reason: 'no' }],
    [{ targetId: '12', reason: 'x'.repeat(1001) }],
    [{ targetId: '12', reason: 'asked for money', reporterId: '3' }],
  ])('rejects %p', async (body) => {
    expect((await check(body)).length).toBeGreaterThan(0);
  });
});

describe('ModerationController', () => {
  it('is open to any signed-in account, unlike the admin routes', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ModerationController),
    ).toBeUndefined();
  });
});

describe('AdminController hold route', () => {
  it('is for administrators only and holds on behalf of the signed-in one', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      AppRole.CcaeAdmin,
    ]);
    const hold = jest.fn().mockResolvedValue({ id: '8', held: true });
    const controller = new AdminController(
      {} as never,
      { hold } as never,
      {} as never,
    );

    await controller.holdReported('8', { id: 'auth0|admin', roles: [] });

    expect(hold).toHaveBeenCalledWith('8', 'auth0|admin');
  });
});

/**
 * A transaction client of its own, as a real transaction hands its callback.
 * It answers from the same doubles as `prisma`, but records what ran on it, in
 * order, so a test can tell a statement that ran inside the transaction from
 * one that was mistakenly run outside it.
 */
function useTransaction() {
  const log: string[] = [];
  const locks: unknown[][] = [];
  const through =
    <T extends object>(model: T, method: keyof T, entry: string) =>
    (...args: unknown[]) => {
      log.push(entry);
      return (model[method] as (...a: unknown[]) => unknown)(...args);
    };
  const tx = {
    $executeRaw: jest.fn(
      (_strings: TemplateStringsArray, ...values: unknown[]) => {
        log.push('lock');
        locks.push(values);
        return Promise.resolve(1);
      },
    ),
    audit_entries: {
      findMany: (...args: unknown[]) =>
        through(prisma.audit_entries, 'findMany', 'read')(...args),
      create: (...args: unknown[]) =>
        through(prisma.audit_entries, 'create', 'write')(...args),
    },
    users: {
      findFirst: (...args: unknown[]) =>
        through(prisma.users, 'findFirst', 'actor')(...args),
    },
  };
  jest
    .spyOn(prisma, '$transaction')
    .mockImplementation(((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx)) as never);
  return { tx, log, locks };
}

/**
 * An in-memory audit trail behind a transaction that really serialises: a
 * transaction that asks for an advisory lock waits until the transaction
 * holding the same lock has finished, as Postgres does. Every statement yields
 * to the others first, so transactions that are not serialised interleave
 * their reads and writes.
 */
type StoredEntry = {
  entry_id: bigint;
  actor_user_id: bigint | null;
  action: string;
  target_id: string | null;
  detail: unknown;
  occurred_at: Date;
  actor: null;
};

function serialisedDatabase(initial: StoredEntry[]) {
  const stored = [...initial];
  let nextId = 100n;
  const queues = new Map<string, Promise<void>>();
  const yieldToOthers = () =>
    new Promise<void>((resolve) => setImmediate(resolve));
  const users: Record<string, bigint> = { 'auth0|me': 1n, 'auth0|admin': 99n };

  type Where = {
    action?: string | { in: string[] };
    target_id?: { in: string[] };
    entry_id?: bigint;
  };
  const select = (where: Where) =>
    stored.filter((row) => {
      const wanted = where.action;
      const actionOk =
        wanted === undefined ||
        (typeof wanted === 'string'
          ? row.action === wanted
          : wanted.in.includes(row.action));
      const targetOk =
        !where.target_id || where.target_id.in.includes(row.target_id ?? '');
      const idOk =
        where.entry_id === undefined || row.entry_id === where.entry_id;
      return actionOk && targetOk && idOk;
    });

  const auditEntries = {
    findMany: async (args: { where: Where }) => {
      await yieldToOthers();
      return select(args.where);
    },
    findFirst: async (args: { where: Where }) => {
      await yieldToOthers();
      return select(args.where)[0] ?? null;
    },
    create: async (args: {
      data: Omit<StoredEntry, 'entry_id' | 'occurred_at' | 'actor'>;
    }) => {
      await yieldToOthers();
      const row: StoredEntry = {
        ...args.data,
        entry_id: nextId++,
        occurred_at: new Date('2026-10-20T01:00:00.000Z'),
        actor: null,
      };
      stored.push(row);
      return row;
    },
  };

  jest
    .spyOn(prisma.audit_entries, 'findFirst')
    .mockImplementation(auditEntries.findFirst as never);
  jest
    .spyOn(prisma, '$transaction')
    .mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const releases: (() => void)[] = [];
      const tx = {
        $executeRaw: async (
          _strings: TemplateStringsArray,
          namespace: number,
          key: number,
        ) => {
          const id = `${namespace}:${key}`;
          const ahead = queues.get(id) ?? Promise.resolve();
          let release!: () => void;
          const mine = new Promise<void>((resolve) => (release = resolve));
          queues.set(
            id,
            ahead.then(() => mine),
          );
          await ahead;
          releases.push(release);
          return 1;
        },
        audit_entries: auditEntries,
        users: {
          findFirst: (args: { where: { auth0Id: string } }) =>
            Promise.resolve(
              users[args.where.auth0Id] === undefined
                ? null
                : { userid: users[args.where.auth0Id] },
            ),
        },
      };
      try {
        return await fn(tx);
      } finally {
        releases.forEach((release) => release());
      }
    });

  return {
    stored,
    /** The actions written after the starting entries, in order. */
    written: () => stored.slice(initial.length).map((row) => row.action),
  };
}

describe('GovernanceService', () => {
  const admin = new AdminService();
  const service = new GovernanceService(
    admin,
    new MatchRequestsService(new NotificationsService()),
  );

  let transaction: ReturnType<typeof useTransaction>;
  beforeEach(() => {
    transaction = useTransaction();
  });

  it('approves a profile and records who did it', async () => {
    jest
      .spyOn(prisma.guests, 'findUnique')
      .mockResolvedValue({ guest_id: 3n } as never);
    jest
      .spyOn(prisma.guests, 'update')
      .mockResolvedValue({ guest_id: 3n, approved_at: new Date() } as never);
    const audit = jest.spyOn(prisma.audit_entries, 'create');

    await service.approve('3', 'auth0|admin');

    expect(audit.mock.calls[0][0]).toMatchObject({
      data: { action: 'guest.approved', target_type: 'guest', target_id: '3' },
    });
  });

  it('refuses to approve a profile that does not exist', async () => {
    jest.spyOn(prisma.guests, 'findUnique').mockResolvedValue(null);
    await expect(service.approve('99', 'auth0|admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records only the settings that actually changed', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValueOnce(settingsRow())
      .mockResolvedValueOnce(settingsRow({ contact_limit_days: 60 }));
    const audit = jest.spyOn(prisma.audit_entries, 'create');

    await service.updateSettings(
      { contactLimitDays: 60, requireAdminApproval: false },
      'auth0|admin',
    );

    expect(audit.mock.calls[0][0]).toMatchObject({
      data: {
        action: 'settings.updated',
        detail: { contactLimitDays: { from: 90, to: 60 } },
      },
    });
    expect(
      (audit.mock.calls[0][0] as { data: { detail: object } }).data.detail,
    ).not.toHaveProperty('requireAdminApproval');
  });

  it('will not let someone report themselves', async () => {
    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ userid: 5n, auth0Id: 'auth0|me' } as never);

    await expect(
      service.report('auth0|me', { reportedUserId: '5', reason: 'testing' }),
    ).rejects.toThrow('You cannot report yourself.');
  });

  describe('reporting the person on the other side of a match', () => {
    const reason = 'asked me to pay a fee first';
    const auditRow = {
      entry_id: 31n,
      occurred_at: new Date('2026-10-20T01:00:00.000Z'),
    };

    /** Signs in as coordinator 5, matched (or not) with guest 3001 whose account is user 77. */
    function asCoordinator(
      match: { status: string } | null,
      guest: { user_id: bigint | null } | null = { user_id: 77n },
    ) {
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 5n } as never);
      const lookup = jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue(
          match
            ? ({
                match_id: 6001n,
                coordinator_id: 5n,
                guest_id: 3001n,
                ...match,
              } as never)
            : null,
        );
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValue(guest as never);
      const audit = jest
        .spyOn(prisma.audit_entries, 'create')
        .mockResolvedValue(auditRow as never);
      return { lookup, audit };
    }

    it('stores the report against the other person account and the match', async () => {
      const { audit } = asCoordinator({ status: 'ACCEPTED' });

      const result = await service.report('auth0|me', {
        targetId: '3001',
        reason,
      });

      expect(result).toEqual({
        id: '31',
        createdAt: '2026-10-20T01:00:00.000Z',
      });
      expect(audit.mock.calls[0][0]).toMatchObject({
        data: {
          action: 'user.reported',
          target_type: 'user',
          target_id: '77',
          detail: { reason, matchId: '6001' },
        },
      });
    });

    it.each([
      ['pending', { status: 'PENDING' }],
      ['rejected', { status: 'REJECTED' }],
      ['ended', { status: 'UNMATCHED' }],
      ['never made', null],
    ])('refuses when the match is %s', async (_label, match) => {
      const { audit } = asCoordinator(match);

      await expect(
        service.report('auth0|me', { targetId: '3001', reason }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit).not.toHaveBeenCalled();
    });

    it('only ever looks in matches the caller is part of', async () => {
      // A guest cannot name some other coordinator's match: the pair is built
      // from their own profile, so the other half is the only thing they pick.
      jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValueOnce(null);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValueOnce({ guest_id: 7n } as never);
      const lookup = jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue(null);

      await expect(
        service.report('auth0|me', { targetId: '5', reason }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(lookup).toHaveBeenCalledWith({
        where: {
          coordinator_id_guest_id: { coordinator_id: 5n, guest_id: 7n },
        },
      });
    });

    it('will not let someone report themselves through their own match', async () => {
      // The double resolves every caller to user 1.
      const { audit } = asCoordinator({ status: 'ACCEPTED' }, { user_id: 1n });

      await expect(
        service.report('auth0|me', { targetId: '3001', reason }),
      ).rejects.toThrow('You cannot report yourself.');
      expect(audit).not.toHaveBeenCalled();
    });

    it('says so when the other profile has no account behind it', async () => {
      const { audit } = asCoordinator(
        { status: 'ACCEPTED' },
        { user_id: null },
      );

      await expect(
        service.report('auth0|me', { targetId: '3001', reason }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit).not.toHaveBeenCalled();
    });

    it('refuses a body that names the person twice', async () => {
      const { lookup, audit } = asCoordinator({ status: 'ACCEPTED' });

      await expect(
        service.report('auth0|me', {
          targetId: '3001',
          reportedUserId: '9',
          reason,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(lookup).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });

    it('still takes a report about someone who is already reported', async () => {
      const { audit } = asCoordinator({ status: 'ACCEPTED' });
      jest.spyOn(prisma.audit_entries, 'findMany').mockResolvedValue([
        {
          entry_id: 20n,
          target_id: '77',
          detail: { reason: 'earlier', matchId: '9' },
          actor: null,
        },
      ] as never);

      await service.report('auth0|me', { targetId: '3001', reason });

      expect(audit).toHaveBeenCalledTimes(1);
    });

    describe('limits on how much one person can report', () => {
      /** An open report by user 1 (the double's caller) about `target`. */
      const mine = (id: bigint, target: string) => ({
        entry_id: id,
        actor_user_id: 1n,
        target_id: target,
        detail: { reason: 'earlier', matchId: '9' },
        actor: null,
      });
      const openReports = (rows: object[], decided: string[] = []) =>
        jest
          .spyOn(prisma.audit_entries, 'findMany')
          .mockResolvedValueOnce(rows as never)
          .mockResolvedValueOnce(
            decided.map((target_id) => ({ target_id })) as never,
          );
      const code = (value: string) => ({ response: { code: value } });

      it('refuses a second open report about the same person', async () => {
        const { audit } = asCoordinator({ status: 'ACCEPTED' });
        openReports([mine(20n, '77')]);

        const attempt = service.report('auth0|me', {
          targetId: '3001',
          reason,
        });

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject(
          code('REPORT_ALREADY_OPEN'),
        );
        expect(audit).not.toHaveBeenCalled();
      });

      it('takes the report again once the first one is decided', async () => {
        const { audit } = asCoordinator({ status: 'ACCEPTED' });
        openReports([mine(20n, '77')], ['20']);

        await service.report('auth0|me', { targetId: '3001', reason });

        expect(audit).toHaveBeenCalledTimes(1);
      });

      it('refuses a sixth open report and says so in plain words', async () => {
        const { audit } = asCoordinator({ status: 'ACCEPTED' });
        openReports([11, 12, 13, 14, 15].map((n) => mine(BigInt(n), `${n}`)));

        const attempt = service.report('auth0|me', {
          targetId: '3001',
          reason,
        });

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject(
          code('REPORT_LIMIT_REACHED'),
        );
        await expect(attempt).rejects.toMatchObject({
          response: { message: expect.stringContaining('5 reports') as string },
        });
        expect(audit).not.toHaveBeenCalled();
      });

      it('takes a fifth open report', async () => {
        const { audit } = asCoordinator({ status: 'ACCEPTED' });
        openReports([11, 12, 13, 14].map((n) => mine(BigInt(n), `${n}`)));

        await service.report('auth0|me', { targetId: '3001', reason });

        expect(audit).toHaveBeenCalledTimes(1);
      });

      it('does not count what other people have reported', async () => {
        const { audit } = asCoordinator({ status: 'ACCEPTED' });
        openReports(
          [11, 12, 13, 14, 15, 16].map((n) => ({
            ...mine(BigInt(n), '77'),
            actor_user_id: 2n,
          })),
        );

        await service.report('auth0|me', { targetId: '3001', reason });

        expect(audit).toHaveBeenCalledTimes(1);
      });

      it('applies to the user id body as well', async () => {
        jest
          .spyOn(prisma.users, 'findUnique')
          .mockResolvedValue({ userid: 9n, auth0Id: 'auth0|other' } as never);
        const audit = jest.spyOn(prisma.audit_entries, 'create');
        openReports([mine(20n, '9')]);

        await expect(
          service.report('auth0|me', { reportedUserId: '9', reason }),
        ).rejects.toMatchObject(code('REPORT_ALREADY_OPEN'));
        expect(audit).not.toHaveBeenCalled();
      });
    });

    it('keeps the user id body working, without a match behind it', async () => {
      jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 9n, auth0Id: 'auth0|other' } as never);
      const audit = jest
        .spyOn(prisma.audit_entries, 'create')
        .mockResolvedValue(auditRow as never);

      await service.report('auth0|me', { reportedUserId: '9', reason });

      const { data } = audit.mock.calls[0][0] as {
        data: { target_id: string; detail: object };
      };
      expect(data.target_id).toBe('9');
      expect(data.detail).toEqual({ reason });
    });
  });

  it('shows who reported whom, from which match, how many people, and the hold', async () => {
    jest
      .spyOn(prisma.audit_entries, 'findMany')
      .mockResolvedValueOnce([
        {
          entry_id: 8n,
          actor_user_id: 2n,
          target_id: '77',
          detail: { reason: 'asked for a fee', matchId: '6001' },
          occurred_at: new Date('2026-10-20T01:00:00.000Z'),
          actor: { email: 'coord@example.com' },
        },
        {
          entry_id: 9n,
          actor_user_id: null,
          target_id: '78',
          detail: { reason: 'sent through the old body' },
          occurred_at: new Date('2026-10-21T01:00:00.000Z'),
          actor: null,
        },
      ] as never)
      .mockResolvedValueOnce([] as never)
      // The administrator has held person 77.
      .mockResolvedValueOnce([
        {
          action: 'user.held',
          target_id: '77',
          detail: { reportIds: ['8'] },
        },
      ] as never);
    jest.spyOn(prisma.users, 'findMany').mockResolvedValue([
      {
        userid: 2n,
        email: 'coord@example.com',
        role: 'unit_coordinator',
        deletedat: null,
      },
      {
        userid: 77n,
        email: 'guest@example.com',
        role: 'guest_speaker',
        deletedat: null,
      },
      {
        userid: 78n,
        email: 'other@example.com',
        role: 'guest_speaker',
        deletedat: new Date(),
      },
    ] as never);
    jest
      .spyOn(prisma.guests, 'findMany')
      .mockResolvedValue([
        { user_id: 77n, first_name: 'Greta', last_name: 'Guest' },
      ] as never);
    jest
      .spyOn(prisma.coordinators, 'findMany')
      .mockResolvedValue([
        { user_id: 2n, first_name: 'Carl', last_name: null },
      ] as never);

    const [matched, plain] = await service.openReports();

    expect(matched).toMatchObject({
      id: '8',
      reporterName: 'Carl',
      reporterRole: 'unit_coordinator',
      reporterEmail: 'coord@example.com',
      reportedName: 'Greta Guest',
      reportedRole: 'guest_speaker',
      reportedStatus: 'active',
      matchId: '6001',
      openReporters: 1,
      holdThreshold: 2,
      onHold: true,
      holdReasons: ['admin'],
    });
    expect(plain).toMatchObject({
      reporterName: null,
      reportedName: null,
      reportedStatus: 'deactivated',
      matchId: null,
      openReporters: 0,
      onHold: false,
      holdReasons: [],
    });
  });

  it('says a person is on hold because of the threshold when enough people reported them', async () => {
    const row = (id: bigint, actor: bigint) => ({
      entry_id: id,
      actor_user_id: actor,
      target_id: '77',
      detail: { reason: 'asked for a fee', matchId: '6001' },
      occurred_at: new Date('2026-10-20T01:00:00.000Z'),
      actor: null,
    });
    jest
      .spyOn(prisma.audit_entries, 'findMany')
      .mockResolvedValueOnce([row(8n, 2n), row(9n, 3n)] as never);

    const rows = await service.openReports();

    expect(rows.map((r) => r.openReporters)).toEqual([2, 2]);
    expect(rows[0]).toMatchObject({ onHold: true, holdReasons: ['threshold'] });
  });

  it('leaves resolved reports out of the queue', async () => {
    jest
      .spyOn(prisma.audit_entries, 'findMany')
      .mockResolvedValueOnce([
        {
          entry_id: 1n,
          target_id: '7',
          detail: { reason: 'a' },
          occurred_at: new Date(),
          actor: null,
        },
        {
          entry_id: 2n,
          target_id: '7',
          detail: { reason: 'b' },
          occurred_at: new Date(),
          actor: null,
        },
      ] as never)
      .mockResolvedValueOnce([{ target_id: '1' }] as never);
    jest.spyOn(prisma.users, 'findMany').mockResolvedValue([]);

    const open = await service.openReports();

    expect(open.map((r) => r.id)).toEqual(['2']);
  });

  describe('holding and releasing', () => {
    const openRow = (id: bigint, actor: bigint, target = '77') => ({
      entry_id: id,
      actor_user_id: actor,
      target_id: target,
      detail: { reason: 'asked for a fee', matchId: '6001' },
      occurred_at: new Date('2026-10-20T01:00:00.000Z'),
      actor: null,
    });
    /** A hold the administrator placed while `reportIds` were open about person 77. */
    const held = (...reportIds: string[]) => ({
      action: 'user.held',
      target_id: '77',
      detail: { reportIds },
    });

    /**
     * The audit trail on each read, in order. A read is the open reports, then
     * (when there are any) the decisions about them and the administrator's
     * holds. `reads` gives each read as [reports, decided report ids, holds].
     */
    function audit(
      ...reads: [reports: object[], decided?: string[], holds?: object[]][]
    ) {
      const find = jest.spyOn(prisma.audit_entries, 'findMany');
      for (const [reports, decided = [], holds = []] of reads) {
        find.mockResolvedValueOnce(reports as never);
        if (reports.length > 0) {
          find.mockResolvedValueOnce(
            decided.map((target_id) => ({ target_id })) as never,
          );
          find.mockResolvedValueOnce(holds as never);
        }
      }
      return jest.spyOn(prisma.audit_entries, 'create');
    }

    const actions = (create: jest.SpyInstance) =>
      (create.mock.calls as [{ data: { action: string } }][]).map(
        ([call]) => call.data.action,
      );

    function reportRow(entryId: bigint, target = '77') {
      jest
        .spyOn(prisma.audit_entries, 'findFirst')
        .mockResolvedValue({ entry_id: entryId, target_id: target } as never);
    }

    describe('hold', () => {
      it('holds the person the report is about and records who did it', async () => {
        reportRow(8n);
        const create = audit([[openRow(8n, 2n)]]);

        await expect(service.hold('8', 'auth0|admin')).resolves.toEqual({
          id: '8',
          held: true,
        });

        expect(create.mock.calls[0][0]).toMatchObject({
          data: {
            action: 'user.held',
            target_type: 'user',
            target_id: '77',
            detail: { reportId: '8' },
          },
        });
      });

      it('writes nothing more when they are already held', async () => {
        reportRow(8n);
        const create = audit([[openRow(8n, 2n)], [], [held('8')]]);

        await expect(service.hold('8', 'auth0|admin')).resolves.toEqual({
          id: '8',
          held: true,
        });
        expect(create).not.toHaveBeenCalled();
      });

      it('refuses a report that has been decided already', async () => {
        reportRow(8n);
        const create = audit([[openRow(9n, 3n)]]);

        const attempt = service.hold('8', 'auth0|admin');

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject({
          response: { code: 'REPORT_ALREADY_DECIDED' },
        });
        expect(create).not.toHaveBeenCalled();
      });

      it('refuses a report that does not exist', async () => {
        jest.spyOn(prisma.audit_entries, 'findFirst').mockResolvedValue(null);

        await expect(service.hold('99', 'auth0|admin')).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });
    });

    describe('what a hold records', () => {
      it('names every report open about that person, and nobody else’s', async () => {
        reportRow(8n);
        const create = audit([
          [openRow(8n, 2n), openRow(9n, 3n), openRow(10n, 4n, '78')],
        ]);

        await service.hold('8', 'auth0|admin');

        expect(create.mock.calls[0][0]).toMatchObject({
          data: {
            action: 'user.held',
            target_id: '77',
            detail: { reportId: '8', reportIds: ['8', '9'] },
          },
        });
      });

      it('needs at least one open report raised from a match', async () => {
        reportRow(8n);
        const oldBody = {
          ...openRow(8n, 2n),
          detail: { reason: 'sent through the old body' },
        };
        const create = audit([[oldBody]]);

        const attempt = service.hold('8', 'auth0|admin');

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject({
          response: { code: 'HOLD_NEEDS_MATCH_REPORT' },
        });
        expect(create).not.toHaveBeenCalled();
      });

      it('allows the hold from a report without a match when another is from one', async () => {
        reportRow(8n);
        const oldBody = {
          ...openRow(8n, 2n),
          detail: { reason: 'sent through the old body' },
        };
        const create = audit([[oldBody, openRow(9n, 3n)]]);

        await service.hold('8', 'auth0|admin');

        expect(actions(create)).toEqual(['user.held']);
      });

      it('writes a fresh hold when the report is not one the current hold covers', async () => {
        reportRow(9n);
        const create = audit([
          [openRow(8n, 2n), openRow(9n, 3n)],
          [],
          [held('8')],
        ]);

        await service.hold('9', 'auth0|admin');

        expect(create.mock.calls[0][0]).toMatchObject({
          data: { detail: { reportIds: ['8', '9'] } },
        });
      });

      it('writes a fresh hold over one whose reports are all decided', async () => {
        reportRow(9n);
        const create = audit([[openRow(9n, 3n)], [], [held('4')]]);

        await service.hold('9', 'auth0|admin');

        expect(actions(create)).toEqual(['user.held']);
      });

      it('runs the read and the write inside the transaction', async () => {
        reportRow(8n);
        const create = audit([[openRow(8n, 2n)]]);

        await service.hold('8', 'auth0|admin');

        expect(transaction.log[0]).toBe('lock');
        expect(transaction.log.filter((e) => e === 'write')).toHaveLength(
          create.mock.calls.length,
        );
      });
    });

    describe('dismissing', () => {
      beforeEach(() => reportRow(8n));

      it('releases an administrator hold when it was the last open report', async () => {
        const create = audit(
          [[openRow(8n, 2n)], [], [held('8')]], // before
          [[]], // after: nothing left open
        );

        await service.resolveReport('8', 'dismissed', 'auth0|admin');

        expect(actions(create)).toEqual(['report.resolved', 'user.released']);
        expect(create.mock.calls[1][0]).toMatchObject({
          data: {
            action: 'user.released',
            target_type: 'user',
            target_id: '77',
            detail: { reportId: '8', outcome: 'dismissed' },
          },
        });
      });

      it('keeps the hold while another open report is still there', async () => {
        const create = audit(
          [[openRow(8n, 2n), openRow(9n, 3n)], [], [held('8', '9')]], // before
          [[openRow(9n, 3n)], ['8'], [held('8', '9')]], // after: only 9 left
        );

        await service.resolveReport('8', 'dismissed', 'auth0|admin');

        expect(actions(create)).toEqual(['report.resolved']);
      });

      it('takes the lock first and writes the decision and the release inside the transaction', async () => {
        const create = audit([[openRow(8n, 2n)], [], [held('8')]], [[]]);

        await service.resolveReport('8', 'dismissed', 'auth0|admin');

        expect(transaction.log[0]).toBe('lock');
        expect(transaction.locks[0][1]).toBe(77);
        expect(actions(create)).toEqual(['report.resolved', 'user.released']);
        expect(transaction.log.filter((e) => e === 'write')).toHaveLength(2);
      });

      it('releases a hold that came from the threshold once reporters fall under it', async () => {
        const create = audit(
          [[openRow(8n, 2n), openRow(9n, 3n)]], // two people: held
          [[openRow(9n, 3n)]], // one left: not held
        );

        await service.resolveReport('8', 'dismissed', 'auth0|admin');

        expect(actions(create)).toEqual(['report.resolved', 'user.released']);
      });

      it('keeps a threshold hold when enough other people are still reporting', async () => {
        reportRow(8n);
        const create = audit(
          [[openRow(8n, 2n), openRow(9n, 3n), openRow(10n, 4n)]],
          [[openRow(9n, 3n), openRow(10n, 4n)], ['8']],
        );

        await service.resolveReport('8', 'dismissed', 'auth0|admin');

        expect(actions(create)).toEqual(['report.resolved']);
      });

      it('records no release for someone who was never held', async () => {
        const create = audit([[openRow(8n, 2n)]], [[]]);

        await service.resolveReport('8', 'dismissed', 'auth0|admin');

        expect(actions(create)).toEqual(['report.resolved']);
      });

      it('releases on deactivation too, and still deactivates', async () => {
        const deactivate = jest
          .spyOn(admin, 'setStatus')
          .mockResolvedValue({ id: '77', status: 'deactivated' });
        const create = audit([[openRow(8n, 2n)], [], [held('8')]], [[]]);

        await service.resolveReport('8', 'deactivated', 'auth0|admin');

        expect(deactivate).toHaveBeenCalledWith(
          '77',
          'deactivated',
          'auth0|admin',
        );
        expect(actions(create)).toEqual(['report.resolved', 'user.released']);
      });
    });
  });

  describe('under a lock, so simultaneous requests cannot interleave', () => {
    const reason = 'asked me to pay a fee first';
    const row = (
      id: bigint,
      actor: bigint,
      target: string,
      detail: object = { reason: 'earlier', matchId: '6001' },
    ): StoredEntry => ({
      entry_id: id,
      actor_user_id: actor,
      action: 'user.reported',
      target_id: target,
      detail,
      occurred_at: new Date('2026-10-19T01:00:00.000Z'),
      actor: null,
    });
    const legacyReport = (reportedUserId: string) => {
      jest.spyOn(prisma.users, 'findUnique').mockResolvedValue({
        userid: BigInt(reportedUserId),
        auth0Id: `auth0|other-${reportedUserId}`,
      } as never);
      return service.report('auth0|me', { reportedUserId, reason });
    };

    it('takes the reporter’s lock before reading the limit and storing the report', async () => {
      jest.spyOn(prisma.audit_entries, 'create').mockResolvedValue({
        entry_id: 31n,
        occurred_at: new Date('2026-10-20T01:00:00.000Z'),
      } as never);

      await legacyReport('9');

      expect(transaction.log).toEqual(['lock', 'read', 'actor', 'write']);
      // The double signs every caller in as user 1.
      expect(transaction.locks[0][1]).toBe(1);
    });

    it('does not take the reporter’s lock for a report it refuses before storing', async () => {
      jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 9n, auth0Id: 'auth0|me' } as never);

      await expect(
        service.report('auth0|me', { reportedUserId: '9', reason }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction.log).toEqual([]);
    });

    it('takes a lock for the person reported, in a different namespace, when holding and deciding', async () => {
      jest.spyOn(prisma.audit_entries, 'create').mockResolvedValue({
        entry_id: 31n,
        occurred_at: new Date('2026-10-20T01:00:00.000Z'),
      } as never);
      await legacyReport('9');
      const reporterLock = transaction.locks[0];

      jest.spyOn(prisma.audit_entries, 'findFirst').mockResolvedValue({
        entry_id: 8n,
        target_id: '77',
      } as never);
      jest
        .spyOn(prisma.audit_entries, 'findMany')
        .mockResolvedValueOnce([row(8n, 2n, '77')] as never)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([row(8n, 2n, '77')] as never)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never);
      transaction.locks.length = 0;
      transaction.log.length = 0;

      await service.hold('8', 'auth0|admin');
      const holdLock = transaction.locks[0];
      expect(transaction.log[0]).toBe('lock');

      transaction.locks.length = 0;
      transaction.log.length = 0;
      await service.resolveReport('8', 'dismissed', 'auth0|admin');
      const resolveLock = transaction.locks[0];
      expect(transaction.log[0]).toBe('lock');

      expect(holdLock[1]).toBe(77);
      expect(resolveLock).toEqual(holdLock);
      expect(holdLock[0]).not.toBe(reporterLock[0]);
    });

    it('lets only one of two simultaneous reports through the limit', async () => {
      const database = serialisedDatabase([
        row(1n, 1n, '11'),
        row(2n, 1n, '12'),
        row(3n, 1n, '13'),
        row(4n, 1n, '14'),
      ]);
      jest.spyOn(prisma.users, 'findUnique').mockImplementation(((args: {
        where: { userid: bigint };
      }) =>
        Promise.resolve({
          userid: args.where.userid,
          auth0Id: `auth0|other-${args.where.userid}`,
        })) as never);

      const results = await Promise.allSettled([
        service.report('auth0|me', { reportedUserId: '21', reason }),
        service.report('auth0|me', { reportedUserId: '22', reason }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const refused = results.find((r) => r.status === 'rejected');
      expect((refused as PromiseRejectedResult).reason).toMatchObject({
        response: { code: 'REPORT_LIMIT_REACHED' },
      });
      expect(database.written()).toEqual(['user.reported']);
    });

    it('keeps a hold and a dismissal of the same report from interleaving', async () => {
      const database = serialisedDatabase([row(8n, 2n, '77')]);

      const results = await Promise.allSettled([
        service.hold('8', 'auth0|admin'),
        service.resolveReport('8', 'dismissed', 'auth0|admin'),
      ]);

      // Either the hold came first and the dismissal released it, or the
      // dismissal came first and the hold was refused. Never a hold left over
      // for a report that is already decided.
      expect([
        ['user.held', 'report.resolved', 'user.released'],
        ['report.resolved'],
      ]).toContainEqual(database.written());
      if (database.written().length === 1) {
        expect(results[0].status).toBe('rejected');
      }
    });
  });

  it('does not call a person held when the only hold names reports that are decided', async () => {
    jest
      .spyOn(prisma.audit_entries, 'findMany')
      .mockResolvedValueOnce([
        {
          entry_id: 9n,
          actor_user_id: 3n,
          target_id: '77',
          detail: { reason: 'a newer complaint', matchId: '6002' },
          occurred_at: new Date('2026-10-21T01:00:00.000Z'),
          actor: null,
        },
      ] as never)
      .mockResolvedValueOnce([] as never)
      // Placed for report 4, which was decided long ago.
      .mockResolvedValueOnce([
        {
          action: 'user.held',
          target_id: '77',
          detail: { reportIds: ['4'] },
        },
      ] as never);
    jest.spyOn(prisma.users, 'findMany').mockResolvedValue([] as never);

    const [report] = await service.openReports();

    expect(report).toMatchObject({ onHold: false, holdReasons: [] });
  });

  it('deactivates the reported account when that is the outcome', async () => {
    jest
      .spyOn(prisma.audit_entries, 'findFirst')
      .mockResolvedValue({ entry_id: 2n, target_id: '7' } as never);
    const deactivate = jest
      .spyOn(admin, 'setStatus')
      .mockResolvedValue({ id: '7', status: 'deactivated' });

    await service.resolveReport('2', 'deactivated', 'auth0|admin');

    expect(deactivate).toHaveBeenCalledWith('7', 'deactivated', 'auth0|admin');
  });
});
