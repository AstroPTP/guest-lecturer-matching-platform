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
 */
export async function getPublicUnitCoordinatorProfiles(sort?: DiscoverySort): Promise<PublicUnitCoordinatorProfile[]> {
  const query = sort ? `?${new URLSearchParams({ sort }).toString()}` : "";
  return backendFetch<PublicUnitCoordinatorProfile[]>(`/unit-coordinators${query}`);
}
