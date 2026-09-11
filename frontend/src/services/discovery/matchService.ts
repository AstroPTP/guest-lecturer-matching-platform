import { notIntegrated } from "@/lib/serviceErrors";
import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord, MatchResult } from "@/types/discovery/matchTypes";

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
  return notIntegrated();
}

export async function removeInterest(_targetUserId: string): Promise<void> {
  return notIntegrated();
}

export async function dismissProfile(_targetUserId: string): Promise<void> {
  return notIntegrated();
}

export async function removeDismiss(_targetUserId: string): Promise<void> {
  return notIntegrated();
}

export async function unmatchUsers(_targetUserId: string): Promise<void> {
  return notIntegrated();
}
