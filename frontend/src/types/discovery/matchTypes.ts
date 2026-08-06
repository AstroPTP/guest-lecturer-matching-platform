import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";

export interface InterestRecord {
  fromUserId: string;
  toUserId: string;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  firstUserId: string;
  secondUserId: string;
  createdAt: string;
}

export interface DismissRecord {
  fromUserId: string;
  toUserId: string;
  createdAt: string;
}

export interface BlockRecord {
  fromUserId: string;
  toUserId: string;
  createdAt: string;
}

export interface MatchResult {
  matched: boolean;
  match: MatchRecord | null;
}

export interface MatchModalData {
  match: MatchRecord;
  matchedItem: DiscoveryItem;
}
