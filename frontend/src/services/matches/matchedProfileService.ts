import { getMatches } from "@/services/discovery/matchService";
import { getPublicUnitCoordinatorProfiles } from "@/services/discovery/guestLecturerDiscoveryService";
import { getPublicGuestLecturerProfiles } from "@/services/discovery/unitCoordinatorDiscoveryService";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import type { UserRole } from "@/types/shared/userRole";

/**
 * The caller's accepted matches, each with the other person's profile.
 *
 * A match only carries the other profile's id, so it is joined against the
 * profiles of the other role. The list asked for is the one for matches, not
 * the one Discovery shows: Discovery leaves out someone the caller has an open
 * report with, but their conversation stays in the caller's Messages.
 */
export async function getMatchedProfiles(currentUserType: UserRole): Promise<MatchedProfile[]> {
  const matches = await getMatches();
  if (matches.length === 0) {
    return [];
  }

  if (currentUserType === "guestLecturer") {
    const profiles = await getPublicUnitCoordinatorProfiles({ forMatches: true });
    return matches.flatMap((match) => {
      const profile = profiles.find((item) => item.id === match.secondUserId);
      return profile ? [{ profileType: "unitCoordinator" as const, profile, match }] : [];
    });
  }

  const profiles = await getPublicGuestLecturerProfiles({ forMatches: true });
  return matches.flatMap((match) => {
    const profile = profiles.find((item) => item.id === match.secondUserId);
    return profile ? [{ profileType: "guestLecturer" as const, profile, match }] : [];
  });
}
