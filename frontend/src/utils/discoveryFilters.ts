import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";
import type { BlockRecord, DismissRecord, InterestRecord, MatchRecord } from "@/types/discovery/matchTypes";
import type { GuestLecturerDiscoveryFilters, UnitCoordinatorDiscoveryFilters } from "@/types/filter/discoveryFilterTypes";
import { normalizeOptionValue } from "@/utils/displayFormatters";

// Which discovery profiles a user sees: the ones they haven't acted on, narrowed
// by their saved filters. Shared by Discovery and the Filters page so both count
// profiles the same way.

export const CURRENT_USER_PLACEHOLDER_ID = "";

// Audience sizes that don't rule any size out, so a coordinator with one of
// these matches whichever audience size a guest lecturer filters on.
const OPEN_AUDIENCE_SIZES = ["no-preference", "unknown"];

export function applyGuestLecturerFilters(items: DiscoveryItem[], filters: GuestLecturerDiscoveryFilters): DiscoveryItem[] {
  return items.filter((item) => {
    if (item.profileType !== "unitCoordinator") {
      return false;
    }

    const { expertise, engagementProfile } = item.profile;
    const matchesTopics = filters.topics.length === 0 || filters.topics.some((topic) => includesOption(expertise.selectedTopics, topic));
    const matchesFormats = filters.formats.length === 0 || filters.formats.some((format) => includesOption(engagementProfile.formats, format));
    const matchesDurations = filters.sessionDurations.length === 0 || includesOption(filters.sessionDurations, engagementProfile.sessionDuration);
    const matchesAudience =
      filters.audienceSizes.length === 0 ||
      includesOption(OPEN_AUDIENCE_SIZES, engagementProfile.audienceSize) ||
      includesOption(filters.audienceSizes, engagementProfile.audienceSize);
    const matchesDays = filters.preferredDays.length === 0 || filters.preferredDays.some((day) => includesOption(engagementProfile.schedule.preferredDays, day));
    const matchesLocation = !filters.location.trim() || engagementProfile.primaryLocation.toLowerCase().includes(filters.location.trim().toLowerCase());
    return matchesTopics && matchesFormats && matchesDurations && matchesAudience && matchesDays && matchesLocation;
  });
}

export function applyUnitCoordinatorFilters(items: DiscoveryItem[], filters: UnitCoordinatorDiscoveryFilters): DiscoveryItem[] {
  return items.filter((item) => {
    if (item.profileType !== "guestLecturer") {
      return false;
    }
    const { basicInformation, expertise, engagementProfile } = item.profile;
    const matchesTopics = filters.topics.length === 0 || filters.topics.some((topic) => includesOption(expertise.selectedTopics, topic));
    const matchesExperience = filters.experienceLevels.length === 0 || includesOption(filters.experienceLevels, expertise.experienceLevel);
    const matchesField = filters.professionalFields.length === 0 || includesOption(filters.professionalFields, basicInformation.professionalField);
    const matchesFormats = filters.formats.length === 0 || filters.formats.some((format) => includesOption(engagementProfile.formats ?? [], format));
    const matchesDurations = filters.sessionDurations.length === 0 || includesOption(filters.sessionDurations, engagementProfile.sessionDuration);
    const matchesDays = filters.availableDays.length === 0 || filters.availableDays.some((day) => includesOption(engagementProfile.schedule.availableDays, day));
    const matchesSpeaking = !filters.requiresSpeakingExperience || expertise.hasSpeakingExperience;
    const matchesInternational = !filters.requiresInternationalExperience || expertise.hasInternationalExperience;
    const matchesLocation = !filters.location.trim() || engagementProfile.primaryLocation.toLowerCase().includes(filters.location.trim().toLowerCase());
    return matchesTopics && matchesExperience && matchesField && matchesFormats && matchesDurations && matchesDays && matchesSpeaking && matchesInternational && matchesLocation;
  });
}

function includesOption(values: string[], value: string): boolean {
  const target = normalizeOptionValue(value);
  return values.some((item) => normalizeOptionValue(item) === target);
}

// Counts filter categories in use, not individual selections, so picking three
// topics still reads as one active filter.
export function countActiveFilters(filters: GuestLecturerDiscoveryFilters | UnitCoordinatorDiscoveryFilters): number {
  return Object.values(filters).filter((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "string") {
      return value.trim() !== "";
    }
    return value === true;
  }).length;
}

export function getAvailableDiscoveryItems(
  items: DiscoveryItem[],
  interests: InterestRecord[],
  dismisses: DismissRecord[],
  matches: MatchRecord[],
  blocks: BlockRecord[],
): DiscoveryItem[] {
  return items.filter((item) => {
    const targetUserId = item.profile.id;

    const alreadyInterested = interests.some(
      (interest) => interest.fromUserId === CURRENT_USER_PLACEHOLDER_ID && interest.toUserId === targetUserId,
    );
    const alreadyDismissed = dismisses.some(
      (dismiss) => dismiss.fromUserId === CURRENT_USER_PLACEHOLDER_ID && dismiss.toUserId === targetUserId,
    );
    return !alreadyInterested && !alreadyDismissed && !isMatchedOrBlocked(targetUserId, matches, blocks);
  });
}

export function getDismissedDiscoveryItems(
  items: DiscoveryItem[],
  dismisses: DismissRecord[],
  matches: MatchRecord[],
  blocks: BlockRecord[],
): DiscoveryItem[] {
  return items.filter((item) => {
    const targetUserId = item.profile.id;

    const dismissedByCurrentUser = dismisses.some(
      (dismiss) => dismiss.fromUserId === CURRENT_USER_PLACEHOLDER_ID && dismiss.toUserId === targetUserId,
    );

    return dismissedByCurrentUser && !isMatchedOrBlocked(targetUserId, matches, blocks);
  });
}

function isSameUserPair(firstStoredUserId: string, secondStoredUserId: string, targetUserId: string): boolean {
  return (
    (firstStoredUserId === CURRENT_USER_PLACEHOLDER_ID && secondStoredUserId === targetUserId) ||
    (firstStoredUserId === targetUserId && secondStoredUserId === CURRENT_USER_PLACEHOLDER_ID)
  );
}

function isMatchedOrBlocked(targetUserId: string, matches: MatchRecord[], blocks: BlockRecord[]): boolean {
  return (
    matches.some((match) => isSameUserPair(match.firstUserId, match.secondUserId, targetUserId)) ||
    blocks.some((block) => isSameUserPair(block.fromUserId, block.toUserId, targetUserId))
  );
}
