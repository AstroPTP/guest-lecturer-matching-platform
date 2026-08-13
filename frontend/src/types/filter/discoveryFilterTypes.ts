export interface GuestLecturerDiscoveryFilters {
  topics: string[];
  formats: string[];
  sessionDurations: string[];
  audienceSizes: string[];
  preferredDays: string[];
  location: string;
}

export interface UnitCoordinatorDiscoveryFilters {
  topics: string[];
  experienceLevels: string[];
  professionalFields: string[];
  formats: string[];
  sessionDurations: string[];
  availableDays: string[];
  location: string;
  requiresSpeakingExperience: boolean;
  requiresInternationalExperience: boolean;
}
