import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";

import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

export type DiscoveryItem =
  | {
      profileType: "guestLecturer";
      profile: PublicGuestLecturerProfile;
    }
   {
      profileType: "unitCoordinator";
      profile: PublicUnitCoordinatorProfile;
    };
