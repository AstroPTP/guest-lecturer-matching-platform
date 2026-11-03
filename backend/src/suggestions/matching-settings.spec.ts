import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../prisma';
import {
  DEFAULT_MATCHING_SETTINGS,
  MAX_HALF_LIFE_DAYS,
  MIN_FIT_WEIGHT_PERCENT,
  MIN_HALF_LIFE_DAYS,
  readMatchingSettings,
} from './matching-settings';
import {
  DEFAULT_WEIGHTS,
  ROTATION_HALF_LIFE_DAYS,
  WEIGHT_EXPOSURE,
  WEIGHT_FIT,
  WEIGHT_ROTATION,
  rankScore,
  rotationScore,
  weightsFromPercent,
} from './scoring';

afterEach(() => jest.restoreAllMocks());

describe('the defaults', () => {
  it('are the constants the feature shipped with: 65/20/15 and 90 days, off', () => {
    expect(DEFAULT_MATCHING_SETTINGS).toEqual({
      enabled: false,
      fitWeight: 65,
      rotationWeight: 20,
      exposureWeight: 15,
      halfLifeDays: 90,
    });
    expect(DEFAULT_WEIGHTS).toEqual({
      fit: WEIGHT_FIT,
      rotation: WEIGHT_ROTATION,
      exposure: WEIGHT_EXPOSURE,
    });
    expect(ROTATION_HALF_LIFE_DAYS).toBe(90);
  });

  it('rank exactly as before when no weights or half-life are passed', () => {
    expect(rankScore(0.5, 0.4, 0.3)).toBeCloseTo(
      0.65 * 0.5 + 0.2 * 0.4 + 0.15 * 0.3,
      12,
    );
    const now = new Date('2026-10-22T00:00:00Z');
    const then = new Date(now.getTime() - 90 * 86_400_000);
    expect(rotationScore(then, now)).toBeCloseTo(0.5, 12);
  });
});

describe('weightsFromPercent', () => {
  it('turns whole percentages into fractions that add up to 1', () => {
    const weights = weightsFromPercent(50, 30, 20);
    expect(weights).toEqual({ fit: 0.5, rotation: 0.3, exposure: 0.2 });
    expect(weights.fit + weights.rotation + weights.exposure).toBeCloseTo(
      1,
      12,
    );
  });
});

describe('configured weights and half-life', () => {
  it('rankScore uses the weights it is given', () => {
    expect(rankScore(1, 0, 0, weightsFromPercent(80, 10, 10))).toBeCloseTo(0.8);
    expect(rankScore(0, 1, 0, weightsFromPercent(50, 30, 20))).toBeCloseTo(0.3);
    expect(rankScore(0, 0, 1, weightsFromPercent(50, 30, 20))).toBeCloseTo(0.2);
  });

  it('rotationScore uses the half-life it is given', () => {
    const now = new Date('2026-10-22T00:00:00Z');
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000);
    expect(rotationScore(sixtyDaysAgo, now, 60)).toBeCloseTo(0.5, 12);
    expect(rotationScore(sixtyDaysAgo, now, 30)).toBeCloseTo(0.75, 12);
    expect(rotationScore(sixtyDaysAgo, now, 365)).toBeLessThan(0.12);
  });
});

describe('readMatchingSettings', () => {
  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 1,
      suggestions_enabled: true,
      suggestions_fit_weight: 65,
      suggestions_rotation_weight: 20,
      suggestions_exposure_weight: 15,
      suggestions_half_life_days: 90,
      ...overrides,
    }) as never;

  it('reads the settings through the shared settings reader', async () => {
    const upsert = jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(row());
    await readMatchingSettings();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ where: { id: 1 } });
  });

  it('turns the stored percentages into weights and passes the half-life through', async () => {
    jest.spyOn(prisma.admin_settings, 'upsert').mockResolvedValue(
      row({
        suggestions_enabled: true,
        suggestions_fit_weight: 50,
        suggestions_rotation_weight: 30,
        suggestions_exposure_weight: 20,
        suggestions_half_life_days: 180,
      }),
    );
    expect(await readMatchingSettings()).toEqual({
      enabled: true,
      weights: { fit: 0.5, rotation: 0.3, exposure: 0.2 },
      halfLifeDays: 180,
    });
  });

  it('falls back to the defaults for a row that has none of the columns', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue({ id: 1 } as never);
    expect(await readMatchingSettings()).toEqual({
      enabled: false,
      weights: DEFAULT_WEIGHTS,
      halfLifeDays: 90,
    });
  });

  it('is off for a stored row that has the switch unset, so ranking never runs by accident', async () => {
    jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue({ id: 1, suggestions_enabled: null } as never);
    expect((await readMatchingSettings()).enabled).toBe(false);
  });
});

/**
 * The limits are enforced in three places (the DTO, the settings service and
 * check constraints in the migration). This keeps the migration in step with
 * the constants the other two use.
 */
describe('the 20261022120000_add_matching_settings migration', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20261022120000_add_matching_settings/migration.sql',
    ),
    'utf8',
  );

  it('adds the five columns: ranked matching off, the standard weights and half-life', () => {
    expect(sql).toMatch(/"suggestions_enabled" BOOLEAN NOT NULL DEFAULT false/);
    expect(sql).toMatch(/"suggestions_fit_weight" INTEGER NOT NULL DEFAULT 65/);
    expect(sql).toMatch(
      /"suggestions_rotation_weight" INTEGER NOT NULL DEFAULT 20/,
    );
    expect(sql).toMatch(
      /"suggestions_exposure_weight" INTEGER NOT NULL DEFAULT 15/,
    );
    expect(sql).toMatch(
      /"suggestions_half_life_days" INTEGER NOT NULL DEFAULT 90/,
    );
  });

  it('is additive: it adds columns and constraints and drops nothing', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  });

  it('constrains the weights to 0-100, summing to 100, with fit at least the floor', () => {
    expect(sql).toMatch(/BETWEEN 0 AND 100/);
    expect(sql).toMatch(/= 100/);
    expect(sql).toContain(
      `"suggestions_fit_weight" >= ${MIN_FIT_WEIGHT_PERCENT}`,
    );
  });

  it('constrains the half-life to the same range the DTO allows', () => {
    expect(sql).toContain(
      `"suggestions_half_life_days" BETWEEN ${MIN_HALF_LIFE_DAYS} AND ${MAX_HALF_LIFE_DAYS}`,
    );
  });
});
