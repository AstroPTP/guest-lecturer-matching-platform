import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { prisma } from '../prisma';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SetUserStatusDto } from './dto/set-user-status.dto';

afterEach(() => jest.restoreAllMocks());

describe('AdminController access', () => {
  it('is restricted to CCAE administrators at class level, so every route inherits it', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      AppRole.CcaeAdmin,
    ]);
  });
});

describe('SetUserStatusDto', () => {
  it.each(['active', 'deactivated'])('accepts %s', async (status) => {
    expect(
      await validate(plainToInstance(SetUserStatusDto, { status })),
    ).toHaveLength(0);
  });

  it.each(['admin', 'deleted', '', undefined])('rejects %p', async (status) => {
    expect(
      (await validate(plainToInstance(SetUserStatusDto, { status }))).length,
    ).toBeGreaterThan(0);
  });
});

describe('AdminService', () => {
  const service = new AdminService();

  it('deactivates by setting deletedat, which the JWT guard already refuses', async () => {
    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ userid: 5n } as never);
    const update = jest
      .spyOn(prisma.users, 'update')
      .mockResolvedValue({ userid: 5n, deletedat: new Date() } as never);

    await expect(service.setStatus('5', 'deactivated')).resolves.toEqual({
      id: '5',
      status: 'deactivated',
    });
    expect(update.mock.calls[0][0].data.deletedat).toBeInstanceOf(Date);
  });

  it('reactivates by clearing deletedat', async () => {
    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ userid: 5n } as never);
    const update = jest
      .spyOn(prisma.users, 'update')
      .mockResolvedValue({ userid: 5n, deletedat: null } as never);

    await expect(service.setStatus('5', 'active')).resolves.toEqual({
      id: '5',
      status: 'active',
    });
    expect(update.mock.calls[0][0].data.deletedat).toBeNull();
  });

  it('refuses an unknown user rather than creating one', async () => {
    jest.spyOn(prisma.users, 'findUnique').mockResolvedValue(null);
    await expect(service.setStatus('99', 'deactivated')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('counts contact requests per coordinator, most active first', async () => {
    jest.spyOn(prisma.coordinators, 'findMany').mockResolvedValue([
      {
        coordinator_id: 1n,
        user_id: 11n,
        first_name: 'Ann',
        last_name: 'Lee',
        faculty: 'Business',
        match_requests: [{ status: 'accepted' }],
      },
      {
        coordinator_id: 2n,
        user_id: null,
        first_name: 'Bo',
        last_name: null,
        faculty: 'Law',
        match_requests: [
          { status: 'pending' },
          { status: 'ACCEPTED' },
          { status: 'declined' },
        ],
      },
    ] as never);

    await expect(service.contactsPerCoordinator()).resolves.toEqual([
      {
        coordinatorId: '2',
        userId: null,
        name: 'Bo',
        faculty: 'Law',
        requests: 3,
        accepted: 1,
      },
      {
        coordinatorId: '1',
        userId: '11',
        name: 'Ann Lee',
        faculty: 'Business',
        requests: 1,
        accepted: 1,
      },
    ]);
  });

  it('neutralises spreadsheet formulas in the usage report', async () => {
    jest.spyOn(service, 'overview').mockResolvedValue({
      people: {},
      profiles: {},
      signIns: {},
      contacts: {},
    } as never);
    jest.spyOn(service, 'contactsPerCoordinator').mockResolvedValue([
      {
        coordinatorId: '1',
        userId: '11',
        name: '=HYPERLINK("http://x")',
        faculty: 'Law',
        requests: 2,
        accepted: 1,
      },
    ]);

    const csv = await service.usageReportCsv();

    expect(csv).toContain(`"'=HYPERLINK(""http://x"")","Law","2","1"`);
  });
});
