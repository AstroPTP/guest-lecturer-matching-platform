import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord, MatchResult } from "@/types/discovery/matchTypes";

// TODO(API): This module simulated interest/dismiss/match/block records in
// browser storage. Replace with the endpoints in BACKEND_HANDOFF.md:
//   getInterests/getMatches/getDismisses/getBlocks -> GET equivalents, or
//     fold into the discovery/matches responses directly
//   expressInterest -> POST /api/interests (server decides match atomically)
//   removeInterest  -> DELETE /api/interests/:targetUserId
//   dismissProfile  -> POST /api/discovery/dismissals
//   removeDismiss   -> DELETE /api/discovery/dismissals/:targetUserId
//   unmatchUsers    -> DELETE /api/matches/:id, POST /api/blocks
// TODO(BACKEND): Enforce idempotency and authorization for all of the above
// server-side; the client must not be trusted to decide match/undo outcomes.
// No interest/dismiss/match/block data may be persisted in the browser.

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getInterests(): Promise<InterestRecord[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getMatches(): Promise<MatchRecord[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getDismisses(): Promise<DismissRecord[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getBlocks(): Promise<BlockRecord[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function expressInterest(_fromUserId: string, _toUserId: string): Promise<MatchResult> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function removeInterest(_fromUserId: string, _toUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function dismissProfile(_fromUserId: string, _toUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function removeDismiss(_fromUserId: string, _toUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function unmatchUsers(_firstUserId: string, _secondUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
