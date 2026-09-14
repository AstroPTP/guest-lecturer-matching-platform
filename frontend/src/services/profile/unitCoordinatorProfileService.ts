import { apiFetch } from "@/lib/apiClient";
import type {
  UnitCoordinatorBasicInformationData,
  UnitCoordinatorConsentData,
  UnitCoordinatorEngagementData,
  UnitCoordinatorExpertiseData,
  UnitCoordinatorProfileData,
} from "@/types/profile/unitCoordinatorProfileTypes";

export async function getUnitCoordinatorProfile(): Promise<UnitCoordinatorProfileData | null> {
  return apiFetch("/unit-coordinators/me");
}

export async function getUnitCoordinatorBasicInformation(): Promise<UnitCoordinatorBasicInformationData | null> {
  const profile = await getUnitCoordinatorProfile();
  return profile?.basicInformation ?? null;
}

export async function saveUnitCoordinatorBasicInformation(data: UnitCoordinatorBasicInformationData): Promise<void> {
  await apiFetch("/unit-coordinators/me/basic-information", { method: "PATCH", body: JSON.stringify(data) });
}

export async function getUnitCoordinatorExpertise(): Promise<UnitCoordinatorExpertiseData | null> {
  const profile = await getUnitCoordinatorProfile();
  return profile?.expertise ?? null;
}

export async function saveUnitCoordinatorExpertise(data: UnitCoordinatorExpertiseData): Promise<void> {
  await apiFetch("/unit-coordinators/me/expertise", { method: "PATCH", body: JSON.stringify(data) });
}

export async function getUnitCoordinatorEngagement(): Promise<UnitCoordinatorEngagementData | null> {
  const profile = await getUnitCoordinatorProfile();
  return profile?.engagementProfile ?? null;
}

export async function saveUnitCoordinatorEngagement(data: UnitCoordinatorEngagementData): Promise<void> {
  await apiFetch("/unit-coordinators/me/engagement", { method: "PATCH", body: JSON.stringify(data) });
}

export async function getUnitCoordinatorConsent(): Promise<UnitCoordinatorConsentData | null> {
  const profile = await getUnitCoordinatorProfile();
  return profile?.consentPreferences ?? null;
}

export async function saveUnitCoordinatorConsent(data: UnitCoordinatorConsentData): Promise<void> {
  await apiFetch("/unit-coordinators/me/consent", { method: "PATCH", body: JSON.stringify(data) });
}