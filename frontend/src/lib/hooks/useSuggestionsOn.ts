"use client";

import { useEffect, useState } from "react";
import { getSuggestionsStatus } from "@/services/suggestions/suggestionsService";

/** How long an answer is reused, so moving between pages does not ask again each time. */
const REUSE_MS = 5 * 60 * 1000;

/** What the API said: on or off, and for an off answer the 404 that said so. */
interface Answer {
  on: boolean;
  error: unknown;
  at: number;
}

// Kept in module memory only. Signing out and in is a full page load, which
// starts all of these afresh, so one person's answer never reaches another's.
let answer: Answer | null = null;
let request: Promise<Answer> | null = null;
// Every mounted useSuggestionsOn, told whenever a new answer is remembered.
const listeners = new Set<(next: Answer) => void>();

function remember(on: boolean, error: unknown = null): Answer {
  const next = { on, error, at: Date.now() };
  answer = next;
  listeners.forEach((listener) => listener(next));
  return next;
}

function ask(): Promise<Answer> {
  if (answer && Date.now() - answer.at < REUSE_MS) {
    return Promise.resolve(answer);
  }
  request ??= getSuggestionsStatus()
    .then((status) => remember(status.enabled === true))
    .catch((error: unknown): Answer => {
      const status = (error as { status?: unknown } | null)?.status;
      return status === 404 ? remember(false, error) : { on: false, error: null, at: Date.now() };
    })
    .finally(() => {
      request = null;
    });
  return request;
}

/**
 * Whether ranked matching is on, asked of the API once and then reused for a
 * few minutes by the menu, Help and the Suggested speakers page.
 *
 * The API says it is on by answering, and off by answering 404, so a 404 is a
 * clear "off" and is remembered along with the error. Any other failure
 * (offline, a server error) also reads as off, so nothing is offered that may
 * not be there, but it is not remembered and the next page asks again.
 */
export function fetchSuggestionsOn(): Promise<boolean> {
  return ask().then((result) => result.on);
}

/**
 * The 404 behind the remembered "off" answer, so a page can show the API's own
 * sentence. Null when the answer is on, not known yet, or off for any reason
 * other than a 404.
 */
export function suggestionsOffError(): unknown {
  return answer && !answer.on ? answer.error : null;
}

/**
 * Remembers that the API has answered 404 for this feature, for a page that
 * found out from its own request. Every useSuggestionsOn then updates, so the
 * menu hides the item at once instead of waiting for the next check.
 */
export function rememberSuggestionsOff(error: unknown): void {
  remember(false, error);
}

/**
 * True once the API has said ranked matching is on, false when it said off or
 * could not be asked, and null while the first answer is still on its way.
 *
 * Pass `wanted` as false on a page that has nothing to offer when it is on:
 * no request is made and the answer is false.
 */
export function useSuggestionsOn(wanted = true): boolean | null {
  const [current, setCurrent] = useState<Answer | null>(answer);

  useEffect(() => {
    if (!wanted) {
      return;
    }
    let active = true;
    const update = (next: Answer) => {
      if (active) setCurrent(next);
    };
    listeners.add(update);
    void ask().then(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, [wanted]);

  if (!wanted) {
    return false;
  }
  return current ? current.on : null;
}
