import { backendFetch } from "@/lib/api/backendClient";
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
 * With `forMatches` the list is for the caller's own matches rather than for
 * Discovery: someone the caller has an open report with is kept, so their
 * conversation stays where it was.
 */
export async function getPublicGuestLecturerProfiles(options: { forMatches?: boolean } = {}): Promise<PublicGuestLecturerProfile[]> {
  return backendFetch<PublicGuestLecturerProfile[]>(options.forMatches ? "/guest-speakers?forMatches=true" : "/guest-speakers");
}
