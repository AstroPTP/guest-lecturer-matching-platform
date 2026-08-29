import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord, MatchResult } from "@/types/discovery/matchTypes";
const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getInterests(): Promise<InterestRecord[]> {
  return [];
}

export async function getMatches(): Promise<MatchRecord[]> {
  return [];
}

export async function getDismisses(): Promise<DismissRecord[]> {
  return [];
}

export async function getBlocks(): Promise<BlockRecord[]> {
  return [];
}

export async function expressInterest(_targetUserId: string): Promise<MatchResult> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function removeInterest(_targetUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function dismissProfile(_targetUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function removeDismiss(_targetUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function unmatchUsers(_targetUserId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
