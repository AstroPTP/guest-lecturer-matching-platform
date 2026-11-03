import { backendFetch } from "@/lib/api/backendClient";
import type { DiscoverySort } from "@/types/discovery/discoverySortTypes";
import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

/**
 * The unit coordinators a guest lecturer can browse, read from the API in the
 * shape the pages expect.
 *
 * The API puts the list in the order asked for by `sort`. Left out, it is the
 * best match first while ranked matching is on and the order people joined
 * while it is off. Only the order differs: the same people come back.
 *
 * With `forMatches` the list is for the caller's own matches rather than for
 * Discovery: someone the caller has an open report with is kept, so their
 * conversation stays where it was.
 */
export async function getPublicUnitCoordinatorProfiles(
  options: { sort?: DiscoverySort; forMatches?: boolean } = {},
): Promise<PublicUnitCoordinatorProfile[]> {
  const params = new URLSearchParams();
  if (options.sort) {
    params.set("sort", options.sort);
  }
  if (options.forMatches) {
    params.set("forMatches", "true");
  }
  const query = params.toString();
  return backendFetch<PublicUnitCoordinatorProfile[]>(query ? `/unit-coordinators?${query}` : "/unit-coordinators");
}
