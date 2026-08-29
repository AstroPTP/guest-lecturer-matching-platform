import type { UnitCoordinatorBasicInformationData, UnitCoordinatorConsentData, UnitCoordinatorEngagementData, UnitCoordinatorExpertiseData,UnitCoordinatorProfileData,
} from "@/types/profile/unitCoordinatorProfileTypes";


const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getUnitCoordinatorBasicInformation(): Promise<UnitCoordinatorBasicInformationData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveUnitCoordinatorBasicInformation(_data: UnitCoordinatorBasicInformationData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getUnitCoordinatorExpertise(): Promise<UnitCoordinatorExpertiseData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveUnitCoordinatorExpertise(_data: UnitCoordinatorExpertiseData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getUnitCoordinatorEngagement(): Promise<UnitCoordinatorEngagementData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveUnitCoordinatorEngagement(_data: UnitCoordinatorEngagementData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getUnitCoordinatorConsent(): Promise<UnitCoordinatorConsentData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveUnitCoordinatorConsent(_data: UnitCoordinatorConsentData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getUnitCoordinatorProfile(): Promise<UnitCoordinatorProfileData | null> {
  return null;
}
