"use client";

import { useEffect, useState } from "react";
import { getSuggestionsStatus } from "@/services/suggestions/suggestionsService";

/** How long an answer is reused, so moving between pages does not ask again each time. */
const REUSE_MS = 5 * 60 * 1000;

// Kept in module memory only. Signing out and in is a full page load, which
// starts both of these afresh, so one person's answer never reaches another's.
let answer: { on: boolean; at: number } | null = null;
let request: Promise<boolean> | null = null;

/**
 * Whether ranked matching is on, asked of the API once and then reused for a
 * few minutes by the menu, Help and Discovery.
 *
 * The API says it is on by answering, and off by answering 404, so a 404 is a
 * clear "off" and is remembered. Any other failure (offline, a server error)
 * also reads as off, so nothing is offered that may not be there, but it is
 * not remembered and the next page asks again.
 */
export function fetchSuggestionsOn(): Promise<boolean> {
  if (answer && Date.now() - answer.at < REUSE_MS) {
    return Promise.resolve(answer.on);
  }
  request ??= getSuggestionsStatus()
    .then((status) => status.enabled === true)
    .then((on) => {
      answer = { on, at: Date.now() };
      return on;
    })
    .catch((error: unknown) => {
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 404) {
        answer = { on: false, at: Date.now() };
      }
      return false;
    })
    .finally(() => {
      request = null;
    });
  return request;
}

/**
 * True once the API has said ranked matching is on, false when it said off or
 * could not be asked, and null while the first answer is still on its way.
 */
export function useSuggestionsOn(): boolean | null {
  const [on, setOn] = useState<boolean | null>(answer ? answer.on : null);

  useEffect(() => {
    let active = true;
    void fetchSuggestionsOn().then((result) => {
      if (active) setOn(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return on;
}
