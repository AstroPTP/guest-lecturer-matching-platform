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
 * Whether the server has Suggested speakers switched on.
 *
 * On unless MATCHING_SUGGESTIONS_ENABLED is set to "false". An unset, empty
 * or misspelled value leaves it on, so a typo can never switch a feature off
 * by accident. Read when a request arrives, not at boot, because it is
 * optional and has a default; there is nothing to fail fast about.
 */
export function suggestionsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.MATCHING_SUGGESTIONS_ENABLED?.trim().toLowerCase() !== 'false';
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

/**
 * The settings while Suggested speakers is on, or null when either switch has
 * it off: MATCHING_SUGGESTIONS_ENABLED=false on the server, which wins over
 * everything and is answered without reading the database, or the
 * administrator's switch in Settings.
 *
 * Everything that changes what a person sees because the feature is on asks
 * here, so the server switch cannot be ignored by one of them.
 */
export async function readActiveMatchingSettings(): Promise<MatchingSettings | null> {
  if (!suggestionsEnabled()) {
    return null;
  }
  const settings = await readMatchingSettings();
  return settings.enabled ? settings : null;
}

/** Whether Suggested speakers is on under both switches. */
export async function suggestionsOn(): Promise<boolean> {
  return (await readActiveMatchingSettings()) !== null;
}
