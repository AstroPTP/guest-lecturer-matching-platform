import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { prisma } from '../prisma';
import { ROLES_KEY } from '../auth/roles.decorator';
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

describe('ModerationController', () => {
  it('is open to any signed-in account, unlike the admin routes', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ModerationController),
    ).toBeUndefined();
  });
});

describe('GovernanceService', () => {
  const admin = new AdminService();
  const service = new GovernanceService(admin);

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
