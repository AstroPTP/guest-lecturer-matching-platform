import {
  RELIABILITY_NEUTRAL,
  RELIABILITY_THRESHOLD,
  ROTATION_HALF_LIFE_DAYS,
  WEIGHT_EXPOSURE,
  WEIGHT_FIT,
  WEIGHT_ROTATION,
  coversSession,
  exposureScore,
  fitScore,
  isReliable,
  normaliseTopic,
  overlaps,
  parseClock,
  rankScore,
  reliabilityScore,
  rotationScore,
  sharedTopics,
  weekdayOf,
  type WeeklyAvailability,
} from './scoring';

const DAY = 24 * 60 * 60 * 1000;

function clock(value: string): Date {
  return new Date(`1970-01-01T${value}:00Z`);
}

function window(
  days: Partial<Record<'monday' | 'wednesday' | 'friday', boolean>>,
  from: string | null,
  to: string | null,
): WeeklyAvailability {
  return {
    monday: days.monday ?? false,
    tuesday: false,
    wednesday: days.wednesday ?? false,
    thursday: false,
    friday: days.friday ?? false,
    available_from: from ? clock(from) : null,
    available_to: to ? clock(to) : null,
  };
}

describe('weights', () => {
  it('add up to one, so a perfect lecturer scores exactly 1', () => {
    expect(WEIGHT_FIT + WEIGHT_ROTATION + WEIGHT_EXPOSURE).toBeCloseTo(1, 10);
    expect(rankScore(1, 1, 1)).toBeCloseTo(1, 10);
  });

  it('put fit first, then time since the last session, then fewer sessions', () => {
    expect(WEIGHT_FIT).toBeGreaterThan(WEIGHT_ROTATION);
    expect(WEIGHT_ROTATION).toBeGreaterThan(WEIGHT_EXPOSURE);
  });
});

describe('normaliseTopic', () => {
  it('ignores case, outer space and repeated space', () => {
    expect(normaliseTopic('  Taxation   LAW ')).toBe('taxation law');
  });
});

describe('fitScore', () => {
  it('is 1 when both name exactly the same topics, whatever the spelling', () => {
    expect(
      fitScore(['Economics', 'Taxation Law'], ['TAXATION LAW', ' economics']),
    ).toBe(1);
  });

  it('is 0 when they share nothing, or either list is empty', () => {
    expect(fitScore(['Economics'], ['Accounting'])).toBe(0);
    expect(fitScore([], ['Accounting'])).toBe(0);
    expect(fitScore(['Economics'], [])).toBe(0);
    expect(fitScore(['  '], ['Economics'])).toBe(0);
  });

  it('is shared over the square root of the two sizes', () => {
    // 1 shared, 2 requested, 2 offered: 1 / sqrt(4) = 0.5
    expect(fitScore(['A', 'B'], ['A', 'C'])).toBeCloseTo(0.5, 10);
  });

  it('does not count a repeated topic twice', () => {
    expect(fitScore(['A', 'a', 'A'], ['A'])).toBe(1);
  });

  it('gives a focused lecturer more than a broad one covering the same ask', () => {
    const focused = fitScore(['A', 'B'], ['A', 'B']);
    const broad = fitScore(['A', 'B'], ['A', 'B', 'C', 'D', 'E']);
    expect(focused).toBeGreaterThan(broad);
    expect(broad).toBeGreaterThan(0);
  });
});

describe('sharedTopics', () => {
  it("returns the lecturer's own spelling, once each, in their order", () => {
    expect(
      sharedTopics(
        ['economics', 'TAXATION LAW'],
        ['Taxation Law', 'Accounting', 'Economics', 'economics'],
      ),
    ).toEqual(['Taxation Law', 'Economics']);
  });

  it('returns nothing when nothing is shared', () => {
    expect(sharedTopics(['Economics'], ['Accounting'])).toEqual([]);
  });
});

describe('rotationScore', () => {
  const now = new Date('2026-10-22T00:00:00Z');

  it('is 1 for a lecturer who has never had a session', () => {
    expect(rotationScore(null, now)).toBe(1);
  });

  it('is 0 for a session today', () => {
    expect(rotationScore(now, now)).toBe(0);
  });

  it('is a half after one half-life', () => {
    const last = new Date(now.getTime() - ROTATION_HALF_LIFE_DAYS * DAY);
    expect(rotationScore(last, now)).toBeCloseTo(0.5, 10);
  });

  it('grows with the gap, so the longer untouched ranks higher', () => {
    const yesterday = rotationScore(new Date(now.getTime() - DAY), now);
    const lastMonth = rotationScore(new Date(now.getTime() - 30 * DAY), now);
    const lastYear = rotationScore(new Date(now.getTime() - 365 * DAY), now);
    expect(yesterday).toBeLessThan(lastMonth);
    expect(lastMonth).toBeLessThan(lastYear);
    expect(lastYear).toBeLessThan(1);
    expect(lastYear).toBeGreaterThan(0.9);
  });

  it('treats a date in the future as today rather than going negative', () => {
    expect(rotationScore(new Date(now.getTime() + 5 * DAY), now)).toBe(0);
  });
});

describe('exposureScore', () => {
  it('is 1 with no sessions and falls as sessions are added', () => {
    expect(exposureScore(0)).toBe(1);
    expect(exposureScore(1)).toBe(0.5);
    expect(exposureScore(3)).toBe(0.25);
  });

  it('never reaches 0, so a busy lecturer ranks lower but is never removed', () => {
    expect(exposureScore(500)).toBeGreaterThan(0);
  });

  it('ignores a negative count', () => {
    expect(exposureScore(-4)).toBe(1);
  });
});

