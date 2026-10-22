import { Logger } from '@nestjs/common';
import { prisma } from '../prisma';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  answerTopicQuery,
  useLockingNoticeTable,
  useNoticeTransaction,
} from '../testing/notice-transaction';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';

jest.mock('../notifications/push', () => ({
  pushToUsers: jest.fn(() => Promise.resolve(0)),
}));

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MATCHING_SUGGESTIONS_ENABLED;
});

/**
 * While approval is required, an administrator approving a guest lecturer for
 * the first time is what makes the profile visible, so it is when coordinators
 * who share a topic are told.
 */
function setUp(options: {
  /** What the approval finds: 1 when the profile was not yet approved, 0 when it was. */
  firstTime: boolean;
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
    users: options.hasAccount === false ? null : { auth0Id: 'auth0|guest' },
  } as never);
  const approve = jest
    .spyOn(prisma.guests, 'updateMany')
    .mockResolvedValue({ count: options.firstTime ? 1 : 0 });
  const refresh = jest
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
  answerTopicQuery([11n, 12n]);
  const recipients = jest
    .spyOn(prisma.coordinators, 'findMany')
    .mockResolvedValue([{ user_id: 11n }, { user_id: 12n }] as never);
  const { insert } = useNoticeTransaction();
  return { approve, refresh, subject, recipients, insert };
}

describe('GovernanceService.approve notices', () => {
  const service = new GovernanceService(
    new AdminService(),
    new MatchRequestsService(new NotificationsService()),
  );

  it('tells the coordinators who share a topic when a finished profile is approved for the first time', async () => {
    const { approve, refresh, insert } = setUp({ firstTime: true });

    await expect(service.approve('3', 'auth0|admin')).resolves.toMatchObject({
      guestId: '3',
    });

    // One statement approves and says whether it was the first time.
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0][0]).toMatchObject({
      where: { guest_id: 3n, approved_at: null },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    const { data } = insert.mock.calls[0][0];
    expect(data.map((row) => row.user_id)).toEqual([11n, 12n]);
    expect(data[0].href).toBe('/unit_coordinator/suggestions');
  });

  it('answers with the approval date on the first approval', async () => {
    setUp({ firstTime: true });

    const answer = await service.approve('3', 'auth0|admin');

    expect(answer.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('tells no one when an approved profile is approved again, and only refreshes the date', async () => {
    const { subject, refresh, insert } = setUp({ firstTime: false });

    await expect(service.approve('3', 'auth0|admin')).resolves.toMatchObject({
      guestId: '3',
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(subject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one when approval is not required, because the profile was already visible', async () => {
    const { subject, insert } = setUp({
      firstTime: true,
      approvalRequired: false,
    });

    await service.approve('3', 'auth0|admin');

    expect(subject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one while Suggested speakers is off', async () => {
    const { recipients, insert } = setUp({
      firstTime: true,
      suggestionsEnabled: false,
    });

    await service.approve('3', 'auth0|admin');

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one when the server has Suggested speakers off, whatever the setting says', async () => {
    process.env.MATCHING_SUGGESTIONS_ENABLED = 'false';
    const { subject, recipients, insert } = setUp({ firstTime: true });

    await service.approve('3', 'auth0|admin');

    expect(subject).not.toHaveBeenCalled();
    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one for a profile that is not finished yet; finishing it will', async () => {
    const { recipients, insert } = setUp({ firstTime: true, complete: false });

    await service.approve('3', 'auth0|admin');

    expect(recipients).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells no one for a profile with no account behind it', async () => {
    const { subject, insert } = setUp({ firstTime: true, hasAccount: false });

    await service.approve('3', 'auth0|admin');

    expect(subject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('tells the coordinators once when two administrators approve the same profile at the same moment', async () => {
    const { approve, refresh, recipients } = setUp({ firstTime: true });
    // The database lets one of the two approvals match; the other finds it approved.
    approve
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { rows } = useLockingNoticeTable();

    await Promise.all([
      service.approve('3', 'auth0|admin'),
      service.approve('3', 'auth0|admin-two'),
    ]);

    expect(approve).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Only the approval that matched went on to look for people to tell.
    expect(recipients).toHaveBeenCalledTimes(1);
    expect(rows.map((row) => row.user_id)).toEqual([11n, 12n]);
  });

  it('still approves and answers when the notice cannot be raised', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { approve, recipients } = setUp({ firstTime: true });
    recipients.mockRejectedValue(new Error('connection lost'));

    await expect(service.approve('3', 'auth0|admin')).resolves.toMatchObject({
      guestId: '3',
    });
    expect(approve).toHaveBeenCalledTimes(1);
  });
});
