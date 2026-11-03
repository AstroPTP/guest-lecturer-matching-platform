import {
  RELIABILITY_NEUTRAL,
  RELIABILITY_THRESHOLD,
  ROTATION_HALF_LIFE_DAYS,
  WEIGHT_EXPOSURE,
  WEIGHT_FIT,
  WEIGHT_ROTATION,
  exposureScore,
  fitScore,
  isAvailable,
  isReliable,
  lastSessionBand,
  normaliseTopic,
  parseClock,
  rankScore,
  recordedAvailability,
  reliabilityScore,
  roundTo,
  rotationScore,
  sessionsBand,
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
    expect(exposureScore(1)).toBeCloseTo(0.5906, 4);
    expect(exposureScore(3)).toBeCloseTo(0.4191, 4);
  });

  it('is 1 / (1 + ln(1 + n))', () => {
    for (const n of [0, 1, 2, 7, 40]) {
      expect(exposureScore(n)).toBeCloseTo(1 / (1 + Math.log(1 + n)), 12);
    }
  });

  it('falls more slowly than 1 / (1 + n), so the hundredth session costs little more than the ninetieth', () => {
    expect(exposureScore(1)).toBeGreaterThan(1 / 2);
    expect(exposureScore(100) - exposureScore(90)).toBeLessThan(0.01);
  });

  it('never reaches 0, so a busy lecturer ranks lower but is never removed', () => {
    expect(exposureScore(500)).toBeGreaterThan(0);
  });

  it('ignores a negative count', () => {
    expect(exposureScore(-4)).toBe(1);
  });
});

