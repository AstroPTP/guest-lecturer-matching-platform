"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DiscoveryCard from "./DiscoveryCard";
import MatchModal from "./MatchModal";
import infoIcon from "@/assets/info.png";
import undoIcon from "@/assets/undo.png";
import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";
import type { BlockRecord, DismissRecord, InterestRecord, MatchModalData, MatchRecord } from "@/types/discovery/matchTypes";
import type { GuestLecturerDiscoveryFilters, UnitCoordinatorDiscoveryFilters } from "@/types/filter/discoveryFilterTypes";
import type { UserRole } from "@/types/shared/userRole";
import filterIcon from "@/assets/filter.png";
import { getGuestLecturerDiscoveryFilters, getUnitCoordinatorDiscoveryFilters } from "@/services/filter/discoveryFilterService";
import { dismissProfile, expressInterest, getBlocks, getDismisses, getInterests, getMatches, removeDismiss, removeInterest,} from "@/services/discovery/matchService";
import { createNotification } from "@/services/notifications/notificationService";

const CURRENT_USER_PLACEHOLDER_ID = "";

type DiscoveryAction = "interest" | "dismiss";
interface DiscoveryHistoryItem {
  action: DiscoveryAction;
  item: DiscoveryItem;
}

interface DiscoveryPageContentProps {
  initialItems: DiscoveryItem[];
  title: string;
  description: string;
  currentUserType: UserRole;
  currentUserName: string;
  currentUserPhoto?: string;
  messagesHref: string;
  filterHref: string;
}

