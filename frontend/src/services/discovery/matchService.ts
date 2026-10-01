import { backendFetch } from "@/lib/api/backendClient";
import { notIntegrated } from "@/lib/serviceErrors";
import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord, MatchResult } from "@/types/discovery/matchTypes";
import { CURRENT_USER_PLACEHOLDER_ID } from "@/utils/discoveryFilters";

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

/** A dismissal as the API returns it: which profile, and when. */
interface DismissalRow {
  targetId: string;
  dismissedAt: string;
}

/**
 * The profiles the signed-in user has dismissed, from the API, so they stay
 * hidden after signing out and back in.
 *
 * The API only ever returns the caller's own dismissals, so each record is
 * marked as coming from the current-user placeholder Discovery compares against.
 */
export async function getDismisses(): Promise<DismissRecord[]> {
  const rows = await backendFetch<DismissalRow[]>("/dismissals");
  return rows.map((row) => ({ fromUserId: CURRENT_USER_PLACEHOLDER_ID, toUserId: row.targetId, createdAt: row.dismissedAt }));
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
  await backendFetch<DismissalRow>("/dismissals", {
    method: "POST",
    body: JSON.stringify({ targetId: targetUserId }),
  });
}

export async function removeDismiss(targetUserId: string): Promise<void> {
  await backendFetch<void>("/dismissals/" + encodeURIComponent(targetUserId), { method: "DELETE" });
}

export async function unmatchUsers(_targetUserId: string): Promise<void> {
  return notIntegrated();
}
