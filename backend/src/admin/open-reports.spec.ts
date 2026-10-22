import { ConflictException } from '@nestjs/common';
import { prisma } from '../prisma';
import {
  DEFAULT_REPORT_HOLD_THRESHOLD,
  assertReporterWithinLimits,
  findOpenReports,
  isConversationPaused,
  isMatchReport,
  loadModerationState,
  notHiddenWhere,
  readReportHoldThreshold,
  type OpenReport,
} from './open-reports';

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.REPORT_HOLD_THRESHOLD;
});

/** A report by `actor` about `target`; raised through a match unless told otherwise. */
const report = (
  id: bigint,
  actor: bigint | null,
  target: string | null,
  detail: unknown = { reason: 'asked for money', matchId: '6001' },
) => ({
  entry_id: id,
  actor_user_id: actor,
  target_id: target,
  detail,
  actor: null,
});

const held = (target: string) => ({ action: 'user.held', target_id: target });
const released = (target: string) => ({
  action: 'user.released',
  target_id: target,
});

/**
 * What the audit trail holds: the reports, then the decisions about them, then
 * the administrator's holds and releases in the order they were made.
 */
function stubAudit(
  reports: unknown[],
  resolvedReportIds: string[] = [],
  marks: unknown[] = [],
) {
  return jest
    .spyOn(prisma.audit_entries, 'findMany')
    .mockResolvedValueOnce(reports as never)
    .mockResolvedValueOnce(
      resolvedReportIds.map((target_id) => ({ target_id })) as never,
    )
    .mockResolvedValueOnce(marks as never);
}

describe('readReportHoldThreshold', () => {
  it('defaults to 2 when unset, blank or not a whole number', () => {
    expect(DEFAULT_REPORT_HOLD_THRESHOLD).toBe(2);
    for (const value of [undefined, '', '  ', 'two', '2.5', '-3', '3 people']) {
      expect(readReportHoldThreshold({ REPORT_HOLD_THRESHOLD: value })).toBe(2);
    }
  });

  it('raises 0 to the minimum of 1 and honours a larger value', () => {
    expect(readReportHoldThreshold({ REPORT_HOLD_THRESHOLD: '0' })).toBe(1);
    expect(readReportHoldThreshold({ REPORT_HOLD_THRESHOLD: '1' })).toBe(1);
    expect(readReportHoldThreshold({ REPORT_HOLD_THRESHOLD: ' 4 ' })).toBe(4);
  });

  it('reads the real environment at the moment of use', () => {
    process.env.REPORT_HOLD_THRESHOLD = '5';
    expect(readReportHoldThreshold()).toBe(5);
  });
});

describe('isMatchReport', () => {
  it('is true only for a report raised through a match', () => {
    expect(isMatchReport({ reason: 'x', matchId: '6001' })).toBe(true);
    expect(isMatchReport({ reason: 'x' })).toBe(false);
    expect(isMatchReport({ reason: 'x', matchId: '' })).toBe(false);
    expect(isMatchReport({ reason: 'x', matchId: 6001 })).toBe(false);
    expect(isMatchReport(null)).toBe(false);
    expect(isMatchReport('matchId')).toBe(false);
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
    const find = stubAudit([report(4n, 1n, '7'), report(9n, 2n, '8')]);

    await findOpenReports();

    expect(find.mock.calls[1][0]).toMatchObject({
      where: { action: 'report.resolved', target_id: { in: ['4', '9'] } },
    });
  });

  it('leaves out a report once an administrator has decided it', async () => {
    stubAudit([report(4n, 1n, '7'), report(9n, 2n, '8')], ['4']);

    const open = await findOpenReports();

    expect(open.map((r) => r.entry_id)).toEqual([9n]);
  });
});