describe('reliabilityScore', () => {
  it('starts a newcomer at the neutral point, which passes', () => {
    expect(reliabilityScore(0, 0)).toBe(RELIABILITY_NEUTRAL);
    expect(isReliable(reliabilityScore(0, 0))).toBe(true);
  });

  it('rises with delivered sessions', () => {
    expect(reliabilityScore(5, 0)).toBe(75);
    expect(reliabilityScore(20, 0)).toBeGreaterThan(reliabilityScore(5, 0));
  });

  it('falls with broken commitments and fails the gate below the threshold', () => {
    expect(reliabilityScore(0, 1)).toBeCloseTo(41.67, 2);
    expect(isReliable(reliabilityScore(0, 1))).toBe(false);
    expect(isReliable(reliabilityScore(0, 3))).toBe(false);
  });

  it('lets a record of delivering outweigh one cancellation', () => {
    expect(isReliable(reliabilityScore(1, 1))).toBe(true);
    expect(isReliable(reliabilityScore(10, 3))).toBe(true);
  });

  it('passes exactly at the threshold', () => {
    expect(isReliable(RELIABILITY_THRESHOLD)).toBe(true);
    expect(isReliable(RELIABILITY_THRESHOLD - 0.01)).toBe(false);
  });
});

describe('rankScore', () => {
  it('lets a much better fit beat a fresher but poorer one', () => {
    const strongButBusy = rankScore(
      1,
      rotationScore(new Date('2026-10-21'), new Date('2026-10-22')),
      exposureScore(10),
    );
    const weakButFresh = rankScore(0.3, 1, 1);
    expect(strongButBusy).toBeGreaterThan(weakButFresh);
  });

  it('puts a rested lecturer above a just-used one at equal fit', () => {
    const now = new Date('2026-10-22T00:00:00Z');
    const rested = rankScore(
      0.8,
      rotationScore(new Date(now.getTime() - 365 * DAY), now),
      exposureScore(1),
    );
    const justUsed = rankScore(
      0.8,
      rotationScore(new Date(now.getTime() - DAY), now),
      exposureScore(1),
    );
    expect(rested).toBeGreaterThan(justUsed);
  });
});

describe('parseClock', () => {
  it('reads HH:MM as minutes after midnight', () => {
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('9:30')).toBe(570);
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('23:59')).toBe(1439);
    expect(parseClock('10:15:00')).toBe(615);
  });

  it('rejects anything else', () => {
    for (const bad of ['24:00', '12:60', '', 'noon', '1230', '12:5']) {
      expect(parseClock(bad)).toBeNull();
    }
  });
});

describe('weekdayOf', () => {
  it('gives Sunday as 0 through Saturday as 6', () => {
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(weekdayOf('2026-10-26')).toBe(1);
    expect(weekdayOf('2026-10-28')).toBe(3);
    expect(weekdayOf('2026-10-31')).toBe(6);
  });

  it('rejects shapes and dates that do not exist', () => {
    expect(weekdayOf('2026-02-30')).toBeNull();
    expect(weekdayOf('2026-13-01')).toBeNull();
    expect(weekdayOf('28/10/2026')).toBeNull();
    expect(weekdayOf('')).toBeNull();
  });

  it('accepts a leap day only in a leap year', () => {
    expect(weekdayOf('2028-02-29')).not.toBeNull();
    expect(weekdayOf('2027-02-29')).toBeNull();
  });
});

describe('coversSession', () => {
  const WEDNESDAY = 3;
  const at = (value: string) => parseClock(value) as number;

  it('accepts a window that holds the whole session', () => {
    expect(
      coversSession(
        window({ wednesday: true }, '09:00', '17:00'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(true);
  });

  it('accepts a session that fills the window exactly', () => {
    expect(
      coversSession(
        window({ wednesday: true }, '10:00', '11:00'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(true);
  });

  it('rejects a window that ends exactly as the session begins', () => {
    expect(
      coversSession(
        window({ wednesday: true }, '08:00', '10:00'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
  });

  it('rejects a window that starts exactly as the session ends', () => {
    expect(
      coversSession(
        window({ wednesday: true }, '11:00', '17:00'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
  });

  it('rejects a window that holds only part of the session', () => {
    expect(
      coversSession(
        window({ wednesday: true }, '09:00', '10:30'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
    expect(
      coversSession(
        window({ wednesday: true }, '10:30', '17:00'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
  });

  it('rejects a day that is not ticked', () => {
    expect(
      coversSession(
        window({ monday: true }, '09:00', '17:00'),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
  });

  it('rejects weekends, which the table has no column for', () => {
    const everyDay = window(
      { monday: true, wednesday: true, friday: true },
      '00:00',
      '23:59',
    );
    expect(coversSession(everyDay, 0, at('10:00'), at('11:00'))).toBe(false);
    expect(coversSession(everyDay, 6, at('10:00'), at('11:00'))).toBe(false);
  });

  it('does not treat days with no hours as free', () => {
    expect(
      coversSession(
        window({ wednesday: true }, null, null),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
    expect(
      coversSession(
        window({ wednesday: true }, '09:00', null),
        WEDNESDAY,
        at('10:00'),
        at('11:00'),
      ),
    ).toBe(false);
  });
});

describe('overlaps', () => {
  it('is true when the ranges share any time', () => {
    expect(overlaps(600, 660, 630, 700)).toBe(true);
    expect(overlaps(600, 660, 540, 700)).toBe(true);
  });

  it('is false when one finishes as the other starts', () => {
    expect(overlaps(600, 660, 660, 720)).toBe(false);
    expect(overlaps(660, 720, 600, 660)).toBe(false);
  });
});
