"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useSuggestionsOn } from "@/lib/hooks/useSuggestionsOn";
import {
  DISCOVERY_SORT_VALUES,
  type DiscoverySort,
  type DiscoverySortOption,
} from "@/types/discovery/discoverySortTypes";
import type { UserRole } from "@/types/shared/userRole";

const MANUAL_OPTIONS: DiscoverySortOption[] = [
  { value: "joined", label: "Joined (oldest first)" },
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name (A to Z)" },
  { value: "topics", label: "Most shared topics" },
  { value: "active", label: "Recently active" },
];

const BEST_OPTION: DiscoverySortOption = { value: "best", label: "Best match" };

/** The sorts on offer: Best match first, only while ranked matching is on, then the manual ones. */
export function discoverySortOptions(rankedMatchingOn: boolean): DiscoverySortOption[] {
  return rankedMatchingOn ? [BEST_OPTION, ...MANUAL_OPTIONS] : MANUAL_OPTIONS;
}

/**
 * The sort that applies when the person has not chosen one, or chose one that
 * is no longer on offer: Best match while ranked matching is on, and the order
 * people joined while it is off.
 */
export function defaultDiscoverySort(rankedMatchingOn: boolean): DiscoverySort {
  return rankedMatchingOn ? "best" : "joined";
}

function storageKey(role: UserRole): string {
  return `glmp.discoverySort.${role}`;
}

function isSort(value: unknown): value is DiscoverySort {
  return typeof value === "string" && (DISCOVERY_SORT_VALUES as readonly string[]).includes(value);
}

/** What was last chosen on this browser, or null. Storage can be blocked, so every access is guarded. */
function readChoice(role: UserRole): DiscoverySort | null {
  try {
    const stored = window.localStorage.getItem(storageKey(role));
    return isSort(stored) ? stored : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeChoice(role: UserRole, sort: DiscoverySort) {
  try {
    window.localStorage.setItem(storageKey(role), sort);
  } catch {
    // The choice still applies for this visit; it is just not remembered.
  }
  listeners.forEach((listener) => listener());
}

export interface DiscoverySortState {
  /** The sort to ask the API for. Meaningful only once `ready`. */
  sort: DiscoverySort;
  options: DiscoverySortOption[];
  /** False until it is known whether ranked matching is on and what was chosen before. */
  ready: boolean;
  choose: (sort: DiscoverySort) => void;
}

/**
 * The Sort by choice for a Discovery page.
 *
 * Which options exist comes from the API (Best match only while ranked matching
 * is on). A choice is remembered on this browser, in storage that may be
 * unavailable. A remembered choice that is not on offer, such as Best match
 * after an administrator switched ranked matching off, gives way to the default.
 */
export function useDiscoverySort(role: UserRole): DiscoverySortState {
  const rankedMatchingOn = useSuggestionsOn();
  // Storage exists only in the browser: the server has not read it, so its
  // answer is undefined, which is different from "nothing was chosen" (null).
  const chosen = useSyncExternalStore(
    subscribe,
    () => readChoice(role),
    () => undefined,
  );
  // Storage may refuse writes, and then the choice is only kept for this visit.
  const [visitChoice, setVisitChoice] = useState<DiscoverySort | null>(null);

  const choose = useCallback(
    (next: DiscoverySort) => {
      setVisitChoice(next);
      writeChoice(role, next);
    },
    [role],
  );

  const on = rankedMatchingOn === true;
  const options = discoverySortOptions(on);
  const wanted = visitChoice ?? chosen ?? null;
  const offered = wanted && options.some((option) => option.value === wanted) ? wanted : null;
  return {
    sort: offered ?? defaultDiscoverySort(on),
    options,
    ready: rankedMatchingOn !== null && chosen !== undefined,
    choose,
  };
}
