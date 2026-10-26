"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import groupIcon from "@/assets/group.png";
import ruleIcon from "@/assets/rule.png";
import SuggestedSpeakersCard from "@/components/settings/SuggestedSpeakersCard";
import { validateSuggestedSpeakers } from "@/components/settings/suggestedSpeakers";
import { getSettings, saveSettings, type PlatformSettings } from "@/services/adminApi";

const settingsNav: Array<{ label: string; href: string; icon: StaticImageData }> = [
  { label: "General", href: "#general", icon: ruleIcon },
  { label: "Matching rules", href: "#rules", icon: groupIcon },
];

/** The sub-navigation entry for the ranking settings, listed only while ranked matching is on. */
const rankingNav = { label: "Ranking settings", href: "#suggestions", icon: groupIcon };

const RANKED_MATCHING_OFF =
  "Off (default): coordinators and guest lecturers filter Discovery and choose the sort order themselves. No scores are used.";
const RANKED_MATCHING_ON =
  "On: coordinators get a Suggested speakers page, Discovery can show the best match first, and people are told when a new profile shares their topics. Ranking uses topic fit, time since the last session and sessions so far, never personal characteristics. Adjust the weights below.";

type Editable = Omit<PlatformSettings, "updatedAt">;

/**
 * Platform settings. Only settings the server enforces are shown: approval
 * decides who coordinators can see, the contact limit is checked whenever a
 * coordinator sends a request, and ranked matching, which is off until it is
 * switched on here, adds the ranking settings below the rules. Every change is
 * written to the audit log.
 */
export default function SettingsPage() {
  const [saved, setSaved] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<Editable | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await getSettings();
        if (active) {
          setSaved(current);
          setDraft(current);
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Settings could not be loaded.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    // The API and the database refuse the same values; this saves the trip.
    // The ranking settings are hidden while ranked matching is off, so a bad
    // value left in them then is not sent, and the stored ones stay as they are.
    const problems = validateSuggestedSpeakers(draft);
    const sendRanking = problems.length === 0;
    if (!sendRanking && draft.suggestionsEnabled) {
      setNotice("");
      setErrorMessage(problems[0]);
      return;
    }
    setIsSaving(true);
    setNotice("");
    setErrorMessage("");
    try {
      const next = await saveSettings({
        systemName: draft.systemName,
        supportEmail: draft.supportEmail,
        requireAdminApproval: draft.requireAdminApproval,
        contactLimitDays: draft.contactLimitDays,
        suggestionsEnabled: draft.suggestionsEnabled,
        ...(sendRanking
          ? {
              suggestionsFitWeight: draft.suggestionsFitWeight,
              suggestionsRotationWeight: draft.suggestionsRotationWeight,
              suggestionsExposureWeight: draft.suggestionsExposureWeight,
              suggestionsHalfLifeDays: draft.suggestionsHalfLifeDays,
            }
          : {}),
      });
      setSaved(next);
      setDraft(next);
      setNotice("Settings saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!draft || !saved) {
    return <p className="control-empty">{errorMessage || "Loading settings…"}</p>;
  }

  const update = <K extends keyof Editable>(key: K, value: Editable[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <form className="settings-page" onSubmit={(event) => void submit(event)}>
      <header className="settings-heading">
        <h1>Settings</h1>
        <p>
          Last changed{" "}
          {new Date(saved.updatedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}.
          Every change is recorded in the audit log.
        </p>
      </header>

      <div className="settings-layout">
        <nav className="settings-local-nav" aria-label="Settings sections">
          {(draft.suggestionsEnabled ? [...settingsNav, rankingNav] : settingsNav).map((item) => (
            <a href={item.href} key={item.href}>
              <Image alt="" aria-hidden="true" src={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="settings-sections">
          <section className="settings-card" id="general">
            <header>
              <h2>General</h2>
              <p>How the platform names itself and where users go for help.</p>
            </header>
            <div className="settings-field">
              <label htmlFor="system-name">System name</label>
              <div>
                <input
                  id="system-name"
                  maxLength={120}
                  onChange={(event) => update("systemName", event.target.value)}
                  required
                  value={draft.systemName}
                />
              </div>
            </div>
            <div className="settings-field">
              <label htmlFor="support-email">Support email</label>
              <div>
                <input
                  id="support-email"
                  onChange={(event) => update("supportEmail", event.target.value)}
                  required
                  type="email"
                  value={draft.supportEmail}
                />
                <small>Where users are told to send questions.</small>
              </div>
            </div>
          </section>

          <section className="settings-card" id="rules">
            <header>
              <h2>Matching rules</h2>
              <p>Rules applied when coordinators look for and contact guest lecturers.</p>
            </header>
            <div className="protocol-list">
              <Protocol
                checked={draft.requireAdminApproval}
                description="New guest lecturer profiles stay hidden from coordinators until approved in the verification queue. Profiles already visible stay visible."
                label="Require admin approval"
                onChange={() => update("requireAdminApproval", !draft.requireAdminApproval)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="contact-limit">Contact limit (days)</label>
              <div>
                <input
                  id="contact-limit"
                  max={365}
                  min={0}
                  onChange={(event) => update("contactLimitDays", Number(event.target.value))}
                  required
                  type="number"
                  value={draft.contactLimitDays}
                />
                <small>
                  A guest lecturer can receive one contact request in this many days, from any coordinator. 90 is
                  about three months. 0 turns the limit off.
                </small>
              </div>
            </div>
            <div className="protocol-list">
              <Protocol
                checked={draft.suggestionsEnabled}
                description={draft.suggestionsEnabled ? RANKED_MATCHING_ON : RANKED_MATCHING_OFF}
                label="Ranked matching (Suggested speakers)"
                onChange={() => update("suggestionsEnabled", !draft.suggestionsEnabled)}
              />
            </div>
          </section>

          {draft.suggestionsEnabled && (
            <SuggestedSpeakersCard
              storedHalfLifeDays={saved.suggestionsHalfLifeDays}
              onChange={(changes) => setDraft((current) => (current ? { ...current, ...changes } : current))}
              value={draft}
            />
          )}

          <footer className="settings-actions">
            {notice && <span role="status">{notice}</span>}
            {errorMessage && (
              <span className="error" role="alert">
                {errorMessage}
              </span>
            )}
            <button onClick={() => setDraft(saved)} type="button">
              Discard changes
            </button>
            <button className="save-settings" disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Save settings"}
            </button>
          </footer>
        </div>
      </div>
    </form>
  );
}

function Protocol({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <div className="protocol-row">
      <p>
        <strong>{label}</strong>
        <small>{description}</small>
      </p>
      <button
        aria-checked={checked}
        aria-label={label + ": " + (checked ? "on" : "off")}
        className={"settings-toggle " + (checked ? "enabled" : "")}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}
