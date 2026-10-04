import { getMatches } from "@/services/discovery/matchService";
import { getPublicUnitCoordinatorProfiles } from "@/services/discovery/guestLecturerDiscoveryService";
import { getPublicGuestLecturerProfiles } from "@/services/discovery/unitCoordinatorDiscoveryService";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import type { UserRole } from "@/types/shared/userRole";

/**
 * The caller's accepted matches, each with the other person's profile.
 *
 * A match only carries the other profile's id, so it is joined against the
 * profiles of the other role, the same list Discovery shows.
 */
export async function getMatchedProfiles(currentUserType: UserRole): Promise<MatchedProfile[]> {
  const matches = await getMatches();
  if (matches.length === 0) {
    return [];
  }

  if (currentUserType === "guestLecturer") {
    const profiles = await getPublicUnitCoordinatorProfiles();
    return matches.flatMap((match) => {
      const profile = profiles.find((item) => item.id === match.secondUserId);
      return profile ? [{ profileType: "unitCoordinator" as const, profile, match }] : [];
    });
  }

  const profiles = await getPublicGuestLecturerProfiles();
  return matches.flatMap((match) => {
    const profile = profiles.find((item) => item.id === match.secondUserId);
    return profile ? [{ profileType: "guestLecturer" as const, profile, match }] : [];
  });
}
