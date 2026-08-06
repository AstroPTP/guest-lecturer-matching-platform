import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

// TODO(API): Replace with GET /api/discovery (cursor, limit, filters).
// Map paginated PublicUnitCoordinatorProfile items (see
// @/types/discovery/publicUnitCoordinatorProfileTypes) from the response.
// Expose only an explicit, auditable allow-list of UnitCoordinatorProfileData
// fields (basicInformation, expertise, engagementProfile) — never
// consentPreferences or other private fields — matching the shape currently
// declared by PublicUnitCoordinatorProfile.
export async function getPublicUnitCoordinatorProfiles(): Promise<PublicUnitCoordinatorProfile[]> {
  throw new Error("This action isn't connected to a backend yet.");
}
