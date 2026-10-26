import 'reflect-metadata';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import request from 'supertest';
import type { Server } from 'node:http';
import {
  startAuthStandIn,
  type AuthStandIn,
} from '../auth/testing/auth-stand-in';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { prisma } from '../prisma';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { GovernanceService } from './governance.service';
import { SystemService } from './system.service';

afterEach(() => jest.restoreAllMocks());

const settingsRow = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    system_name: 'Guest Lecturer Matching Platform',
    support_email: 'ccae@curtin.edu.au',
    require_admin_approval: false,
    contact_limit_days: 90,
    suggestions_enabled: false,
    suggestions_fit_weight: 65,
    suggestions_rotation_weight: 20,
    suggestions_exposure_weight: 15,
    suggestions_half_life_days: 90,
    updated_at: new Date('2026-10-01T00:00:00Z'),
    updated_by: null,
    ...overrides,
  }) as never;

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateSettingsDto, body))).map(
    (error) => error.property,
  );

describe('UpdateSettingsDto, Suggested speakers fields', () => {
  it('accepts a complete valid change', async () => {
    expect(
      await errorsFor({
        suggestionsEnabled: false,
        suggestionsFitWeight: 80,
        suggestionsRotationWeight: 10,
        suggestionsExposureWeight: 10,
        suggestionsHalfLifeDays: 180,
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'fit 40, below the floor of 50',
      { suggestionsFitWeight: 40 },
      'suggestionsFitWeight',
    ],
    ['fit 101', { suggestionsFitWeight: 101 }, 'suggestionsFitWeight'],
    [
      'a rotation weight of -1',
      { suggestionsRotationWeight: -1 },
      'suggestionsRotationWeight',
    ],
    [
      'an exposure weight of 101',
      { suggestionsExposureWeight: 101 },
      'suggestionsExposureWeight',
    ],
    [
      'a half-life of 10 days',
      { suggestionsHalfLifeDays: 10 },
      'suggestionsHalfLifeDays',
    ],
    [
      'a half-life of 29 days',
      { suggestionsHalfLifeDays: 29 },
      'suggestionsHalfLifeDays',
    ],
    [
      'a half-life of 366 days',
      { suggestionsHalfLifeDays: 366 },
      'suggestionsHalfLifeDays',
    ],
    [
      'a fractional weight',
      { suggestionsRotationWeight: 20.5 },
      'suggestionsRotationWeight',
    ],
    [
      'a fractional half-life',
      { suggestionsHalfLifeDays: 90.5 },
      'suggestionsHalfLifeDays',
    ],
    ['a text weight', { suggestionsFitWeight: '65' }, 'suggestionsFitWeight'],
    ['a text switch', { suggestionsEnabled: 'yes' }, 'suggestionsEnabled'],
  ])('rejects %s', async (_label, body, field) => {
    expect(await errorsFor(body)).toContain(field);
  });

  it.each([
    'suggestionsEnabled',
    'suggestionsFitWeight',
    'suggestionsRotationWeight',
    'suggestionsExposureWeight',
    'suggestionsHalfLifeDays',
  ])(
    'rejects null for %s, which would otherwise fail in the database as a 500',
    async (field) => {
      expect(await errorsFor({ [field]: null })).toContain(field);
    },
  );

  it('still lets a field be left out entirely', async () => {
    expect(await errorsFor({})).toEqual([]);
    expect(await errorsFor({ suggestionsHalfLifeDays: undefined })).toEqual([]);
  });

  it('accepts the edges: fit 50, fit 100, half-life 30 and 365', async () => {
    expect(await errorsFor({ suggestionsFitWeight: 50 })).toEqual([]);
    expect(await errorsFor({ suggestionsFitWeight: 100 })).toEqual([]);
    expect(await errorsFor({ suggestionsHalfLifeDays: 30 })).toEqual([]);
    expect(await errorsFor({ suggestionsHalfLifeDays: 365 })).toEqual([]);
  });
});

describe('GovernanceService, Suggested speakers settings', () => {
  // Built through a loose constructor type: the constructor may take more
  // dependencies, and updateSettings uses none of them.
  const service = new (GovernanceService as unknown as new (
    ...dependencies: unknown[]
  ) => GovernanceService)(new AdminService());
  const admin = 'auth0|admin';

  it('reads the five settings back under the names the DTO uses', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(settingsRow());
    expect(await service.settings()).toMatchObject({
      suggestionsEnabled: false,
      suggestionsFitWeight: 65,
      suggestionsRotationWeight: 20,
      suggestionsExposureWeight: 15,
      suggestionsHalfLifeDays: 90,
    });
  });

  describe('refuses with a 400, and writes nothing', () => {
    const attempt = async (dto: UpdateSettingsDto) => {
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue(settingsRow());
      const update = jest.spyOn(prisma.admin_settings, 'update');
      const audit = jest.spyOn(prisma.audit_entries, 'create');
      const failure = await service
        .updateSettings(dto, admin)
        .catch((error: unknown) => error);
      expect(update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
      return failure as BadRequestException;
    };

    it('weights that do not add up to 100', async () => {
      const failure = await attempt({
        suggestionsFitWeight: 60,
        suggestionsRotationWeight: 20,
        suggestionsExposureWeight: 15,
      });
      expect(failure).toBeInstanceOf(BadRequestException);
      expect(failure.getResponse()).toMatchObject({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('add up to 100') as unknown,
      });
    });

    it('weights that add up to more than 100', async () => {
      expect(
        await attempt({
          suggestionsFitWeight: 70,
          suggestionsRotationWeight: 20,
          suggestionsExposureWeight: 15,
        }),
      ).toBeInstanceOf(BadRequestException);
    });

    it('a single weight changed on its own, which would break the sum with the stored ones', async () => {
      expect(await attempt({ suggestionsFitWeight: 70 })).toBeInstanceOf(
        BadRequestException,
      );
      expect(await attempt({ suggestionsExposureWeight: 5 })).toBeInstanceOf(
        BadRequestException,
      );
    });

    it('a fit below 50 even when the sum is right, if the DTO was bypassed', async () => {
      const failure = await attempt({
        suggestionsFitWeight: 40,
        suggestionsRotationWeight: 40,
        suggestionsExposureWeight: 20,
      });
      expect(failure).toBeInstanceOf(BadRequestException);
      expect(failure.getResponse()).toMatchObject({
        message: expect.stringContaining('at least 50') as unknown,
      });
    });
  });

  it('applies a valid set of weights and half-life', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValueOnce(settingsRow())
      .mockResolvedValueOnce(
        settingsRow({
          suggestions_fit_weight: 50,
          suggestions_rotation_weight: 30,
          suggestions_exposure_weight: 20,
          suggestions_half_life_days: 180,
        }),
      );
    const update = jest
      .spyOn(prisma.admin_settings, 'update')
      .mockResolvedValue({} as never);

    const result = await service.updateSettings(
      {
        suggestionsFitWeight: 50,
        suggestionsRotationWeight: 30,
        suggestionsExposureWeight: 20,
        suggestionsHalfLifeDays: 180,
      },
      admin,
    );

    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: 1 },
      data: {
        suggestions_fit_weight: 50,
        suggestions_rotation_weight: 30,
        suggestions_exposure_weight: 20,
        suggestions_half_life_days: 180,
      },
    });
    expect(result).toMatchObject({
      suggestionsFitWeight: 50,
      suggestionsHalfLifeDays: 180,
    });
  });

  it('allows the switch or the half-life to change without naming the weights', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValueOnce(settingsRow())
      .mockResolvedValueOnce(settingsRow({ suggestions_enabled: true }));
    jest.spyOn(prisma.admin_settings, 'update').mockResolvedValue({} as never);
    await expect(
      service.updateSettings({ suggestionsEnabled: true }, admin),
    ).resolves.toMatchObject({ suggestionsEnabled: true });
  });

  describe('the audit entry', () => {
    it('is the existing settings.updated entry, with the old and new value of each field that changed', async () => {
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValueOnce(settingsRow())
        .mockResolvedValueOnce(
          settingsRow({
            suggestions_enabled: true,
            suggestions_fit_weight: 50,
            suggestions_rotation_weight: 30,
            suggestions_exposure_weight: 20,
            suggestions_half_life_days: 30,
          }),
        );
      jest
        .spyOn(prisma.admin_settings, 'update')
        .mockResolvedValue({} as never);
      const audit = jest.spyOn(prisma.audit_entries, 'create');

      await service.updateSettings(
        {
          suggestionsEnabled: true,
          suggestionsFitWeight: 50,
          suggestionsRotationWeight: 30,
          suggestionsExposureWeight: 20,
          suggestionsHalfLifeDays: 30,
        },
        admin,
      );

      expect(audit).toHaveBeenCalledTimes(1);
      expect(audit.mock.calls[0][0]).toMatchObject({
        data: {
          action: 'settings.updated',
          target_type: 'settings',
          detail: {
            suggestionsEnabled: { from: false, to: true },
            suggestionsFitWeight: { from: 65, to: 50 },
            suggestionsRotationWeight: { from: 20, to: 30 },
            suggestionsExposureWeight: { from: 15, to: 20 },
            suggestionsHalfLifeDays: { from: 90, to: 30 },
          },
        },
      });
    });

    it('names only what changed, and writes none when nothing did', async () => {
      jest
        .spyOn(prisma.admin_settings, 'upsert')
        .mockResolvedValue(settingsRow());
      jest
        .spyOn(prisma.admin_settings, 'update')
        .mockResolvedValue({} as never);
      const audit = jest.spyOn(prisma.audit_entries, 'create');

      await service.updateSettings(
        { suggestionsHalfLifeDays: 90, suggestionsEnabled: false },
        admin,
      );
      expect(audit).not.toHaveBeenCalled();
    });
  });
});

