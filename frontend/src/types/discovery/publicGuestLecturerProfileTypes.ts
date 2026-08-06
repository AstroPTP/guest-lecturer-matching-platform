import type { GuestLecturerBasicInformationData, GuestLecturerEngagementData, GuestLecturerExpertiseData } from "@/types/profile/guestLecturerProfileTypes";

export interface PublicGuestLecturerProfile {
  id: string;

  basicInformation: GuestLecturerBasicInformationData;

  expertise: GuestLecturerExpertiseData;

  engagementProfile: GuestLecturerEngagementData;
}
