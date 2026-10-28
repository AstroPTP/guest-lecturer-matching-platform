import { BackendError, backendFetch } from "@/lib/api/backendClient";
import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord, MatchResult } from "@/types/discovery/matchTypes";
import { CURRENT_USER_PLACEHOLDER_ID } from "@/utils/discoveryFilters";

/** A match request as the API returns it: the caller's own, keyed by the other profile. */
interface MatchRequestRow {
  matchId: string;
  targetId: string;
  status: string;
  requestedAt: string;
  sentByMe: boolean;
}

// The API only ever returns the caller's own requests, so each record is marked
// as coming from the current-user placeholder Discovery compares against.
function toMatchRecord(row: MatchRequestRow): MatchRecord {
  return {
    id: row.matchId,
    firstUserId: CURRENT_USER_PLACEHOLDER_ID,
    secondUserId: row.targetId,
    createdAt: row.requestedAt,
  };
}

function getMyMatchRequests(): Promise<MatchRequestRow[]> {
  return backendFetch<MatchRequestRow[]>("/match-requests");
}

/**
 * Profiles Discovery should hide because of a request: ones the caller asked
 * that are not (yet) a match, and ended matches, whoever ended them. A request
 * the other side sent is left out, so that profile stays in Discovery and the
 * caller can accept it by expressing interest back.
 */
export async function getInterests(): Promise<InterestRecord[]> {
  const rows = await getMyMatchRequests();
  return rows
    .filter((row) => row.status === "UNMATCHED" || (row.sentByMe && row.status !== "ACCEPTED"))
    .map((row) => ({ fromUserId: CURRENT_USER_PLACEHOLDER_ID, toUserId: row.targetId, createdAt: row.requestedAt }));
}

/** The caller's accepted requests. */
export async function getMatches(): Promise<MatchRecord[]> {
  const rows = await getMyMatchRequests();
  return rows.filter((row) => row.status === "ACCEPTED").map(toMatchRecord);
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
 * Raises a match request against another profile. The backend works out the
 * caller's own side from their token, so only the other profile's id is sent.
 */
export async function expressInterest(targetUserId: string): Promise<MatchResult> {
  const row = await backendFetch<MatchRequestRow>("/match-requests", {
    method: "POST",
    body: JSON.stringify({ targetId: targetUserId }),
  });

  const matched = row.status === "ACCEPTED";
  return { matched, match: matched ? toMatchRecord(row) : null };
}

/** The code the API answers with when the person's own account is on hold. */
const ACCOUNT_ON_HOLD_CODE = "ACCOUNT_ON_HOLD";

/**
 * The API's own wording when a request was refused because the person's account
 * is on hold, which is safe to show as sent. Undefined for any other failure.
 */
export function getAccountOnHoldMessage(error: unknown): string | undefined {
  return error instanceof BackendError && error.status === 403 && error.code === ACCOUNT_ON_HOLD_CODE ? error.message : undefined;
}

export async function removeInterest(targetUserId: string): Promise<void> {
  await backendFetch<void>("/match-requests/" + encodeURIComponent(targetUserId), { method: "DELETE" });
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

export async function unmatchUsers(targetUserId: string): Promise<void> {
  await backendFetch<void>("/match-requests/" + encodeURIComponent(targetUserId), { method: "DELETE" });
}