describe('loadModerationState', () => {
  it('reads once and finds nothing when nobody has been reported', async () => {
    const find = stubAudit([]);

    const state = await loadModerationState();

    expect(find).toHaveBeenCalledTimes(1);
    expect(state.held.size).toBe(0);
    expect(state.blockedWith.size).toBe(0);
  });

  describe('the pair block', () => {
    it('blocks the reporter and the person reported from each other, both ways', async () => {
      stubAudit([report(4n, 3n, '7')]);

      const { blockedWith } = await loadModerationState();

      expect(blockedWith.get(3n)).toEqual(new Set([7n]));
      expect(blockedWith.get(7n)).toEqual(new Set([3n]));
    });

    it('blocks nobody else, and does not hold anyone on a single report', async () => {
      stubAudit([report(4n, 3n, '7')]);

      const state = await loadModerationState();

      expect(state.blockedWith.has(9n)).toBe(false);
      expect(state.held.size).toBe(0);
    });

    it('also blocks a pair when the report came without a match', async () => {
      stubAudit([report(4n, 3n, '7', { reason: 'no match behind this' })]);

      const { blockedWith } = await loadModerationState();

      expect(blockedWith.get(3n)).toEqual(new Set([7n]));
    });

    it('lifts the block once the report is decided', async () => {
      stubAudit([report(4n, 3n, '7')], ['4']);

      const { blockedWith } = await loadModerationState();

      expect(blockedWith.size).toBe(0);
    });

    it('skips a report with no reporter or a target that is not a user id', async () => {
      stubAudit([
        report(4n, null, '7'),
        report(5n, 3n, 'not-a-number'),
        report(6n, 3n, null),
      ]);

      const { blockedWith } = await loadModerationState();

      expect(blockedWith.size).toBe(0);
    });
  });

  describe('the hold from reports', () => {
    it('holds a person reported by two different people', async () => {
      stubAudit([report(4n, 3n, '7'), report(5n, 4n, '7')]);

      const state = await loadModerationState();

      expect(state.held.get(7n)).toEqual(['threshold']);
      expect(state.reporters.get(7n)).toEqual(new Set([3n, 4n]));
    });

    it('counts different people, not reports', async () => {
      stubAudit([report(4n, 3n, '7'), report(5n, 3n, '7')]);

      const state = await loadModerationState();

      expect(state.held.size).toBe(0);
    });

    it('does not count a report that came without a match', async () => {
      stubAudit([
        report(4n, 3n, '7'),
        report(5n, 4n, '7', { reason: 'no match behind this' }),
      ]);

      expect((await loadModerationState()).held.size).toBe(0);
    });

    it('does not count a report whose reporter is gone', async () => {
      stubAudit([report(4n, 3n, '7'), report(5n, null, '7')]);

      expect((await loadModerationState()).held.size).toBe(0);
    });

    it('uses the threshold from the environment', async () => {
      process.env.REPORT_HOLD_THRESHOLD = '3';
      stubAudit([report(4n, 3n, '7'), report(5n, 4n, '7')]);
      expect((await loadModerationState()).held.size).toBe(0);

      stubAudit([
        report(4n, 3n, '7'),
        report(5n, 4n, '7'),
        report(6n, 5n, '7'),
      ]);
      const state = await loadModerationState();
      expect(state.threshold).toBe(3);
      expect(state.held.get(7n)).toEqual(['threshold']);
    });

    it('holds on a single report when the threshold is 1', async () => {
      process.env.REPORT_HOLD_THRESHOLD = '1';
      stubAudit([report(4n, 3n, '7')]);

      expect((await loadModerationState()).held.get(7n)).toEqual(['threshold']);
    });

    it('lets the person go once a dismissal drops them under the threshold', async () => {
      stubAudit([report(4n, 3n, '7'), report(5n, 4n, '7')], ['4']);

      expect((await loadModerationState()).held.size).toBe(0);
    });
  });

  describe('the hold from an administrator', () => {
    it('holds a person with one open report', async () => {
      stubAudit([report(4n, 3n, '7')], [], [held('7')]);

      const state = await loadModerationState();

      expect(state.held.get(7n)).toEqual(['admin']);
    });

    it('says both reasons when the threshold also applies', async () => {
      stubAudit([report(4n, 3n, '7'), report(5n, 4n, '7')], [], [held('7')]);

      expect((await loadModerationState()).held.get(7n)).toEqual([
        'threshold',
        'admin',
      ]);
    });

    it('ends when the administrator releases them', async () => {
      stubAudit([report(4n, 3n, '7')], [], [held('7'), released('7')]);

      expect((await loadModerationState()).held.size).toBe(0);
    });

    it('goes by the latest of the holds and releases', async () => {
      stubAudit(
        [report(4n, 3n, '7')],
        [],
        [held('7'), released('7'), held('7')],
      );

      expect((await loadModerationState()).held.has(7n)).toBe(true);
    });

    it('holds only the person named, not whoever else is reported', async () => {
      stubAudit([report(4n, 3n, '7'), report(5n, 3n, '8')], [], [held('7')]);

      const state = await loadModerationState();

      expect([...state.held.keys()]).toEqual([7n]);
    });

    it('means nothing once the person has no open report left', async () => {
      stubAudit([report(4n, 3n, '8')], [], [held('7')]);

      expect((await loadModerationState()).held.has(7n)).toBe(false);
    });
  });
});

