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
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';
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

describe('GovernanceService', () => {
  const admin = new AdminService();
  const service = new GovernanceService(
    admin,
    new MatchRequestsService(new NotificationsService()),
  );

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

  it('shows who reported whom, from which match, and whether they are kept out', async () => {
    jest.spyOn(prisma.audit_entries, 'findMany').mockResolvedValueOnce([
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
      reportedIsBlocked: true,
    });
    expect(plain).toMatchObject({
      reporterName: null,
      reportedName: null,
      reportedStatus: 'deactivated',
      matchId: null,
      reportedIsBlocked: false,
    });
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
