import { ConflictException } from '@nestjs/common';
import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
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

/** A hold the administrator placed while `reportIds` were open about `target`. */
const held = (target: string, ...reportIds: string[]) => ({
  action: 'user.held',
  target_id: target,
  detail: { reportIds },
});
const released = (target: string) => ({
  action: 'user.released',
  target_id: target,
});

/**
 * What the audit trail holds: the open-reports query, which already leaves out
 * the reports a decision was made about, and then the administrator's holds
 * and releases in the order they were made.
 */
function stubAudit(
  reports: ReturnType<typeof report>[],
  resolvedReportIds: string[] = [],
  marks: unknown[] = [],
) {
  const open = reports.filter(
    (r) => !resolvedReportIds.includes(`${r.entry_id}`),
  );
  stubOpenReports(open);
  return jest
    .spyOn(prisma.audit_entries, 'findMany')
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
  /** The statement the open-reports query ran, with its placeholders blanked. */
  const sqlOf = (query: jest.SpyInstance) =>
    (query.mock.calls[0] as [TemplateStringsArray])[0]
      .join('?')
      .replace(/\s+/g, ' ');

  it('asks for nothing more when nobody has been reported', async () => {
    const query = jest.spyOn(prisma, '$queryRaw');
    const marks = jest.spyOn(prisma.audit_entries, 'findMany');

    await expect(findOpenReports()).resolves.toEqual([]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(marks).not.toHaveBeenCalled();
  });

  it('finds the open reports in one statement, however many there are', async () => {
    const query = stubOpenReports([report(4n, 1n, '7'), report(9n, 2n, '8')]);
    const reads = jest.spyOn(prisma.audit_entries, 'findMany');

    await expect(findOpenReports()).resolves.toHaveLength(2);

    expect(query).toHaveBeenCalledTimes(1);
    expect(reads).not.toHaveBeenCalled();
  });

  it('leaves a report out once a decision names it, inside the database', async () => {
    const query = stubOpenReports([report(4n, 1n, '7')]);

    await findOpenReports();

    const sql = sqlOf(query);
    expect(sql).toContain("r.action = 'user.reported'");
    expect(sql).toMatch(
      /NOT EXISTS \( SELECT 1 FROM audit_entries d WHERE d\.action = 'report\.resolved' AND d\.target_id = r\.entry_id::text \)/,
    );
    // Oldest first, as the queue is shown.
    expect(sql).toContain('ORDER BY r.occurred_at ASC');
  });

  it('runs on the transaction it is given instead of the root client', async () => {
    const root = jest.spyOn(prisma, '$queryRaw');
    const inTransaction = jest.fn().mockResolvedValue([]);

    await findOpenReports({ $queryRaw: inTransaction } as never);

    expect(inTransaction).toHaveBeenCalledTimes(1);
    expect(root).not.toHaveBeenCalled();
  });

  it('gives each report its reporter’s email, and none when there is no reporter', async () => {
    stubOpenReports([
      { ...report(4n, 1n, '7'), actor: { email: 'ann@example.com' } },
      report(9n, null, '8'),
    ]);

    const open = await findOpenReports();

    expect(open.map((r) => [r.entry_id, r.actor])).toEqual([
      [4n, { email: 'ann@example.com' }],
      [9n, null],
    ]);
  });
});

describe('loadModerationState', () => {
  it('reads once and finds nothing when nobody has been reported', async () => {
    const query = stubOpenReports([]);
    const marks = jest.spyOn(prisma.audit_entries, 'findMany');

    const state = await loadModerationState();

    expect(query).toHaveBeenCalledTimes(1);
    expect(marks).not.toHaveBeenCalled();
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
      stubAudit([report(4n, 3n, '7')], [], [held('7', '4')]);

      const state = await loadModerationState();

      expect(state.held.get(7n)).toEqual(['admin']);
    });

    it('says both reasons when the threshold also applies', async () => {
      stubAudit(
        [report(4n, 3n, '7'), report(5n, 4n, '7')],
        [],
        [held('7', '4', '5')],
      );

      expect((await loadModerationState()).held.get(7n)).toEqual([
        'threshold',
        'admin',
      ]);
    });

    it('ends when the administrator releases them', async () => {
      stubAudit([report(4n, 3n, '7')], [], [held('7', '4'), released('7')]);

      expect((await loadModerationState()).held.size).toBe(0);
    });

    it('goes by the latest of the holds and releases', async () => {
      stubAudit(
        [report(4n, 3n, '7')],
        [],
        [held('7', '4'), released('7'), held('7', '4')],
      );

      expect((await loadModerationState()).held.has(7n)).toBe(true);
    });

    it('holds only the person named, not whoever else is reported', async () => {
      stubAudit(
        [report(4n, 3n, '7'), report(5n, 3n, '8')],
        [],
        [held('7', '4')],
      );

      const state = await loadModerationState();

      expect([...state.held.keys()]).toEqual([7n]);
    });

    it('counts while at least one of the reports it names is still open', async () => {
      stubAudit(
        [report(5n, 4n, '7')],
        [],
        [held('7', '4', '5')], // placed while 4 and 5 were open; 4 is decided
      );

      expect((await loadModerationState()).held.get(7n)).toEqual(['admin']);
    });

    it('no longer counts once every report it names is decided', async () => {
      // Placed for report 4, which is decided. Report 9 is a new complaint.
      stubAudit([report(9n, 4n, '7')], [], [held('7', '4')]);

      const state = await loadModerationState();

      expect(state.held.has(7n)).toBe(false);
      expect(state.adminHeld.has(7n)).toBe(false);
    });

    it('does not carry over to a later report once the first is decided', async () => {
      stubAudit(
        [report(9n, 4n, '7'), report(10n, 5n, '7')],
        [],
        [held('7', '4')],
      );

      // Two different people reported them, so the threshold holds them, but
      // the administrator's old hold is not part of the reason.
      expect((await loadModerationState()).held.get(7n)).toEqual(['threshold']);
    });

    it('counts for nothing when it names no reports', async () => {
      stubAudit([report(4n, 3n, '7')], [], [held('7')]);

      expect((await loadModerationState()).held.size).toBe(0);
    });

    it('is replaced by a newer hold on the same person', async () => {
      stubAudit([report(9n, 4n, '7')], [], [held('7', '4'), held('7', '9')]);

      expect((await loadModerationState()).held.get(7n)).toEqual(['admin']);
    });
  });
});

describe('isConversationPaused', () => {
  async function stateFor(
    reports: ReturnType<typeof report>[],
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
    const state = await stateFor([report(4n, 3n, '7')], [], [held('7', '4')]);

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
    stubAudit([report(4n, 3n, '7')], [], [held('7', '4')]);

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
