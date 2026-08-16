import type { GuestLecturerDiscoveryFilters, UnitCoordinatorDiscoveryFilters } from "@/types/filter/discoveryFilterTypes";

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

// TODO(API): No backend yet, so filters are held in memory (not localStorage,
// not mock data) just so selections survive navigating between Filter and
// Discovery. This resets on a full page reload; replace with the real
// GET/PUT /api/users/me/discovery-filters calls once available.
let currentGuestLecturerFilters: GuestLecturerDiscoveryFilters = { ...emptyGuestLecturerFilters };
let currentUnitCoordinatorFilters: UnitCoordinatorDiscoveryFilters = { ...emptyUnitCoordinatorFilters };

export async function getGuestLecturerDiscoveryFilters(): Promise<GuestLecturerDiscoveryFilters> {
  return currentGuestLecturerFilters;
}

export async function saveGuestLecturerDiscoveryFilters(filters: GuestLecturerDiscoveryFilters): Promise<void> {
  currentGuestLecturerFilters = filters;
}

export async function clearGuestLecturerDiscoveryFilters(): Promise<void> {
  currentGuestLecturerFilters = { ...emptyGuestLecturerFilters };
}

export async function getUnitCoordinatorDiscoveryFilters(): Promise<UnitCoordinatorDiscoveryFilters> {
  return currentUnitCoordinatorFilters;
}

export async function saveUnitCoordinatorDiscoveryFilters(filters: UnitCoordinatorDiscoveryFilters): Promise<void> {
  currentUnitCoordinatorFilters = filters;
}

export async function clearUnitCoordinatorDiscoveryFilters(): Promise<void> {
  currentUnitCoordinatorFilters = { ...emptyUnitCoordinatorFilters };
}
