"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";

import { expertiseTopics } from "@/constants/profileOptions/shared";
import { BackendError } from "@/lib/api/backendClient";
import { rememberSuggestionsOff, suggestionsOffError, useSuggestionsOn } from "@/lib/hooks/useSuggestionsOn";
import { expressInterest } from "@/services/discovery/matchService";
import { getSuggestions } from "@/services/suggestions/suggestionsService";
import type {
  LastSessionBand,
  SessionsBand,
  Suggestion,
  SuggestionsResult,
  TopicsFrom,
} from "@/types/suggestions/suggestionsTypes";

const HELP_HREF = "/unit_coordinator/help#suggested-speakers";
const EVENTS_HREF = "/unit_coordinator/events";

const inputClass =
  "w-full border-0 border-b-2 border-[#2d2d2d] bg-gray-100 px-4 py-3 outline-none focus:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

/** Today as YYYY-MM-DD in the browser's own time zone, for the date picker's minimum. */
function todayString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Plain-language gap since a lecturer's last session. The API sends a band, never a date. */
function describeLastSession(band: LastSessionBand): string {
  switch (band) {
    case "never":
      return "No session yet";
    case "within 30 days":
      return "Last session within 30 days";
    case "1 to 3 months":
      return "Last session 1 to 3 months ago";
    case "over 3 months":
      return "Last session over 3 months ago";
  }
}

/** Plain-language session history. The API sends a band, never a count. */
function describeSessions(band: SessionsBand): string {
  return band === "none" ? "No sessions so far" : `${band} sessions so far`;
}

/** Says which topics the list was built from, so a blank form is not a mystery. */
function describeTopics(from: TopicsFrom, topics: string[]): string {
  if (from === "profile") {
    return `No topics chosen, so your own expertise was used: ${topics.join(", ")}.`;
  }
  if (from === "none") {
    return "No topics chosen and none on your profile, so every lecturer who fits the date and time is listed.";
  }
  return `Topics: ${topics.join(", ")}.`;
}

/** Shown when the feature is off for a reason the API did not explain, such as the server setting. */
const SWITCHED_OFF_MESSAGE = "Suggested speakers is switched off right now.";

/**
 * The words for a 404 from this feature, or null if the error is something else.
 * An administrator's switch sends its own sentence, with the code
 * SUGGESTIONS_DISABLED; any other 404 means the route is off or missing.
 */
function switchedOffMessage(error: unknown): string | null {
  if (!(error instanceof BackendError) || error.status !== 404) {
    return null;
  }
  return error.code === "SUGGESTIONS_DISABLED" ? error.message : SWITCHED_OFF_MESSAGE;
}

/** What went wrong, in words a person can act on. */
function describeError(error: unknown): string {
  if (error instanceof BackendError) {
    if (error.status === 400) {
      return "Check the date, the times and the topics, then try again.";
    }
    if (error.status === 403) {
      return "Finish setting up your profile before asking for suggestions.";
    }
  }
  return "Unable to load suggestions. Please try again.";
}

