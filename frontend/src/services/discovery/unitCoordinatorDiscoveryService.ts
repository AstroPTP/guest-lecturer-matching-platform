import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";

// TODO(API): Replace with GET /api/discovery (cursor, limit, filters).
// Map paginated PublicGuestLecturerProfile items (see
// @/types/discovery/publicGuestLecturerProfileTypes) from the response.
// Expose only an explicit, auditable allow-list of GuestLecturerProfileData
// fields (basicInformation, expertise, engagementProfile) — never
// consentPreferences or other private fields — matching the shape currently
// declared by PublicGuestLecturerProfile.
export async function getPublicGuestLecturerProfiles(): Promise<PublicGuestLecturerProfile[]> {
  throw new Error("This action isn't connected to a backend yet.");
}
