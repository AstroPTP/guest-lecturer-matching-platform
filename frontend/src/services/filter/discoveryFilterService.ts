import type { GuestLecturerDiscoveryFilters, UnitCoordinatorDiscoveryFilters } from "@/types/filter/discoveryFilterTypes";

//need to connect

export const emptyGuestLecturerFilters: GuestLecturerDiscoveryFilters = {
  topics: [],
  formats: [],
  sessionDurations: [],
  audienceSizes: [],
  preferredDays: [],
  location: "",
};

export const emptyUnitCoordinatorFilters: UnitCoordinatorDiscoveryFilters = {
  topics: [],
  experienceLevels: [],
  professionalFields: [],
  formats: [],
  sessionDurations: [],
  availableDays: [],
  location: "",
  requiresSpeakingExperience: false,
  requiresInternationalExperience: false,
};

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getGuestLecturerDiscoveryFilters(): Promise<GuestLecturerDiscoveryFilters> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveGuestLecturerDiscoveryFilters(_filters: GuestLecturerDiscoveryFilters): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function clearGuestLecturerDiscoveryFilters(): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getUnitCoordinatorDiscoveryFilters(): Promise<UnitCoordinatorDiscoveryFilters> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function saveUnitCoordinatorDiscoveryFilters(_filters: UnitCoordinatorDiscoveryFilters): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function clearUnitCoordinatorDiscoveryFilters(): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
