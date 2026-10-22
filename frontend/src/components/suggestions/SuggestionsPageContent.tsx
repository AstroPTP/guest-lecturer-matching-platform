"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";

import { expertiseTopics } from "@/constants/profileOptions/shared";
import { BackendError } from "@/lib/api/backendClient";
import { expressInterest } from "@/services/discovery/matchService";
import { getSuggestions } from "@/services/suggestions/suggestionsService";
import type { Suggestion, SuggestionsResult } from "@/types/suggestions/suggestionsTypes";

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

/** Plain-language gap since a lecturer's last session. */
function describeLastSession(iso: string | null): string {
  if (!iso) {
    return "Not yet matched for a session";
  }
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 1) {
    return "Last matched today";
  }
  if (days < 60) {
    return `Last matched ${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (days < 730) {
    return `Last matched ${Math.round(days / 30)} months ago`;
  }
  return `Last matched ${Math.round(days / 365)} years ago`;
}

function describeSessions(count: number): string {
  if (count === 0) {
    return "No sessions so far";
  }
  return `${count} session${count === 1 ? "" : "s"} so far`;
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
    if (error.status === 404) {
      return "Suggested speakers is switched off right now.";
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

  function toggleTopic(topic: string) {
    setTopics((current) => (current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!date || !startTime || !endTime) {
      setFormError("Enter the date and the start and end times of the session.");
      return;
    }
    if (endTime <= startTime) {
      setFormError("The end time must be later than the start time.");
      return;
    }
    if (topics.length === 0) {
      setFormError("Choose at least one topic.");
      return;
    }

    setFormError(null);
    setIsLoading(true);
    try {
      setResult(await getSuggestions({ date, startTime, endTime, topics }));
    } catch (error) {
      console.error("Unable to load suggested speakers:", error);
      setResult(null);
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
      setActionError("Unable to send your interest. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-10">
      <header className="rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Unit Coordinator</p>
        <h1 className="mt-2 text-3xl font-bold text-[#242424]">Suggested speakers</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-700">
          Describe one session and see the guest lecturers who suit it, best first. Only lecturers who are free for the whole
          session and cover at least one of your topics are listed.
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

        <fieldset>
          <legend className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">Topics the session needs</legend>
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
  const { stages, suggestions } = result;
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
  isBusy,
  onExpressInterest,
}: {
  rank: number;
  suggestion: Suggestion;
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
            Topic fit {Math.round(suggestion.fit)}%. {describeLastSession(suggestion.lastSessionAt)}.{" "}
            {describeSessions(suggestion.sessionsSoFar)}.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 md:w-44">
          <p className="text-center text-sm text-gray-700">
            Score <strong className="text-lg text-[#242424]">{Math.round(suggestion.score)}</strong>
            <span className="sr-only"> out of 100</span>
          </p>
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
