import { backendFetch } from "@/lib/api/backendClient";
import { toPublicUnitCoordinatorProfile, type CoordinatorRow } from "@/lib/api/apiMappers";
import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

/**
 * The unit coordinators a guest lecturer can browse.
 *
 * Reads the API rather than returning a fixed list, so the page shows what is
 * actually stored. The call goes through /api/backend, which attaches the
 * access token server-side, so nothing here handles a credential.
 */
export async function getPublicUnitCoordinatorProfiles(): Promise<PublicUnitCoordinatorProfile[]> {
  const rows = await backendFetch<CoordinatorRow[]>("/unit-coordinators");
  return rows.map(toPublicUnitCoordinatorProfile);
}