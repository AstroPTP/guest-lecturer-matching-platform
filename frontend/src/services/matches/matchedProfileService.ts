import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import type { UserRole } from "@/types/shared/userRole";

export async function getMatchedProfiles(_currentUserType: UserRole): Promise<MatchedProfile[]> {
  return [];
}
