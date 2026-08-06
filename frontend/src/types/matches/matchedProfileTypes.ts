import type { MatchRecord } from "@/types/discovery/matchTypes";

import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";

import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

export type MatchedProfile =
  | {
      profileType: "guestLecturer";
      profile: PublicGuestLecturerProfile;
      match: MatchRecord;
    }
  | {
      profileType: "unitCoordinator";
      profile: PublicUnitCoordinatorProfile;
      match: MatchRecord;
    };
