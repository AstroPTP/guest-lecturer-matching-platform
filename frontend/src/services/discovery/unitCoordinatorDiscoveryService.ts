import { backendFetch } from "@/lib/api/backendClient";
import type { DiscoverySort } from "@/types/discovery/discoverySortTypes";
import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";

/**
 * The guest speakers a unit coordinator can browse.
 *
 * Reads the API rather than returning a fixed list, so the page shows what is
 * actually stored. The backend already returns each profile in the shape the
 * pages expect (schedule, delivery focus and topics included), so nothing is
 * mapped here. The call goes through /api/backend, which attaches the access
 * token server-side, so nothing here handles a credential.
 *
 * The API puts the list in the order asked for by `sort`. Left out, it is the
 * best match first while ranked matching is on and the order people joined
 * while it is off. Only the order differs: the same people come back.
 *
 * With `forMatches` the list is for the caller's own matches rather than for
 * Discovery: someone the caller has an open report with is kept, so their
 * conversation stays where it was.
 */
export async function getPublicGuestLecturerProfiles(
  options: { sort?: DiscoverySort; forMatches?: boolean } = {},
): Promise<PublicGuestLecturerProfile[]> {
  const params = new URLSearchParams();
  if (options.sort) {
    params.set("sort", options.sort);
  }
  if (options.forMatches) {
    params.set("forMatches", "true");
  }
  const query = params.toString();
  return backendFetch<PublicGuestLecturerProfile[]>(query ? `/guest-speakers?${query}` : "/guest-speakers");
}
