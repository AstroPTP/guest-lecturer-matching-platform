import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import {
  answerTopicQuery,
  useLockingNoticeTable,
  useNoticeTransaction,
} from '../testing/notice-transaction';
import { ConsentDto } from './dto/consent.dto';
import { UnitCoordinatorsService } from './unit-coordinators.service';

jest.mock('../notifications/push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MATCHING_SUGGESTIONS_ENABLED;
});

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
  /** What the save finds: 1 when consent was not yet true, 0 when it was. */
  firstTime: boolean;
  suggestionsEnabled?: boolean;
  listed?: boolean;
}) {
  jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
    id: 1,
    suggestions_enabled: options.suggestionsEnabled ?? true,
    require_admin_approval: false,
  } as never);
  const update = jest
    .spyOn(prisma.users, 'updateMany')
    .mockResolvedValue({ count: options.firstTime ? 1 : 0 });
  const subject = jest
    .spyOn(prisma.coordinators, 'findFirst')
    .mockResolvedValue(
      options.listed === false ? null : ({ user_id: 1n } as never),
    );
  jest
    .spyOn(prisma.user_expertise, 'findMany')
    .mockResolvedValue([{ expertise: 'Accounting' }] as never);
  answerTopicQuery([71n, 72n]);
  const recipients = jest
    .spyOn(prisma.guests, 'findMany')
    .mockResolvedValue([{ user_id: 71n }, { user_id: 72n }] as never);
  const { insert } = useNoticeTransaction();
  return { update, subject, recipients, insert };
}

describe('UnitCoordinatorsService.saveConsent notices', () => {
  const service = new UnitCoordinatorsService();

  it('tells the guest lecturers who share a topic when a profile is finished for the first time', async () => {
    const { update, insert } = setUp({ firstTime: true });

    await service.saveConsent('auth0|coord', consent);

    // One statement saves the consent and says whether it was the first time.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: {
        userid: 1n,
        OR: [{ consentstate: null }, { consentstate: false }],
      },
      data: { consentstate: true },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const { data } = insert.mock.calls[0][0];
    expect(data.map((row) => row.user_id)).toEqual([71n, 72n]);
    expect(data[0]).toMatchObject({
      title: 'New units match your expertise',
      href: '/guest_lecturer/discovery',
    });
  });

  it('tells no one when consent is saved again', async () => {
    const { update, subject, recipients, insert } = setUp({
      firstTime: false,
    });

    await service.saveConsent('auth0|coord', consent);

    expect(update).toHaveBeenCalledTimes(1);
    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one while Suggested speakers is off', async () => {
    const { update, recipients, insert } = setUp({
      firstTime: true,
      suggestionsEnabled: false,
    });

    await service.saveConsent('auth0|coord', consent);

    expect(update).toHaveBeenCalledTimes(1);
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one when the server has Suggested speakers off, whatever the setting says', async () => {
    process.env.MATCHING_SUGGESTIONS_ENABLED = 'false';
    const { update, subject, recipients, insert } = setUp({ firstTime: true });

    await service.saveConsent('auth0|coord', consent);

    expect(update).toHaveBeenCalledTimes(1);
    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one for a coordinator Discovery does not list', async () => {
    const { recipients, insert } = setUp({ firstTime: true, listed: false });

    await service.saveConsent('auth0|coord', consent);

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells the guest lecturers once when the same profile is finished twice at the same moment', async () => {
    const { update, recipients } = setUp({ firstTime: true });
    // The database lets one of the two saves match; the other finds consent already true.
    update
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { rows } = useLockingNoticeTable();

    await Promise.all([
      service.saveConsent('auth0|coord', consent),
      service.saveConsent('auth0|coord', consent),
    ]);

    expect(update).toHaveBeenCalledTimes(2);
    // Only the save that matched went on to look for people to tell.
    expect(recipients).toHaveBeenCalledTimes(1);
    expect(rows.map((row) => row.user_id)).toEqual([71n, 72n]);
  });

  it('still saves the consent when the notice cannot be raised', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { update, recipients } = setUp({ firstTime: true });
    recipients.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.saveConsent('auth0|coord', consent),
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
