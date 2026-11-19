import type { CommonBasicInformationData, CommonEngagementData, CommonExpertiseData } from "./commonProfileTypes";

export interface GuestLecturerBasicInformationData extends CommonBasicInformationData {
  professionalField: string;
  professionalRole: string;
}

export interface GuestLecturerExpertiseData extends CommonExpertiseData {
  experienceLevel: string;
  hasSpeakingExperience: boolean;
  speakingDetails: string;
  hasInternationalExperience: boolean;
  internationalDetails: string;
  linkedin: string;
}

export interface GuestLecturerScheduleData {
  availableDays: string[];
  availableFrom: string;
  availableTo: string;
  availabilityFrequency: string;
  availabilityNotes: string;
}

export interface GuestLecturerEngagementData extends CommonEngagementData {
  sessionDuration: string;
  format: string;
  formats?: string[];
  schedule: GuestLecturerScheduleData;
}

export interface GuestLecturerConsentData {
  profileMatchingConsent: boolean;
  informationAccurate: boolean;
  receiveUpdates: boolean;
  futureTeachingReuse: boolean;
  otherUnitsReuse: boolean;
  timeLimitedUse: boolean;
  termsAccepted: boolean;
}

export interface GuestLecturerProfileData {
  basicInformation: GuestLecturerBasicInformationData;
  expertise: GuestLecturerExpertiseData;
  engagementProfile: GuestLecturerEngagementData;
  consentPreferences?: GuestLecturerConsentData;
}
