import { notIntegrated } from "@/lib/serviceErrors";
import type { UnitCoordinatorBasicInformationData, UnitCoordinatorConsentData, UnitCoordinatorEngagementData, UnitCoordinatorExpertiseData,UnitCoordinatorProfileData,
} from "@/types/profile/unitCoordinatorProfileTypes";



export async function getUnitCoordinatorBasicInformation(): Promise<UnitCoordinatorBasicInformationData | null> {
  return notIntegrated();
}

export async function saveUnitCoordinatorBasicInformation(_data: UnitCoordinatorBasicInformationData): Promise<void> {
  return notIntegrated();
}

export async function getUnitCoordinatorExpertise(): Promise<UnitCoordinatorExpertiseData | null> {
  return notIntegrated();
}

export async function saveUnitCoordinatorExpertise(_data: UnitCoordinatorExpertiseData): Promise<void> {
  return notIntegrated();
}

export async function getUnitCoordinatorEngagement(): Promise<UnitCoordinatorEngagementData | null> {
  return notIntegrated();
}

export async function saveUnitCoordinatorEngagement(_data: UnitCoordinatorEngagementData): Promise<void> {
  return notIntegrated();
}

export async function getUnitCoordinatorConsent(): Promise<UnitCoordinatorConsentData | null> {
  return notIntegrated();
}

export async function saveUnitCoordinatorConsent(_data: UnitCoordinatorConsentData): Promise<void> {
  return notIntegrated();
}

export async function getUnitCoordinatorProfile(): Promise<UnitCoordinatorProfileData | null> {
  return null;
}
