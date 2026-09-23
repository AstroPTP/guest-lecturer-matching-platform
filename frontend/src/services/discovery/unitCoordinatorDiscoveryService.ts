import { backendFetch } from "@/lib/api/backendClient";
import { toPublicGuestLecturerProfile, type GuestSpeakerRow } from "@/lib/api/apiMappers";
import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";

/**
 * The guest speakers a unit coordinator can browse.
 *
 * Reads the API rather than returning a fixed list, so the page shows what is
 * actually stored. The call goes through /api/backend, which attaches the
 * access token server-side, so nothing here handles a credential.
 */
export async function getPublicGuestLecturerProfiles(): Promise<PublicGuestLecturerProfile[]> {
  const rows = await backendFetch<GuestSpeakerRow[]>("/guest-speakers");
  return rows.map(toPublicGuestLecturerProfile);
}