describe('PATCH /admin/settings, who may change the Suggested speakers settings', () => {
  let app: INestApplication;
  let auth: AuthStandIn;
  let governance: { updateSettings: jest.Mock; settings: jest.Mock };

  const patch = (token: string | null, body: object) => {
    const call = request(app.getHttpServer() as Server).patch(
      '/admin/settings',
    );
    return (
      token === null ? call : call.set('Authorization', `Bearer ${token}`)
    ).send(body);
  };
  const body = {
    suggestionsFitWeight: 50,
    suggestionsRotationWeight: 30,
    suggestionsExposureWeight: 20,
  };

  beforeAll(async () => {
    auth = await startAuthStandIn();
  });
  afterAll(async () => {
    await auth.stop();
  });

  beforeEach(async () => {
    governance = {
      updateSettings: jest.fn().mockResolvedValue({}),
      settings: jest.fn(),
    };
    const module = await Test.createTestingModule({
      imports: auth.imports,
      controllers: [AdminController],
      providers: [
        ...auth.providers,
        { provide: GovernanceService, useValue: governance },
        { provide: AdminService, useValue: {} },
        { provide: SystemService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('answers 403 to a unit coordinator and a guest lecturer, and changes nothing', async () => {
    await patch(auth.tokenFor(['unit_coordinator']), body).expect(403);
    await patch(auth.tokenFor(['guest_speaker']), body).expect(403);
    await patch(auth.tokenFor([]), body).expect(403);
    expect(governance.updateSettings).not.toHaveBeenCalled();
  });

  it('answers 401 with no token or a forged one', async () => {
    await patch(null, body).expect(401);
    await patch(auth.forgedToken(['ccae_admin']), body).expect(401);
    expect(governance.updateSettings).not.toHaveBeenCalled();
  });

  it('lets a CCAE administrator through, passing their own id as the actor', async () => {
    await patch(auth.tokenFor(['ccae_admin'], 'auth0|the-admin'), body).expect(
      200,
    );
    expect(governance.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining(body),
      'auth0|the-admin',
    );
  });

  it('refuses null for any Suggested speakers setting with a 400, not a 500, before the service runs', async () => {
    const admin = auth.tokenFor(['ccae_admin']);
    for (const field of [
      'suggestionsEnabled',
      'suggestionsFitWeight',
      'suggestionsRotationWeight',
      'suggestionsExposureWeight',
      'suggestionsHalfLifeDays',
    ]) {
      await patch(admin, { [field]: null }).expect(400);
    }
    expect(governance.updateSettings).not.toHaveBeenCalled();
  });

  it('refuses a fit of 40, half-life of 10 or a non-integer with a 400 before the service runs', async () => {
    const admin = auth.tokenFor(['ccae_admin']);
    await patch(admin, { suggestionsFitWeight: 40 }).expect(400);
    await patch(admin, { suggestionsHalfLifeDays: 10 }).expect(400);
    await patch(admin, { suggestionsRotationWeight: 'lots' }).expect(400);
    expect(governance.updateSettings).not.toHaveBeenCalled();
  });
});