export default function DiscoveryPageContent({
  initialItems,
  title,
  description,
  currentUserType,
  currentUserName,
  currentUserPhoto,
  messagesHref,
  filterHref,
}: DiscoveryPageContentProps) {
  const router = useRouter();
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [actionHistory, setActionHistory] = useState<DiscoveryHistoryItem[]>([]);
  const [matchModalData, setMatchModalData] = useState<MatchModalData | null>(null);
  const [isReviewingDismissed, setIsReviewingDismissed] = useState(false);
  const [dismissedProfilesExist, setDismissedProfilesExist] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDataset() {
      setIsLoading(true);
      setErrorMessage(null);
      setActionError(null);
      try {
        const [interests, matches, dismisses, blocks, filters] = await Promise.all([
          getInterests(),
          getMatches(),
          getDismisses(),
          getBlocks(),
          currentUserType === "guestLecturer" ? getGuestLecturerDiscoveryFilters() : getUnitCoordinatorDiscoveryFilters(),
        ]);
        if (cancelled) {
          return;
        }
        setDismissedProfilesExist(getDismissedDiscoveryItems(initialItems, dismisses, matches, blocks).length > 0);
        if (isReviewingDismissed) {
          setItems(getDismissedDiscoveryItems(initialItems, dismisses, matches, blocks));
        } else if (currentUserType === "guestLecturer") {
          const baseItems = getAvailableDiscoveryItems(initialItems, interests, dismisses, matches, blocks);
          const guestLecturerFilters = filters as GuestLecturerDiscoveryFilters;
          setItems(applyGuestLecturerFilters(baseItems, guestLecturerFilters));
        } else {
          const baseItems = getAvailableDiscoveryItems(initialItems, interests, dismisses, matches, blocks);
          const unitCoordinatorFilters = filters as UnitCoordinatorDiscoveryFilters;
          setItems(applyUnitCoordinatorFilters(baseItems, unitCoordinatorFilters));
        }
        setActionHistory([]);
        setMatchModalData(null);
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to load discovery data:", error);
          setErrorMessage("Unable to load data. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDataset();
    return () => {
      cancelled = true;
    };
  }, [initialItems, currentUserType, isReviewingDismissed]);
  const currentItem = items[0];
  function removeCurrentItem(profileId: string, action: DiscoveryAction) {
    const selectedItem = items.find((item) => item.profile.id === profileId);
    if (!selectedItem) {
      return;
    }
    setActionHistory((currentHistory) => [...currentHistory, { action, item: selectedItem }]);
    setItems((currentItems) => currentItems.filter((item) => item.profile.id !== profileId));
  }

  async function handleDismiss(profileId: string) {
    setActionError(null);
    try {
      await dismissProfile(profileId);
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
      return;
    }
    removeCurrentItem(profileId, "dismiss");
  }

  async function handleRestore(profileId: string) {
    setActionError(null);
    try {
      await removeDismiss(profileId);
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
      return;
    }
    setItems((currentItems) => currentItems.filter((item) => item.profile.id !== profileId));
  }
  async function handleExpressInterest(profileId: string) {
    const selectedItem = items.find((item) => item.profile.id === profileId);
    if (!selectedItem) {
      return;
    }
    setActionError(null);
    try {
      if (isReviewingDismissed) {
        await removeDismiss(profileId);
      }
      const result = await expressInterest(profileId);
      removeCurrentItem(profileId, "interest");
      if (result.matched && result.match) {
        const matchedProfileName = selectedItem.profile.basicInformation.fullName;
        const currentRoleRoot = currentUserType === "guestLecturer" ? "/guest_lecturer" : "/unit_coordinator";
        const matchedRoleRoot = selectedItem.profileType === "guestLecturer" ? "/guest_lecturer" : "/unit_coordinator";
        await createNotification({
          id: "match-" + result.match.id + "-" + CURRENT_USER_PLACEHOLDER_ID,
          recipientId: CURRENT_USER_PLACEHOLDER_ID,
          type: "match",
          title: "It's a match!",
          description: "You matched with " + matchedProfileName + ".",
          actionLabel: "View match",
          href: currentRoleRoot + "/matches",
        });

        await createNotification({
          id: "match-" + result.match.id + "-" + profileId,
          recipientId: profileId,
          type: "match",
          title: "It's a match!",
          description: "You matched with " + currentUserName + ".",
          actionLabel: "View match",
          href: matchedRoleRoot + "/matches",
        });

        setMatchModalData({ match: result.match, matchedItem: selectedItem });
      }
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
    }
  }

  async function handleUndo() {
    if (actionHistory.length === 0) {
      return;
    }
    const lastAction = actionHistory[actionHistory.length - 1];
    const targetUserId = lastAction.item.profile.id;
    setActionError(null);
    try {
      if (lastAction.action === "interest") {
        await removeInterest(targetUserId);
        setMatchModalData(null);
      }
      if (lastAction.action === "dismiss") {
        await removeDismiss(targetUserId);
      }
    } catch {
      setActionError("This isn't connected to a backend yet, so undo couldn't be saved.");
      return;
    }

    setItems((currentItems) => {
      const itemAlreadyExists = currentItems.some((item) => item.profile.id === targetUserId);
      if (itemAlreadyExists) {
        return currentItems;
      }
      return [lastAction.item, ...currentItems];
    });

    setActionHistory((currentHistory) => currentHistory.slice(0, -1));
  }
  function handleReviewDismissed() {
    setIsReviewingDismissed(true);
  }
  function handleBackToDiscovery() {
    setIsReviewingDismissed(false);
  }
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Loading opportunities...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-center text-red-700">{errorMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">{isReviewingDismissed ? "Dismissed Profiles" : title}</h1>

            <p className="mt-3 max-w-3xl leading-7 text-gray-500">
              {isReviewingDismissed ? "Review profiles you previously dismissed. Matched profiles are not included." : description}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {isReviewingDismissed ? (
              <button
                type="button"
                onClick={handleBackToDiscovery}
                className="flex min-w-40 items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-800 transition hover:bg-gray-100"
              >
                Back to Discovery
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push(filterHref)}
                className="flex min-w-36 items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-800 transition hover:bg-gray-100"
              >
                <Image src={filterIcon} alt="" width={18} height={18} aria-hidden="true" />
                Filters
              </button>
            )}

            <button
              type="button"
              onClick={handleUndo}
              disabled={actionHistory.length === 0}
              className="flex min-w-36 items-center justify-center gap-3 rounded-xl bg-gray-200 px-6 py-3 font-semibold text-gray-800 transition hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Image src={undoIcon} alt="" width={18} height={18} aria-hidden="true" />
              Undo
            </button>
          </div>
        </div>

        {actionError && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700">{actionError}</div>}
        {isReviewingDismissed && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-100 px-5 py-4">
            <p className="font-semibold text-[#2d2d2d]">Reviewing dismissed profiles</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">You can restore a profile to Discovery or express interest if you have changed your mind.</p>
          </div>
        )}

        {currentItem ? (
          <DiscoveryCard
            item={currentItem}
            onExpressInterest={handleExpressInterest}
            onDismiss={handleDismiss}
            isReviewingDismissed={isReviewingDismissed}
            onRestore={handleRestore}
          />
        ) : (
          <EmptyDiscoveryState
            isReviewingDismissed={isReviewingDismissed}
            hasDismissedProfiles={dismissedProfilesExist}
            hasActionHistory={actionHistory.length > 0}
            onUndo={handleUndo}
            onReviewDismissed={handleReviewDismissed}
            onBackToDiscovery={handleBackToDiscovery}
          />
        )}
      </div>

      {matchModalData && (
        <MatchModal
          currentUserName={currentUserName}
          currentUserPhoto={currentUserPhoto}
          matchedItem={matchModalData.matchedItem}
          messagesHref={messagesHref}
          onClose={() => setMatchModalData(null)}
          onKeepBrowsing={() => setMatchModalData(null)}
        />
      )}
    </>
  );
}

