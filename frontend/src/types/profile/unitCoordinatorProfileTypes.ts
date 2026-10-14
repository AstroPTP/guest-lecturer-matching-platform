import type { CommonBasicInformationData, CommonEngagementData, CommonExpertiseData } from "./commonProfileTypes";

export interface UnitCoordinatorBasicInformationData extends CommonBasicInformationData {
  schoolDepartment: string;
  academicRole: string;
}

export interface UnitCoordinatorExpertiseData extends CommonExpertiseData {
  experienceLevelsRequired: string[];
  industryRelevance: string;
  learningObjective: string;
}

export interface UnitCoordinatorScheduleData {
  preferredDays: string[];
  preferredFrom: string;
  preferredTo: string;
  engagementFrequency: string;
  scheduleNotes: string;
}

export interface UnitCoordinatorEngagementData extends CommonEngagementData {
  sessionDuration: string;
  formats: string[];
  schedule: UnitCoordinatorScheduleData;
}

export interface UnitCoordinatorConsentData {
  detailsMatchingConsent: boolean;
  informationAccurate: boolean;
  receiveUpdates: boolean;

  useWithinAgreedScope: boolean;
  noExternalRedistribution: boolean;
  studentPrivacyCompliance: boolean;

  termsAccepted: boolean;
  requestStatus?: string;
}

export interface UnitCoordinatorProfileData {
  basicInformation: UnitCoordinatorBasicInformationData;
  expertise: UnitCoordinatorExpertiseData;
  engagementProfile: UnitCoordinatorEngagementData;
  consentPreferences?: UnitCoordinatorConsentData;
}
