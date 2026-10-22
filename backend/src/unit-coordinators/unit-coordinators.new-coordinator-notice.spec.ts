import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { ConsentDto } from './dto/consent.dto';
import { UnitCoordinatorsService } from './unit-coordinators.service';

jest.mock('../notifications/push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

afterEach(() => jest.restoreAllMocks());

const consent: ConsentDto = {
  detailsMatchingConsent: true,
  informationAccurate: true,
  receiveUpdates: true,
  useWithinAgreedScope: true,
  noExternalRedistribution: true,
  studentPrivacyCompliance: true,
  termsAccepted: true,
};

/**
 * Finishing the profile is the point a unit coordinator first appears, so it
 * is when guest lecturers who share a topic are told, and only the first time.
 */
function setUp(options: {
  consentBefore: boolean | null;
  suggestionsEnabled?: boolean;
  listed?: boolean;
}) {
  jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
    id: 1,
    suggestions_enabled: options.suggestionsEnabled ?? true,
    require_admin_approval: false,
  } as never);
  jest
    .spyOn(prisma.users, 'findUnique')
    .mockResolvedValueOnce({ consentstate: options.consentBefore } as never);
  const update = jest.spyOn(prisma.users, 'update');
  const subject = jest
    .spyOn(prisma.coordinators, 'findFirst')
    .mockResolvedValue(
      options.listed === false ? null : ({ user_id: 1n } as never),
    );
  jest
    .spyOn(prisma.user_expertise, 'findMany')
    .mockResolvedValue([{ expertise: 'Accounting' }] as never);
  const recipients = jest
    .spyOn(prisma.guests, 'findMany')
    .mockResolvedValue([{ user_id: 71n }, { user_id: 72n }] as never);
  jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([] as never);
  const insert = jest
    .spyOn(prisma.notifications, 'createMany')
    .mockResolvedValue({ count: 2 });
  return { update, subject, recipients, insert };
}

describe('UnitCoordinatorsService.saveConsent notices', () => {
  const service = new UnitCoordinatorsService();

  it('tells the guest lecturers who share a topic when a profile is finished for the first time', async () => {
    const { update, insert } = setUp({ consentBefore: null });

    await service.saveConsent('auth0|coord', consent);

    expect(update).toHaveBeenCalledWith({
      where: { userid: 1n },
      data: { consentstate: true },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const { data } = insert.mock.calls[0][0] as {
      data: { user_id: bigint; title: string; href: string }[];
    };
    expect(data.map((row) => row.user_id)).toEqual([71n, 72n]);
    expect(data[0]).toMatchObject({
      title: 'New units match your expertise',
      href: '/guest_lecturer/discovery',
    });
  });

  it('tells no one when consent is saved again', async () => {
    const { update, subject, recipients, insert } = setUp({
      consentBefore: true,
    });

    await service.saveConsent('auth0|coord', consent);

    expect(update).toHaveBeenCalledTimes(1);
    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one while Suggested speakers is off', async () => {
    const { update, recipients, insert } = setUp({
      consentBefore: null,
      suggestionsEnabled: false,
    });

    await service.saveConsent('auth0|coord', consent);

    expect(update).toHaveBeenCalledTimes(1);
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one for a coordinator Discovery does not list', async () => {
    const { recipients, insert } = setUp({
      consentBefore: null,
      listed: false,
    });

    await service.saveConsent('auth0|coord', consent);

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('still saves the consent when the notice cannot be raised', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { update, recipients } = setUp({ consentBefore: null });
    recipients.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.saveConsent('auth0|coord', consent),
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
