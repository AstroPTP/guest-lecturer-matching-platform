import { readSettings } from '../admin/platform-rules';
import {
  DEFAULT_WEIGHTS,
  ROTATION_HALF_LIFE_DAYS,
  weightsFromPercent,
  type ScoreWeights,
} from './scoring';

/**
 * Limits on the Suggested speakers settings. The same numbers are enforced in
 * three places: the settings DTO, the settings service (which also checks the
 * sum) and check constraints in the 20261022120000_add_matching_settings
 * migration. Change one and you must change all three.
 */
export const MIN_FIT_WEIGHT_PERCENT = 50;
export const MIN_HALF_LIFE_DAYS = 30;
export const MAX_HALF_LIFE_DAYS = 365;

/**
 * What the settings hold when nothing has been changed. Ranked matching is off
 * until an administrator switches it on.
 */
export const DEFAULT_MATCHING_SETTINGS = {
  enabled: false,
  fitWeight: Math.round(DEFAULT_WEIGHTS.fit * 100),
  rotationWeight: Math.round(DEFAULT_WEIGHTS.rotation * 100),
  exposureWeight: Math.round(DEFAULT_WEIGHTS.exposure * 100),
  halfLifeDays: ROTATION_HALF_LIFE_DAYS,
} as const;

export interface MatchingSettings {
  /** True only once an administrator has switched ranked matching on. */
  enabled: boolean;
  weights: ScoreWeights;
  halfLifeDays: number;
}

/**
 * The administrator's Suggested speakers settings, read through the shared
 * settings reader so there is one place that knows how the row is fetched.
 *
 * A value that is missing falls back to its default rather than failing: the
 * columns have database defaults, so a missing one means a row from before the
 * migration, not a mistake.
 */
export async function readMatchingSettings(): Promise<MatchingSettings> {
  const row = await readSettings();
  const d = DEFAULT_MATCHING_SETTINGS;
  return {
    enabled: row.suggestions_enabled ?? d.enabled,
    weights: weightsFromPercent(
      row.suggestions_fit_weight ?? d.fitWeight,
      row.suggestions_rotation_weight ?? d.rotationWeight,
      row.suggestions_exposure_weight ?? d.exposureWeight,
    ),
    halfLifeDays: row.suggestions_half_life_days ?? d.halfLifeDays,
  };
}
