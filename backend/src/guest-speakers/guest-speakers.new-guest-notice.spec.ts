import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { GuestSpeakersService } from './guest-speakers.service';

jest.mock('../notifications/push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

afterEach(() => jest.restoreAllMocks());

const consent = {
  profileMatchingConsent: true,
  informationAccurate: true,
  receiveUpdates: true,
  futureTeachingReuse: false,
  otherUnitsReuse: false,
  timeLimitedUse: true,
  termsAccepted: true,
};

/**
 * Finishing the profile is the point a guest lecturer first appears (once
 * approved, if approval is required), so it is when coordinators who share a
 * topic are told, and only the first time.
 */
function setUp(options: {
  consentBefore: boolean | null;
  suggestionsEnabled?: boolean;
  approvalRequired?: boolean;
  listed?: boolean;
}) {
  jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
    id: 1,
    suggestions_enabled: options.suggestionsEnabled ?? true,
    require_admin_approval: options.approvalRequired ?? false,
  } as never);
  jest
    .spyOn(prisma.users, 'findUnique')
    .mockResolvedValueOnce({ consentstate: options.consentBefore } as never);
  const update = jest.spyOn(prisma.users, 'update');
  const subject = jest
    .spyOn(prisma.guests, 'findFirst')
    .mockResolvedValue(
      options.listed === false ? null : ({ user_id: 1n } as never),
    );
  jest
    .spyOn(prisma.user_expertise, 'findMany')
    .mockResolvedValue([{ expertise: 'Economics' }] as never);
  const recipients = jest
    .spyOn(prisma.coordinators, 'findMany')
    .mockResolvedValue([{ user_id: 11n }, { user_id: 12n }] as never);
  jest.spyOn(prisma.notifications, 'findMany').mockResolvedValue([] as never);
  const insert = jest
    .spyOn(prisma.notifications, 'createMany')
    .mockResolvedValue({ count: 2 });
  return { update, subject, recipients, insert };
}

describe('GuestSpeakersService.saveConsent notices', () => {
  const service = new GuestSpeakersService();

  it('tells the coordinators who share a topic when a profile is finished for the first time', async () => {
    const { update, insert } = setUp({ consentBefore: null });

    await service.saveConsent('auth0|guest', consent);

    expect(update).toHaveBeenCalledWith({
      where: { userid: 1n },
      data: { consentstate: true },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const { data } = insert.mock.calls[0][0] as {
      data: { user_id: bigint; title: string; href: string }[];
    };
    expect(data.map((row) => row.user_id)).toEqual([11n, 12n]);
    expect(data[0]).toMatchObject({
      title: 'New suggested speakers match your topics',
      href: '/unit_coordinator/suggestions',
    });
  });

  it('also counts a profile whose consent was saved as false before', async () => {
    const { insert } = setUp({ consentBefore: false });

    await service.saveConsent('auth0|guest', consent);

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('tells no one when consent is saved again', async () => {
    const { update, subject, recipients, insert } = setUp({
      consentBefore: true,
    });

    await service.saveConsent('auth0|guest', consent);

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

    await service.saveConsent('auth0|guest', consent);

    expect(update).toHaveBeenCalledTimes(1);
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one while the profile is still waiting for approval', async () => {
    // The shared visibility rule does not list an unapproved guest, so the
    // profile is not found and no coordinator is told.
    const { subject, recipients, insert } = setUp({
      consentBefore: null,
      approvalRequired: true,
      listed: false,
    });

    await service.saveConsent('auth0|guest', consent);

    expect(subject.mock.calls[0][0]).toMatchObject({
      where: { AND: [{ approved_at: { not: null } }, {}] },
    });
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('still saves the consent when the notice cannot be raised', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { update, recipients } = setUp({ consentBefore: null });
    recipients.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.saveConsent('auth0|guest', consent),
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
