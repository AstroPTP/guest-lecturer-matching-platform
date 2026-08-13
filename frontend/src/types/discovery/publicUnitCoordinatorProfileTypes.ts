import type {
  UnitCoordinatorBasicInformationData,
  UnitCoordinatorEngagementData,
  UnitCoordinatorExpertiseData,
} from "@/types/profile/unitCoordinatorProfileTypes";

export interface PublicUnitCoordinatorProfile {
  id: string;

  basicInformation: UnitCoordinatorBasicInformationData;

  expertise: UnitCoordinatorExpertiseData;

  engagementProfile: UnitCoordinatorEngagementData;
}
