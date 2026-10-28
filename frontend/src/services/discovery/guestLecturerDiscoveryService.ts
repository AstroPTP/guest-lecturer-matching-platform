import { backendFetch } from "@/lib/api/backendClient";
import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

/**
 * The unit coordinators a guest lecturer can browse, read from the API in the
 * shape the pages expect.
 *
 * With `forMatches` the list is for the caller's own matches rather than for
 * Discovery: someone the caller has an open report with is kept, so their
 * conversation stays where it was.
 */
export async function getPublicUnitCoordinatorProfiles(options: { forMatches?: boolean } = {}): Promise<PublicUnitCoordinatorProfile[]> {
  return backendFetch<PublicUnitCoordinatorProfile[]>(options.forMatches ? "/unit-coordinators?forMatches=true" : "/unit-coordinators");
}