export default function SuggestionsPageContent() {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<SuggestionsResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The shared answer, so a coordinator is told it is off before filling in a
  // form. Set only by a 404: a failure to ask is not a reason to hide the form.
  const suggestionsOn = useSuggestionsOn();
  const switchedOff = suggestionsOn === false ? switchedOffMessage(suggestionsOffError()) : null;

  function toggleTopic(topic: string) {
    setTopics((current) => (current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    // Nothing here is required. Blank means "not asked for".
    if (Boolean(startTime) !== Boolean(endTime)) {
      setFormError("Enter both a start time and an end time, or leave both blank.");
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setFormError("The end time must be later than the start time.");
      return;
    }

    setFormError(null);
    setIsLoading(true);
    try {
      setResult(await getSuggestions({ date, startTime, endTime, topics }));
    } catch (error) {
      setResult(null);
      if (switchedOffMessage(error)) {
        // It was switched off while the page was open. Telling the shared
        // answer also takes the item out of the menu.
        rememberSuggestionsOff(error);
        return;
      }
      console.error("Unable to load suggested speakers:", error);
      setFormError(describeError(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExpressInterest(guestId: string) {
    setBusyId(guestId);
    setActionError(null);
    try {
      const { matched } = await expressInterest(guestId);
      setResult((current) =>
        current
          ? {
              ...current,
              suggestions: current.suggestions.map((item) =>
                item.guestId === guestId ? { ...item, matchStatus: matched ? "matched" : "interest-sent" } : item,
              ),
            }
          : current,
      );
    } catch (error) {
      console.error("Unable to express interest:", error);
      // A 409 is the API refusing for a reason it explains, such as the contact
      // limit, so show its words rather than a generic failure.
      setActionError(
        error instanceof BackendError && error.status === 409
          ? error.message
          : "Unable to send your interest. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (switchedOff) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-10">
        <header className="rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Unit Coordinator</p>
          <h1 className="mt-2 text-3xl font-bold text-[#242424]">Suggested speakers</h1>
          <p role="status" className="mt-4 rounded-lg bg-gray-100 px-4 py-3 text-base text-gray-800">
            {switchedOff}
          </p>
          <p className="mt-3 text-sm text-gray-700">
            You can still find guest lecturers in{" "}
            <Link href="/unit_coordinator/discovery" className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
              Discovery
            </Link>
            .
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-10">
      <header className="rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Unit Coordinator</p>
        <h1 className="mt-2 text-3xl font-bold text-[#242424]">Suggested speakers</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-700">
          See the guest lecturers who suit a session, best first. Describe the session to narrow the list, or leave everything blank to
          use your own expertise at any time. Fit counts most, then time since last session, then fewer sessions so far.
        </p>
        <p className="mt-3 text-sm text-gray-700">
          <Link href={HELP_HREF} className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
            How suggestions work
          </Link>
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="space-y-6 rounded-2xl bg-white p-8 shadow-sm" aria-label="Describe the session">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <label htmlFor="suggestion-date" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              Date
            </label>
            <input
              id="suggestion-date"
              type="date"
              min={todayString()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="suggestion-start" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              Start time
            </label>
            <input
              id="suggestion-start"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="suggestion-end" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              End time
            </label>
            <input
              id="suggestion-end"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-sm text-gray-700">
          Everything here is optional. With no date, any day suits. With no times, any time suits. With no topics, your own expertise is
          used.
        </p>

        <fieldset>
          <legend className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">Topics the session needs (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {expertiseTopics.map((topic) => {
              const id = `suggestion-topic-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <div key={topic}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={topics.includes(topic)}
                    onChange={() => toggleTopic(topic)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={id}
                    className="inline-block cursor-pointer rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-[#2d2d2d] transition hover:bg-gray-100 peer-checked:border-[#2d2d2d] peer-checked:bg-[#2d2d2d] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-700"
                  >
                    {topic}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {formError ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-gray-100 pt-6">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-xl bg-[#2d2d2d] px-7 py-3 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Finding..." : "Find speakers"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {result ? (
          <Results result={result} busyId={busyId} actionError={actionError} onExpressInterest={handleExpressInterest} />
        ) : null}
      </div>
    </div>
  );
}

function Results({
  result,
  busyId,
  actionError,
  onExpressInterest,
}: {
  result: SuggestionsResult;
  busyId: string | null;
  actionError: string | null;
  onExpressInterest: (guestId: string) => void;
}) {
  const { stages, suggestions, session } = result;
  const steps = [
    { label: "eligible", value: stages.eligible },
    { label: "free for the session", value: stages.available },
    { label: "share a topic", value: stages.sharesTopic },
    { label: "reliable", value: stages.reliable },
  ];

  return (
    <section aria-labelledby="suggestion-results-heading" className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 id="suggestion-results-heading" className="text-xl font-semibold text-[#242424]">
          {suggestions.length === 0
            ? "No speakers found"
            : `${stages.reliable} speaker${stages.reliable === 1 ? "" : "s"} found`}
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          Of {stages.considered} guest lecturer{stages.considered === 1 ? "" : "s"}:{" "}
          {steps.map((step, index) => (
            <span key={step.label}>
              {index > 0 ? ", " : ""}
              <strong className="text-[#242424]">{step.value}</strong> {step.label}
            </span>
          ))}
          .
        </p>
        <p className="mt-2 text-sm text-gray-700">{describeTopics(session.topicsFrom, session.topics)}</p>
        {suggestions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">Try a different time, a nearby date or more topics.</p>
        ) : stages.reliable > suggestions.length ? (
          <p className="mt-2 text-sm text-gray-700">Showing the best {suggestions.length}.</p>
        ) : null}
      </div>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {actionError}
        </p>
      ) : null}

      <ol className="space-y-4">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.guestId}
            rank={index + 1}
            suggestion={suggestion}
            showFit={session.topicsFrom !== "none"}
            isBusy={busyId === suggestion.guestId}
            onExpressInterest={onExpressInterest}
          />
        ))}
      </ol>
    </section>
  );
}

function SuggestionCard({
  rank,
  suggestion,
  showFit,
  isBusy,
  onExpressInterest,
}: {
  rank: number;
  suggestion: Suggestion;
  /** False when no topics were in play, so there is no fit to report. */
  showFit: boolean;
  isBusy: boolean;
  onExpressInterest: (guestId: string) => void;
}) {
  const subtitle = [suggestion.role, suggestion.field].filter(Boolean).join(" at ");

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white"
        >
          {rank}
        </span>

        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-200">
          {suggestion.photoUrl ? (
            <Image src={suggestion.photoUrl} alt="" width={64} height={64} unoptimized className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-gray-700">
              {suggestion.name.trim().charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-[#242424]">{suggestion.name}</h3>
          {subtitle ? <p className="text-sm text-gray-700">{subtitle}</p> : null}

          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Topics in common">
            {suggestion.sharedTopics.map((topic) => (
              <li key={topic} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
                {topic}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-sm text-gray-700">
            {showFit ? `Topic fit ${Math.round(suggestion.score.fit * 100)}%. ` : ""}
            {describeLastSession(suggestion.lastSessionBand)}. {describeSessions(suggestion.sessionsBand)}.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 md:w-44">
          <Action suggestion={suggestion} isBusy={isBusy} onExpressInterest={onExpressInterest} />
        </div>
      </div>
    </li>
  );
}

function Action({
  suggestion,
  isBusy,
  onExpressInterest,
}: {
  suggestion: Suggestion;
  isBusy: boolean;
  onExpressInterest: (guestId: string) => void;
}) {
  if (suggestion.matchStatus === "matched") {
    return (
      <Link
        href={EVENTS_HREF}
        className="rounded-xl border border-[#2d2d2d] px-4 py-3 text-center font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
      >
        Matched. Invite in Event
      </Link>
    );
  }
  if (suggestion.matchStatus === "interest-sent") {
    return (
      <p className="rounded-xl bg-gray-100 px-4 py-3 text-center font-semibold text-gray-700">Interest sent</p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onExpressInterest(suggestion.guestId)}
      disabled={isBusy}
      className="rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {suggestion.matchStatus === "interest-received" ? "Accept their interest" : "Express interest"}
    </button>
  );
}
