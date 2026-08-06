import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";

import type { UserRole } from "@/types/shared/userRole";

// TODO(API): Replace with GET /api/matches (cursor, limit) returning matches
// with their public profile already joined server-side, instead of composing
// local match/discovery records on the client.
export async function getMatchedProfiles(_currentUserId: string, _currentUserType: UserRole): Promise<MatchedProfile[]> {
  throw new Error("This action isn't connected to a backend yet.");
}