describe('reliabilityScore', () => {
  it('puts a lecturer with no ratings at the neutral point, which passes', () => {
    expect(reliabilityScore([])).toBe(RELIABILITY_NEUTRAL);
    expect(isReliable(reliabilityScore([]))).toBe(true);
  });

  it('is a Bayesian average: neutral times trust, plus the ratings, over trust plus count', () => {
    // (50 * 5 + 100 + 100) / (5 + 2)
    expect(reliabilityScore([100, 100])).toBeCloseTo(450 / 7, 10);
  });

  it('rises with good ratings and falls with poor ones', () => {
    expect(reliabilityScore([100, 100, 100, 100, 100])).toBe(75);
    expect(reliabilityScore([0, 0, 0, 0, 0])).toBe(25);
  });

  it('moves only part of the way on one rating', () => {
    expect(reliabilityScore([0])).toBeGreaterThan(RELIABILITY_THRESHOLD - 5);
    expect(isReliable(reliabilityScore([0]))).toBe(false);
    expect(isReliable(reliabilityScore([20]))).toBe(true);
  });

  it('keeps the gate: a poor record fails it and a good one passes', () => {
    expect(isReliable(reliabilityScore([10, 10, 10, 10, 10]))).toBe(false);
    expect(isReliable(reliabilityScore([90, 80, 70]))).toBe(true);
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

describe('recordedAvailability', () => {
  it('reads the ticked weekdays as 1 for Monday to 5 for Friday, and the hours as minutes', () => {
    const recorded = recordedAvailability(
      window({ monday: true, friday: true }, '09:00', '17:30'),
    );
    expect([...recorded.days].sort()).toEqual([1, 5]);
    expect(recorded.window).toEqual({ startMinutes: 540, endMinutes: 1050 });
  });

  it('reads no row as nothing recorded', () => {
    const recorded = recordedAvailability(null);
    expect(recorded.days.size).toBe(0);
    expect(recorded.window).toBeNull();
  });

  it('has no window unless both hours are recorded', () => {
    expect(
      recordedAvailability(window({ monday: true }, '09:00', null)).window,
    ).toBeNull();
    expect(
      recordedAvailability(window({ monday: true }, null, '17:00')).window,
    ).toBeNull();
  });
});

describe('isAvailable', () => {
  const WEDNESDAY = 3;
  const minutes = (from: string, to: string) => ({
    startMinutes: parseClock(from) as number,
    endMinutes: parseClock(to) as number,
  });
  const lecturer = (
    days: Partial<Record<'monday' | 'wednesday' | 'friday', boolean>>,
    from: string | null,
    to: string | null,
  ) => recordedAvailability(window(days, from, to));
  const mwf = lecturer(
    { monday: true, wednesday: true, friday: true },
    '13:00',
    '17:00',
  );

  it('accepts a session on an available day, inside the hours', () => {
    expect(
      isAvailable(mwf, {
        weekday: WEDNESDAY,
        window: minutes('14:00', '16:00'),
      }),
    ).toBe(true);
  });

  it('rejects a session on a day the lecturer has not ticked', () => {
    expect(
      isAvailable(mwf, { weekday: 2, window: minutes('14:00', '16:00') }),
    ).toBe(false);
  });

  it('accepts a session that fills the window exactly', () => {
    expect(
      isAvailable(mwf, { weekday: 1, window: minutes('13:00', '17:00') }),
    ).toBe(true);
  });

  it('rejects a window that finishes exactly as the session begins', () => {
    const noon = lecturer({ wednesday: true }, '12:00', '14:00');
    expect(
      isAvailable(noon, {
        weekday: WEDNESDAY,
        window: minutes('14:00', '16:00'),
      }),
    ).toBe(false);
  });

  it('rejects a window that starts exactly as the session ends', () => {
    const later = lecturer({ wednesday: true }, '16:00', '18:00');
    expect(
      isAvailable(later, {
        weekday: WEDNESDAY,
        window: minutes('14:00', '16:00'),
      }),
    ).toBe(false);
  });

  it('rejects a window that holds only part of the session', () => {
    expect(
      isAvailable(mwf, {
        weekday: WEDNESDAY,
        window: minutes('12:00', '14:00'),
      }),
    ).toBe(false);
    expect(
      isAvailable(mwf, {
        weekday: WEDNESDAY,
        window: minutes('16:00', '18:00'),
      }),
    ).toBe(false);
  });

  describe('an unspecified requirement is not a clash', () => {
    it('lets everyone through the day check when no day is asked for', () => {
      expect(isAvailable(mwf, { weekday: null, window: null })).toBe(true);
      expect(
        isAvailable(lecturer({ monday: true }, null, null), {
          weekday: null,
          window: null,
        }),
      ).toBe(true);
    });

    it('still checks the hours when only times are asked for', () => {
      expect(
        isAvailable(mwf, { weekday: null, window: minutes('14:00', '16:00') }),
      ).toBe(true);
      expect(
        isAvailable(mwf, { weekday: null, window: minutes('08:00', '10:00') }),
      ).toBe(false);
    });

    it('does not remove a lecturer with no hours recorded when no times are asked for', () => {
      const noHours = lecturer({ wednesday: true }, null, null);
      expect(isAvailable(noHours, { weekday: null, window: null })).toBe(true);
      expect(isAvailable(noHours, { weekday: WEDNESDAY, window: null })).toBe(
        true,
      );
    });

    it('does not remove a lecturer with no row at all when nothing is asked for', () => {
      expect(
        isAvailable(recordedAvailability(null), {
          weekday: null,
          window: null,
        }),
      ).toBe(true);
    });
  });

  describe('only when a time window is asked for does "no hours recorded" remove someone', () => {
    it('removes a lecturer with days but no hours', () => {
      const noHours = lecturer({ wednesday: true }, null, null);
      expect(
        isAvailable(noHours, {
          weekday: WEDNESDAY,
          window: minutes('10:00', '11:00'),
        }),
      ).toBe(false);
      expect(
        isAvailable(noHours, {
          weekday: null,
          window: minutes('10:00', '11:00'),
        }),
      ).toBe(false);
    });

    it('removes a lecturer with only one of the two hours', () => {
      expect(
        isAvailable(lecturer({ wednesday: true }, '09:00', null), {
          weekday: WEDNESDAY,
          window: minutes('10:00', '11:00'),
        }),
      ).toBe(false);
    });

    it('removes a lecturer with nothing recorded at all', () => {
      expect(
        isAvailable(recordedAvailability(null), {
          weekday: null,
          window: minutes('10:00', '11:00'),
        }),
      ).toBe(false);
    });
  });

  describe('a lecturer who has recorded no days', () => {
    it('is not removed by the day check', () => {
      const noDays = lecturer({}, '09:00', '17:00');
      expect(isAvailable(noDays, { weekday: WEDNESDAY, window: null })).toBe(
        true,
      );
      expect(
        isAvailable(noDays, {
          weekday: WEDNESDAY,
          window: minutes('10:00', '11:00'),
        }),
      ).toBe(true);
    });
  });

  describe('weekends, which the table has no column for', () => {
    it('remove every lecturer who has recorded any day', () => {
      expect(isAvailable(mwf, { weekday: 0, window: null })).toBe(false);
      expect(
        isAvailable(mwf, { weekday: 6, window: minutes('10:00', '11:00') }),
      ).toBe(false);
    });
  });
});

describe('lastSessionBand', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

  it('is never for a lecturer with no session', () => {
    expect(lastSessionBand(null, now)).toBe('never');
  });

  it('is within 30 days up to and including day 30, and for a date in the future', () => {
    expect(lastSessionBand(now, now)).toBe('within 30 days');
    expect(lastSessionBand(daysAgo(30), now)).toBe('within 30 days');
    expect(lastSessionBand(new Date(now.getTime() + 5 * DAY), now)).toBe(
      'within 30 days',
    );
  });

  it('is 1 to 3 months from day 31 up to and including day 90', () => {
    expect(lastSessionBand(daysAgo(31), now)).toBe('1 to 3 months');
    expect(lastSessionBand(daysAgo(90), now)).toBe('1 to 3 months');
  });

  it('is over 3 months after that', () => {
    expect(lastSessionBand(daysAgo(91), now)).toBe('over 3 months');
    expect(lastSessionBand(daysAgo(900), now)).toBe('over 3 months');
  });
});

describe('sessionsBand', () => {
  it('steps none, 1 to 2, 3 to 5, 6 or more', () => {
    expect([0, 1, 2, 3, 5, 6, 40].map(sessionsBand)).toEqual([
      'none',
      '1 to 2',
      '1 to 2',
      '3 to 5',
      '3 to 5',
      '6 or more',
      '6 or more',
    ]);
  });

  it('treats a negative count as none', () => {
    expect(sessionsBand(-3)).toBe('none');
  });
});

describe('roundTo', () => {
  it('rounds to the places asked for', () => {
    expect(roundTo(0.7071, 2)).toBe(0.71);
    expect(roundTo(0.5388, 1)).toBe(0.5);
    expect(roundTo(0.55, 1)).toBe(0.6);
    expect(roundTo(0.825, 2)).toBe(0.83);
  });
});
