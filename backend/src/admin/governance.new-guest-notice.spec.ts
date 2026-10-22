import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';

jest.mock('../notifications/push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

afterEach(() => jest.restoreAllMocks());

/**
 * While approval is required, an administrator approving a guest lecturer for
 * the first time is what makes the profile visible, so it is when coordinators
 * who share a topic are told.
 */
function setUp(options: {
  approvedBefore: Date | null;
  approvalRequired?: boolean;
  suggestionsEnabled?: boolean;
  hasAccount?: boolean;
  complete?: boolean;
}) {
  jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue({
    id: 1,
    suggestions_enabled: options.suggestionsEnabled ?? true,
    require_admin_approval: options.approvalRequired ?? true,
  } as never);
  jest.spyOn(prisma.guests, 'findUnique').mockResolvedValue({
    guest_id: 3n,
    approved_at: options.approvedBefore,
    users: options.hasAccount === false ? null : { auth0Id: 'auth0|guest' },
  } as never);
  jest
    .spyOn(prisma.guests, 'update')
    .mockResolvedValue({ guest_id: 3n, approved_at: new Date() } as never);
  const subject = jest
    .spyOn(prisma.guests, 'findFirst')
    .mockResolvedValue(
      options.complete === false ? null : ({ user_id: 31n } as never),
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
  return { subject, recipients, insert };
}

describe('GovernanceService.approve notices', () => {
  const service = new GovernanceService(
    new AdminService(),
    new MatchRequestsService(new NotificationsService()),
  );

  it('tells the coordinators who share a topic when a finished profile is approved for the first time', async () => {
    const { insert } = setUp({ approvedBefore: null });

    await expect(service.approve('3', 'auth0|admin')).resolves.toMatchObject({
      guestId: '3',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const { data } = insert.mock.calls[0][0] as {
      data: { user_id: bigint; href: string }[];
    };
    expect(data.map((row) => row.user_id)).toEqual([11n, 12n]);
    expect(data[0].href).toBe('/unit_coordinator/suggestions');
  });

  it('tells no one when an approved profile is approved again', async () => {
    const { subject, insert } = setUp({
      approvedBefore: new Date('2026-10-01T00:00:00Z'),
    });

    await service.approve('3', 'auth0|admin');

    expect(subject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one when approval is not required, because the profile was already visible', async () => {
    const { subject, insert } = setUp({
      approvedBefore: null,
      approvalRequired: false,
    });

    await service.approve('3', 'auth0|admin');

    expect(subject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one while Suggested speakers is off', async () => {
    const { recipients, insert } = setUp({
      approvedBefore: null,
      suggestionsEnabled: false,
    });

    await service.approve('3', 'auth0|admin');

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one for a profile that is not finished yet; finishing it will', async () => {
    const { recipients, insert } = setUp({
      approvedBefore: null,
      complete: false,
    });

    await service.approve('3', 'auth0|admin');

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one for a profile with no account behind it', async () => {
    const { subject, insert } = setUp({
      approvedBefore: null,
      hasAccount: false,
    });

    await service.approve('3', 'auth0|admin');

    expect(subject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('still approves and answers when the notice cannot be raised', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { recipients } = setUp({ approvedBefore: null });
    recipients.mockRejectedValue(new Error('connection lost'));
    const update = jest.spyOn(prisma.guests, 'update');

    await expect(service.approve('3', 'auth0|admin')).resolves.toMatchObject({
      guestId: '3',
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
