import type {
  UnitCoordinatorBasicInformationData,
  UnitCoordinatorConsentData,
  UnitCoordinatorEngagementData,
  UnitCoordinatorExpertiseData,
  UnitCoordinatorProfileData,
} from "@/types/profile/unitCoordinatorProfileTypes";

// TODO(API): Replace every function below with GET/PUT /api/users/me/profile.
// Parse the response into UnitCoordinatorProfileData
// (@/types/profile/unitCoordinatorProfileTypes) and keep these exported
// function names/signatures so callers do not change. No profile data may be
// persisted in the browser (localStorage/sessionStorage).

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
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
