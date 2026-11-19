/**
 * How a Discovery list can be ordered. The API takes the value as `?sort=`.
 *
 * `best` is the ranked order and is on offer only while an administrator has
 * switched ranked matching on. The others are plain attribute sorts that are
 * always there.
 */
export type DiscoverySort = "joined" | "newest" | "name" | "topics" | "active" | "best";

export interface DiscoverySortOption {
  value: DiscoverySort;
  label: string;
}

export const DISCOVERY_SORT_VALUES: readonly DiscoverySort[] = ["joined", "newest", "name", "topics", "active", "best"];