describe('isConversationPaused', () => {
  async function stateFor(
    reports: unknown[],
    resolved: string[] = [],
    marks: unknown[] = [],
  ) {
    stubAudit(reports, resolved, marks);
    return loadModerationState();
  }

  it('pauses the pair in both directions and nobody else', async () => {
    const state = await stateFor([report(4n, 3n, '7')]);

    expect(isConversationPaused(state, 3n, 7n)).toBe(true);
    expect(isConversationPaused(state, 7n, 3n)).toBe(true);
    // Each of them can still talk to everyone else.
    expect(isConversationPaused(state, 3n, 9n)).toBe(false);
    expect(isConversationPaused(state, 9n, 7n)).toBe(false);
    expect(isConversationPaused(state, 9n, 8n)).toBe(false);
  });

  it('pauses a held person with everyone, sending or receiving', async () => {
    const state = await stateFor([report(4n, 3n, '7'), report(5n, 4n, '7')]);

    expect(isConversationPaused(state, 9n, 7n)).toBe(true);
    expect(isConversationPaused(state, 7n, 9n)).toBe(true);
    expect(isConversationPaused(state, 9n, 8n)).toBe(false);
  });

  it('pauses a person an administrator holds', async () => {
    const state = await stateFor([report(4n, 3n, '7')], [], [held('7')]);

    expect(isConversationPaused(state, 9n, 7n)).toBe(true);
    expect(isConversationPaused(state, 7n, 9n)).toBe(true);
  });

  it('opens again after a dismissal', async () => {
    const state = await stateFor([report(4n, 3n, '7')], ['4']);

    expect(isConversationPaused(state, 3n, 7n)).toBe(false);
  });

  it('cannot tell when the other profile has no account', async () => {
    const state = await stateFor([report(4n, 3n, '7')]);

    expect(isConversationPaused(state, 3n, null)).toBe(false);
  });
});

describe('notHiddenWhere', () => {
  // The test double resolves every signed-in viewer to user 1.
  it('hides from the viewer the people they have an open report with, whoever made it', async () => {
    stubAudit([report(4n, 1n, '7'), report(5n, 8n, '1')]);

    await expect(notHiddenWhere('auth0|viewer')).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [7n, 8n] } }],
    });
  });

  it('leaves a pair block out of everyone else’s Discovery', async () => {
    stubAudit([report(4n, 3n, '7')]);

    await expect(notHiddenWhere('auth0|viewer')).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [] } }],
    });
  });

  it('hides a held person from everyone', async () => {
    stubAudit([report(4n, 3n, '7'), report(5n, 4n, '7')]);

    await expect(notHiddenWhere('auth0|viewer')).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [7n] } }],
    });
  });

  it('hides a person an administrator holds from everyone', async () => {
    stubAudit([report(4n, 3n, '7')], [], [held('7')]);

    await expect(notHiddenWhere('auth0|viewer')).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [7n] } }],
    });
  });

  it('hides only held people when there is no viewer', async () => {
    stubAudit([report(4n, 1n, '7'), report(5n, 4n, '9'), report(6n, 5n, '9')]);

    await expect(notHiddenWhere()).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [9n] } }],
    });
  });

  it('keeps profiles with no account and excludes nobody when nobody is reported', async () => {
    stubAudit([]);

    await expect(notHiddenWhere('auth0|viewer')).resolves.toEqual({
      OR: [{ user_id: null }, { user_id: { notIn: [] } }],
    });
  });
});

describe('assertReporterWithinLimits', () => {
  const open = (pairs: [reporter: bigint, reported: string][]): OpenReport[] =>
    pairs.map(([actor, target], i) =>
      report(BigInt(i + 1), actor, target),
    ) as unknown as OpenReport[];

  /** What the call throws, so its code can be checked as well as its type. */
  function thrownBy(call: () => void): unknown {
    try {
      call();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('lets a first report through', () => {
    expect(() => assertReporterWithinLimits([], 1n, 7n)).not.toThrow();
  });

  it('refuses a second open report about the same person', () => {
    const error = thrownBy(() =>
      assertReporterWithinLimits(open([[1n, '7']]), 1n, 7n),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({ response: { code: 'REPORT_ALREADY_OPEN' } });
  });

  it('lets someone else report the same person', () => {
    expect(() =>
      assertReporterWithinLimits(open([[2n, '7']]), 1n, 7n),
    ).not.toThrow();
  });

  it('lets a person have five open reports and refuses the sixth', () => {
    const four = open([
      [1n, '11'],
      [1n, '12'],
      [1n, '13'],
      [1n, '14'],
    ]);
    expect(() => assertReporterWithinLimits(four, 1n, 7n)).not.toThrow();

    const five = open([
      [1n, '11'],
      [1n, '12'],
      [1n, '13'],
      [1n, '14'],
      [1n, '15'],
    ]);
    const error = thrownBy(() => assertReporterWithinLimits(five, 1n, 7n));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({ response: { code: 'REPORT_LIMIT_REACHED' } });
  });

  it('counts only that reporter’s own open reports', () => {
    const others = open([
      [2n, '11'],
      [2n, '12'],
      [2n, '13'],
      [2n, '14'],
      [2n, '15'],
      [2n, '16'],
    ]);

    expect(() => assertReporterWithinLimits(others, 1n, 7n)).not.toThrow();
  });
});
