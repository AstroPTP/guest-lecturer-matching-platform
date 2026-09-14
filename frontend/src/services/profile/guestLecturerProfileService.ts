import { apiFetch } from "@/lib/apiClient";
import type {
  GuestLecturerBasicInformationData,
  GuestLecturerConsentData,
  GuestLecturerEngagementData,
  GuestLecturerExpertiseData,
  GuestLecturerProfileData,
} from "@/types/profile/guestLecturerProfileTypes";

export async function getGuestLecturerProfile(): Promise<GuestLecturerProfileData | null> {
  return apiFetch("/guest-speakers/me");
}

export async function getGuestLecturerBasicInformation(): Promise<GuestLecturerBasicInformationData | null> {
  const profile = await getGuestLecturerProfile();
  return profile?.basicInformation ?? null;
}

export async function saveGuestLecturerBasicInformation(data: GuestLecturerBasicInformationData): Promise<void> {
  await apiFetch("/guest-speakers/me/basic-information", { method: "PATCH", body: JSON.stringify(data) });
}

export async function getGuestLecturerExpertise(): Promise<GuestLecturerExpertiseData | null> {
  const profile = await getGuestLecturerProfile();
  return profile?.expertise ?? null;
}

export async function saveGuestLecturerExpertise(data: GuestLecturerExpertiseData): Promise<void> {
  await apiFetch("/guest-speakers/me/expertise", { method: "PATCH", body: JSON.stringify(data) });
}

export async function getGuestLecturerEngagement(): Promise<GuestLecturerEngagementData | null> {
  const profile = await getGuestLecturerProfile();
  return profile?.engagementProfile ?? null;
}

export async function saveGuestLecturerEngagement(data: GuestLecturerEngagementData): Promise<void> {
  await apiFetch("/guest-speakers/me/engagement", { method: "PATCH", body: JSON.stringify(data) });
}

export async function getGuestLecturerConsent(): Promise<GuestLecturerConsentData | null> {
  const profile = await getGuestLecturerProfile();
  return profile?.consentPreferences ?? null;
}

export async function saveGuestLecturerConsent(data: GuestLecturerConsentData): Promise<void> {
  await apiFetch("/guest-speakers/me/consent", { method: "PATCH", body: JSON.stringify(data) });
}