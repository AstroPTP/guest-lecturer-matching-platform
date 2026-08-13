import type {
  GuestLecturerBasicInformationData,
  GuestLecturerConsentData,
  GuestLecturerEngagementData,
  GuestLecturerExpertiseData,
  GuestLecturerProfileData,
} from "@/types/profile/guestLecturerProfileTypes";

//need to connect

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getGuestLecturerBasicInformation(): Promise<GuestLecturerBasicInformationData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveGuestLecturerBasicInformation(_data: GuestLecturerBasicInformationData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getGuestLecturerExpertise(): Promise<GuestLecturerExpertiseData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveGuestLecturerExpertise(_data: GuestLecturerExpertiseData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getGuestLecturerEngagement(): Promise<GuestLecturerEngagementData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveGuestLecturerEngagement(_data: GuestLecturerEngagementData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getGuestLecturerConsent(): Promise<GuestLecturerConsentData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveGuestLecturerConsent(_data: GuestLecturerConsentData): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getGuestLecturerProfile(): Promise<GuestLecturerProfileData | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
