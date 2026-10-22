/**
 * The Suggested speakers settings an administrator can change, and the rules
 * they must follow. The same limits are enforced by the API and by the database,
 * so these only exist to tell the administrator before they press Save.
 */

export interface SuggestedSpeakersSettings {
  suggestionsEnabled: boolean;
  /** Whole percentages; the three add up to 100. */
  suggestionsFitWeight: number;
  suggestionsRotationWeight: number;
  suggestionsExposureWeight: number;
  suggestionsHalfLifeDays: number;
}

export const MIN_FIT_WEIGHT = 50;
/** The half-lives offered in the list. The API accepts any whole number from MIN to MAX. */
export const HALF_LIFE_OPTIONS = [30, 60, 90, 180, 365] as const;
export const MIN_HALF_LIFE_DAYS = 30;
export const MAX_HALF_LIFE_DAYS = 365;

/**
 * The half-lives to show in the select: the listed ones, plus any others that
 * are in use, in order. A value stored from outside this page, such as 45, is
 * shown as an extra option so the select never claims a value it cannot hold.
 */
export function halfLifeChoices(...inUse: number[]): number[] {
  const choices = new Set<number>(HALF_LIFE_OPTIONS);
  for (const days of inUse) {
    if (Number.isInteger(days) && days >= MIN_HALF_LIFE_DAYS && days <= MAX_HALF_LIFE_DAYS) {
      choices.add(days);
    }
  }
  return [...choices].sort((a, b) => a - b);
}

/** The settings that "Reset to defaults" puts back. The on/off switch is not one of them. */
export const DEFAULT_RANKING: Omit<SuggestedSpeakersSettings, "suggestionsEnabled"> = {
  suggestionsFitWeight: 65,
  suggestionsRotationWeight: 20,
  suggestionsExposureWeight: 15,
  suggestionsHalfLifeDays: 90,
};

/** What the feature does until someone changes it. */
export const SUGGESTED_SPEAKERS_DEFAULTS: SuggestedSpeakersSettings = {
  suggestionsEnabled: true,
  ...DEFAULT_RANKING,
};

export interface WeightPreset {
  id: "balanced" | "topic" | "share";
  label: string;
  summary: string;
  fit: number;
  rotation: number;
  exposure: number;
}

export const WEIGHT_PRESETS: WeightPreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    summary: "Topic fit first, with a steady nudge towards lecturers who have waited or had fewer sessions. The default.",
    fit: 65,
    rotation: 20,
    exposure: 15,
  },
  {
    id: "topic",
    label: "Topic first",
    summary: "Almost entirely the best subject match. Fairness has only a light effect.",
    fit: 80,
    rotation: 10,
    exposure: 10,
  },
  {
    id: "share",
    label: "Share the work",
    summary: "Spreads sessions around: a never-used lecturer with a weaker topic match can outrank a busy expert.",
    fit: 50,
    rotation: 30,
    exposure: 20,
  },
];

/** The preset whose three weights these are, or null when they are custom. */
export function presetFor(settings: SuggestedSpeakersSettings): WeightPreset | null {
  return (
    WEIGHT_PRESETS.find(
      (preset) =>
        preset.fit === settings.suggestionsFitWeight &&
        preset.rotation === settings.suggestionsRotationWeight &&
        preset.exposure === settings.suggestionsExposureWeight,
    ) ?? null
  );
}

export function weightTotal(settings: SuggestedSpeakersSettings): number {
  return settings.suggestionsFitWeight + settings.suggestionsRotationWeight + settings.suggestionsExposureWeight;
}

/** What is wrong with these settings, in words, or an empty list when they can be saved. */
export function validateSuggestedSpeakers(settings: SuggestedSpeakersSettings): string[] {
  const problems: string[] = [];
  const weights: Array<[string, number]> = [
    ["Topic fit", settings.suggestionsFitWeight],
    ["Time since last session", settings.suggestionsRotationWeight],
    ["Fewer sessions so far", settings.suggestionsExposureWeight],
  ];

  for (const [label, value] of weights) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      problems.push(`${label} must be a whole number from 0 to 100.`);
    }
  }

  const total = weightTotal(settings);
  if (problems.length === 0 && total !== 100) {
    problems.push(`The three weights must add up to 100. They add up to ${total}.`);
  }
  if (Number.isInteger(settings.suggestionsFitWeight) && settings.suggestionsFitWeight < MIN_FIT_WEIGHT) {
    problems.push(`Topic fit must be at least ${MIN_FIT_WEIGHT}, so it always counts most.`);
  }
  const halfLife = settings.suggestionsHalfLifeDays;
  if (!Number.isInteger(halfLife) || halfLife < MIN_HALF_LIFE_DAYS || halfLife > MAX_HALF_LIFE_DAYS) {
    problems.push(`The half-life must be a whole number of days from ${MIN_HALF_LIFE_DAYS} to ${MAX_HALF_LIFE_DAYS}.`);
  }
  return problems;
}
