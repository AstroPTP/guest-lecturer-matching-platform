"use client";

import { useId, useState } from "react";
import {
  DEFAULT_RANKING,
  MIN_FIT_WEIGHT,
  WEIGHT_PRESETS,
  halfLifeChoices,
  presetFor,
  validateSuggestedSpeakers,
  weightTotal,
  type SuggestedSpeakersSettings,
} from "./suggestedSpeakers";
import "./suggested-speakers.css";

interface SuggestedSpeakersCardProps {
  value: SuggestedSpeakersSettings;
  onChange: (changes: Partial<SuggestedSpeakersSettings>) => void;
  /** True while the settings form is being saved. */
  isSaving: boolean;
  /** The half-life as last saved, so a stored value outside the list stays selectable. */
  storedHalfLifeDays?: number;
}

type Weight = "suggestionsFitWeight" | "suggestionsRotationWeight" | "suggestionsExposureWeight";

const WEIGHTS: Array<{ key: Weight; label: string; explanation: string }> = [
  {
    key: "suggestionsFitWeight",
    label: "Topic fit",
    explanation: "How closely a lecturer's topics match the session. More here favours subject experts.",
  },
  {
    key: "suggestionsRotationWeight",
    label: "Time since last session",
    explanation: "How long a lecturer has gone without a session. More here brings back lecturers who have waited.",
  },
  {
    key: "suggestionsExposureWeight",
    label: "Fewer sessions so far",
    explanation: "How few sessions a lecturer has had in total. More here lifts newer, less-used lecturers.",
  },
];

/**
 * The Suggested speakers card on the Settings page: an on/off switch, the three
 * weights that decide the order of the list, and the half-life of the time since
 * a lecturer's last session.
 *
 * It edits the page's draft and has no save of its own beyond a submit button,
 * so one Save writes every setting at once and one audit entry records the lot.
 */
export default function SuggestedSpeakersCard({ value, onChange, isSaving, storedHalfLifeDays }: SuggestedSpeakersCardProps) {
  const ids = useId();
  const matched = presetFor(value);
  // Custom is a choice in its own right, not just "no preset matches": picking
  // it must keep the inputs open even while the numbers still equal a preset.
  const [customChosen, setCustomChosen] = useState(matched === null);
  const isCustom = customChosen || matched === null;
  const problems = validateSuggestedSpeakers(value);
  const total = weightTotal(value);

  function choosePreset(id: string) {
    const preset = WEIGHT_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setCustomChosen(false);
    onChange({
      suggestionsFitWeight: preset.fit,
      suggestionsRotationWeight: preset.rotation,
      suggestionsExposureWeight: preset.exposure,
    });
  }

  function reset() {
    setCustomChosen(false);
    // The ranking only: whether the feature is on is a separate decision and is kept.
    onChange({ ...DEFAULT_RANKING });
  }

  return (
    <section className="settings-card suggested-card" id="suggestions" aria-labelledby={`${ids}-title`}>
      <header>
        <h2 id={`${ids}-title`}>Suggested speakers</h2>
        <p>
          A ranked shortlist of guest lecturers for a session, which also sets the order coordinators see guest lecturers
          in Discovery. Choose how the order balances topic fit against sharing sessions around.
        </p>
      </header>

      <div className="protocol-list">
        <div className="protocol-row">
          <p>
            <strong>Suggested speakers</strong>
            <small>
              When off, coordinators see a message that an administrator turned it off, and Discovery goes back to the
              order people joined. If the server sets
              MATCHING_SUGGESTIONS_ENABLED to false, it stays off whatever this says.
            </small>
          </p>
          <button
            aria-checked={value.suggestionsEnabled}
            aria-label={"Suggested speakers: " + (value.suggestionsEnabled ? "on" : "off")}
            className={"settings-toggle " + (value.suggestionsEnabled ? "enabled" : "")}
            onClick={() => onChange({ suggestionsEnabled: !value.suggestionsEnabled })}
            role="switch"
            type="button"
          >
            <span />
          </button>
        </div>
      </div>

      <div className="suggested-block">
        <p className="suggested-label" id={`${ids}-preset`}>
          How to rank
        </p>
        <div aria-labelledby={`${ids}-preset`} className="suggested-presets" role="radiogroup">
          {WEIGHT_PRESETS.map((preset) => {
            const selected = !isCustom && matched?.id === preset.id;
            return (
              <button
                aria-checked={selected}
                className={"suggested-preset " + (selected ? "selected" : "")}
                key={preset.id}
                onClick={() => choosePreset(preset.id)}
                role="radio"
                type="button"
              >
                <strong>{preset.label}</strong>
                <span>
                  {preset.fit} / {preset.rotation} / {preset.exposure}
                </span>
              </button>
            );
          })}
          <button
            aria-checked={isCustom}
            className={"suggested-preset " + (isCustom ? "selected" : "")}
            onClick={() => setCustomChosen(true)}
            role="radio"
            type="button"
          >
            <strong>Custom</strong>
            <span>Your own weights</span>
          </button>
        </div>
        <p className="suggested-hint">
          {isCustom
            ? `Set the three weights yourself. They must add up to 100, and topic fit must be at least ${MIN_FIT_WEIGHT}.`
            : matched?.summary}
        </p>
      </div>

      {WEIGHTS.map((weight) => (
        <div className="settings-field" key={weight.key}>
          <label htmlFor={`${ids}-${weight.key}`}>{weight.label}</label>
          <div>
            <input
              aria-describedby={`${ids}-${weight.key}-help`}
              disabled={!isCustom}
              id={`${ids}-${weight.key}`}
              inputMode="numeric"
              max={100}
              min={weight.key === "suggestionsFitWeight" ? MIN_FIT_WEIGHT : 0}
              onChange={(event) => onChange({ [weight.key]: event.target.value === "" ? NaN : Number(event.target.value) })}
              step={1}
              type="number"
              value={Number.isNaN(value[weight.key]) ? "" : value[weight.key]}
            />
            <small id={`${ids}-${weight.key}-help`}>{weight.explanation}</small>
          </div>
        </div>
      ))}

      <p className={"suggested-total " + (total === 100 ? "" : "off")} role="status">
        Total: {Number.isNaN(total) ? "not a number" : total} of 100
      </p>

      <div className="settings-field">
        <label htmlFor={`${ids}-half-life`}>Half-life</label>
        <div>
          <select
            className="suggested-select"
            id={`${ids}-half-life`}
            onChange={(event) => onChange({ suggestionsHalfLifeDays: Number(event.target.value) })}
            value={value.suggestionsHalfLifeDays}
          >
            {halfLifeChoices(value.suggestionsHalfLifeDays, storedHalfLifeDays ?? value.suggestionsHalfLifeDays).map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
          <small>
            After this many days without a session, the time-since-last-session score has risen halfway to its
            maximum. Shorter brings lecturers back sooner.
          </small>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="suggested-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="suggested-actions">
        <button className="suggested-reset" onClick={reset} type="button">
          Reset to defaults
        </button>
        <button className="save-settings suggested-save" disabled={isSaving || problems.length > 0} type="submit">
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
