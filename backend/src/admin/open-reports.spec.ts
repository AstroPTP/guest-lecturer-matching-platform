import { prisma } from '../prisma';
import {
  blocksReportedUser,
  findOpenReports,
  notReportedWhere,
  openReportedUserIds,
} from './open-reports';

afterEach(() => jest.restoreAllMocks());

const report = (
  id: bigint,
  target: string | null,
  detail: unknown = { reason: 'asked for money', matchId: '6001' },
) => ({
  entry_id: id,
  target_id: target,
  detail,
  actor: null,
});

/** Reports first, then whichever decisions the second read should return. */
function stubAudit(reports: unknown[], resolvedReportIds: string[] = []) {
  return jest
    .spyOn(prisma.audit_entries, 'findMany')
    .mockResolvedValueOnce(reports as never)
    .mockResolvedValueOnce(
      resolvedReportIds.map((target_id) => ({ target_id })) as never,
    );
}

describe('blocksReportedUser', () => {
  it('is true only for a report raised through a match', () => {
    expect(blocksReportedUser({ reason: 'x', matchId: '6001' })).toBe(true);
    expect(blocksReportedUser({ reason: 'x' })).toBe(false);
    expect(blocksReportedUser({ reason: 'x', matchId: '' })).toBe(false);
    expect(blocksReportedUser({ reason: 'x', matchId: 6001 })).toBe(false);
    expect(blocksReportedUser(null)).toBe(false);
    expect(blocksReportedUser('matchId')).toBe(false);
  });
});

describe('findOpenReports', () => {
  it('asks for nothing more when nobody has been reported', async () => {
    const find = stubAudit([]);

    await expect(findOpenReports()).resolves.toEqual([]);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0]).toMatchObject({
      where: { action: 'user.reported' },
    });
  });

  it('reads only the decisions about the reports it found', async () => {
    const find = stubAudit([report(4n, '7'), report(9n, '8')]);

    await findOpenReports();

    expect(find.mock.calls[1][0]).toMatchObject({
      where: { action: 'report.resolved', target_id: { in: ['4', '9'] } },
    });
  });

  it('leaves out a report once an administrator has decided it', async () => {
    stubAudit([report(4n, '7'), report(9n, '8')], ['4']);

    const open = await findOpenReports();

    expect(open.map((r) => r.entry_id)).toEqual([9n]);
  });
});

describe('openReportedUserIds', () => {
  it('is empty when there are no reports', async () => {
    stubAudit([]);
    expect((await openReportedUserIds()).size).toBe(0);
  });

  it('holds the person named by a report nobody has decided', async () => {
    stubAudit([report(4n, '7')]);

    const ids = await openReportedUserIds();

    expect(ids.has(7n)).toBe(true);
    expect(ids.size).toBe(1);
  });

  it('lets the person back in once the report is dismissed', async () => {
    stubAudit([report(4n, '7')], ['4']);
    expect((await openReportedUserIds()).has(7n)).toBe(false);
  });

  it('keeps blocking while a second report about them is still open', async () => {
    stubAudit([report(4n, '7'), report(5n, '7')], ['4']);
    expect((await openReportedUserIds()).has(7n)).toBe(true);
  });

  it('does not let a report with no match behind it block anyone', async () => {
    stubAudit([report(4n, '7', { reason: 'no match behind this' })]);
    expect((await openReportedUserIds()).size).toBe(0);
  });

  it('skips a report whose target is not a user id', async () => {
    stubAudit([report(4n, 'not-a-number'), report(5n, null), report(6n, '9')]);

    const ids = await openReportedUserIds();

    expect([...ids]).toEqual([9n]);
  });
});

describe('notReportedWhere', () => {
  it('excludes reported users but keeps profiles with no account', async () => {
    stubAudit([report(4n, '7'), report(5n, '12')]);

    await expect(notReportedWhere()).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [7n, 12n] } }],
    });
  });

  it('excludes nobody when nobody is reported', async () => {
    stubAudit([]);

    await expect(notReportedWhere()).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [] } }],
    });
  });
});
