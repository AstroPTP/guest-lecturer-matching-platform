import { backendFetch } from "@/lib/api/backendClient";
import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

/**
 * The unit coordinators a guest lecturer can browse, read from the API in the
 * shape the pages expect.
 */
export async function getPublicUnitCoordinatorProfiles(): Promise<PublicUnitCoordinatorProfile[]> {
  return backendFetch<PublicUnitCoordinatorProfile[]>("/unit-coordinators");
}
