import { backendFetch } from "@/lib/api/backendClient";
import { notIntegrated } from "@/lib/serviceErrors";
import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord, MatchResult } from "@/types/discovery/matchTypes";

/** A match request row as the API returns it. */
interface MatchRequestRow {
  match_id: number | string;
  coordinator_id: number | string;
  guest_id: number | string;
  status?: string | null;
  requested_at?: string | null;
}

function toMatchRecord(row: MatchRequestRow): MatchRecord {
  return {
    id: String(row.match_id),
    firstUserId: String(row.coordinator_id),
    secondUserId: String(row.guest_id),
    createdAt: row.requested_at ?? "",
  };
}

export async function getInterests(): Promise<InterestRecord[]> {
  return [];
}

/**
 * The match requests that exist, from the API.
 *
 * Returns stored rows rather than a fixed list, so what the page shows survives
 * a restart. Ids are the ones the database assigned, which is what a later
 * write has to reference.
 */
export async function getMatches(): Promise<MatchRecord[]> {
  const rows = await backendFetch<MatchRequestRow[]>("/match-requests");
  return rows.map(toMatchRecord);
}

// TODO(API): No dismiss endpoint yet, so dismissals are held in memory (the
// same approach as discovery filters) so a user can move past a card. This
// resets on a full page reload; replace with real calls once available.
// fromUserId is left empty to match the current-user placeholder Discovery
// compares against.
let currentDismisses: DismissRecord[] = [];

export async function getDismisses(): Promise<DismissRecord[]> {
  return currentDismisses;
}

export async function getBlocks(): Promise<BlockRecord[]> {
  return [];
}

/**
 * Raises a match request against a guest speaker.
 *
 * The id is the one the discovery list carried, which is the database id, so
 * the row it creates points at something real.
 */
export async function expressInterest(targetUserId: string): Promise<MatchResult> {
  const row = await backendFetch<MatchRequestRow>("/match-requests", {
    method: "POST",
    body: JSON.stringify({ speakerId: targetUserId, unitId: targetUserId }),
  });

  return { matched: true, match: toMatchRecord(row) };
}

export async function removeInterest(_targetUserId: string): Promise<void> {
  return notIntegrated();
}

export async function dismissProfile(targetUserId: string): Promise<void> {
  if (currentDismisses.some((dismiss) => dismiss.toUserId === targetUserId)) {
    return;
  }
  currentDismisses = [...currentDismisses, { fromUserId: "", toUserId: targetUserId, createdAt: new Date().toISOString() }];
}

export async function removeDismiss(targetUserId: string): Promise<void> {
  currentDismisses = currentDismisses.filter((dismiss) => dismiss.toUserId !== targetUserId);
}

export async function unmatchUsers(_targetUserId: string): Promise<void> {
  return notIntegrated();
}
