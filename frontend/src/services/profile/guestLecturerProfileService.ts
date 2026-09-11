import { notIntegrated } from "@/lib/serviceErrors";
import type { GuestLecturerBasicInformationData, GuestLecturerConsentData, GuestLecturerEngagementData, GuestLecturerExpertiseData,  GuestLecturerProfileData } from "@/types/profile/guestLecturerProfileTypes";

export async function getGuestLecturerBasicInformation(): Promise<GuestLecturerBasicInformationData | null> {
  return notIntegrated();
}

export async function saveGuestLecturerBasicInformation(_data: GuestLecturerBasicInformationData): Promise<void> {
  return notIntegrated();
}

export async function getGuestLecturerExpertise(): Promise<GuestLecturerExpertiseData | null> {
  return notIntegrated();
}

export async function saveGuestLecturerExpertise(_data: GuestLecturerExpertiseData): Promise<void> {
  return notIntegrated();
}

export async function getGuestLecturerEngagement(): Promise<GuestLecturerEngagementData | null> {
  return notIntegrated();
}

export async function saveGuestLecturerEngagement(_data: GuestLecturerEngagementData): Promise<void> {
  return notIntegrated();
}

export async function getGuestLecturerConsent(): Promise<GuestLecturerConsentData | null> {
  return notIntegrated();
}

export async function saveGuestLecturerConsent(_data: GuestLecturerConsentData): Promise<void> {
  return notIntegrated();
}

export async function getGuestLecturerProfile(): Promise<GuestLecturerProfileData | null> {
  return null;
}