function EmptyDiscoveryState({
  isReviewingDismissed,
  hasDismissedProfiles,
  hasActionHistory,
  onUndo,
  onReviewDismissed,
  onBackToDiscovery,
}: {
  isReviewingDismissed: boolean;
  hasDismissedProfiles: boolean;
  hasActionHistory: boolean;
  onUndo: () => void;
  onReviewDismissed: () => void;
  onBackToDiscovery: () => void;
}) {
  if (isReviewingDismissed) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white px-6 py-20 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
          <Image src={undoIcon} alt="" width={28} height={28} aria-hidden="true" />
        </div>

        <h2 className="mt-6 text-2xl font-bold text-gray-900">No dismissed profiles</h2>
        <p className="mx-auto mt-3 max-w-lg leading-7 text-gray-500">There are no dismissed profiles available to review.</p>
        <button type="button" onClick={onBackToDiscovery} className="mt-7 rounded-xl bg-[#2d2d2d] px-7 py-3 font-semibold text-white transition hover:bg-black">
          Back to Discovery
        </button>
      </section>
    );
  }


  return (
    <section className="rounded-3xl border border-gray-200 bg-white px-6 py-20 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
        <Image src={infoIcon} alt="" width={28} height={28} />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-gray-900">No more profiles</h2>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-gray-500">You have reviewed all currently available profiles.</p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {hasActionHistory && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            <Image src={undoIcon} alt="" width={18} height={18} aria-hidden="true" />
            View previous profile
          </button>
        )}

        {hasDismissedProfiles && (
          <button
            type="button"
            onClick={onReviewDismissed}
            className="rounded-xl border border-[#2d2d2d] px-6 py-3 font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
          >
            Review dismissed profiles
          </button>
        )}
      </div>
    </section>
  );
}

function applyGuestLecturerFilters(items: DiscoveryItem[], filters: GuestLecturerDiscoveryFilters): DiscoveryItem[] {
  return items.filter((item) => {
    if (item.profileType !== "unitCoordinator") {
      return false;
    }

    const { expertise, engagementProfile } = item.profile;
    const matchesTopics = filters.topics.length === 0 || filters.topics.some((topic) => expertise.selectedTopics.includes(topic));
    const matchesFormats = filters.formats.length === 0 || filters.formats.some((format) => engagementProfile.formats.includes(format));
    const matchesDurations = filters.sessionDurations.length === 0 || filters.sessionDurations.includes(engagementProfile.sessionDuration);
    const matchesAudience = filters.audienceSizes.length === 0 || filters.audienceSizes.includes(engagementProfile.audienceSize);
    const matchesDays = filters.preferredDays.length === 0 || filters.preferredDays.some((day) => engagementProfile.schedule.preferredDays.includes(day));
    const matchesLocation = !filters.location.trim() || engagementProfile.primaryLocation.toLowerCase().includes(filters.location.trim().toLowerCase());
    return matchesTopics && matchesFormats && matchesDurations && matchesAudience && matchesDays && matchesLocation;
  });
}

function applyUnitCoordinatorFilters(items: DiscoveryItem[], filters: UnitCoordinatorDiscoveryFilters): DiscoveryItem[] {
  return items.filter((item) => {
    if (item.profileType !== "guestLecturer") {
      return false;
    }
    const { basicInformation, expertise, engagementProfile } = item.profile;
    const matchesTopics = filters.topics.length === 0 || filters.topics.some((topic) => expertise.selectedTopics.includes(topic));
    const matchesExperience = filters.experienceLevels.length === 0 || filters.experienceLevels.includes(expertise.experienceLevel);
    const matchesField = filters.professionalFields.length === 0 || filters.professionalFields.includes(basicInformation.professionalField);
    const matchesFormats = filters.formats.length === 0 || filters.formats.includes(engagementProfile.format);
    const matchesDurations = filters.sessionDurations.length === 0 || filters.sessionDurations.includes(engagementProfile.sessionDuration);
    const matchesDays = filters.availableDays.length === 0 || filters.availableDays.some((day) => engagementProfile.schedule.availableDays.includes(day));
    const matchesSpeaking = !filters.requiresSpeakingExperience || expertise.hasSpeakingExperience;
    const matchesInternational = !filters.requiresInternationalExperience || expertise.hasInternationalExperience;
    const matchesLocation = !filters.location.trim() || engagementProfile.primaryLocation.toLowerCase().includes(filters.location.trim().toLowerCase());
    return matchesTopics && matchesExperience && matchesField && matchesFormats && matchesDurations && matchesDays && matchesSpeaking && matchesInternational && matchesLocation;
  });
}

function getAvailableDiscoveryItems(
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

function getDismissedDiscoveryItems(
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
