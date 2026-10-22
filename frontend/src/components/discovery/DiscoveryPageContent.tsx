"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DiscoveryCard from "./DiscoveryCard";
import MatchModal from "./MatchModal";
import infoIcon from "@/assets/info.png";
import undoIcon from "@/assets/undo.png";
import arrowIcon from "@/assets/arrow.png";
import arrowBackIcon from "@/assets/arrow_back.png";
import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";
import type { MatchModalData } from "@/types/discovery/matchTypes";
import type { GuestLecturerDiscoveryFilters, UnitCoordinatorDiscoveryFilters } from "@/types/filter/discoveryFilterTypes";
import type { UserRole } from "@/types/shared/userRole";
import filterIcon from "@/assets/filter.png";
import {
  emptyGuestLecturerFilters,
  emptyUnitCoordinatorFilters,
  getGuestLecturerDiscoveryFilters,
  getUnitCoordinatorDiscoveryFilters,
  saveGuestLecturerDiscoveryFilters,
  saveUnitCoordinatorDiscoveryFilters,
} from "@/services/filter/discoveryFilterService";
import { dismissProfile, expressInterest, getBlocks, getDismisses, getInterests, getMatches, removeDismiss, removeInterest,} from "@/services/discovery/matchService";
import {
  applyGuestLecturerFilters,
  applyUnitCoordinatorFilters,
  countActiveFilters,
  getAvailableDiscoveryItems,
  getDismissedDiscoveryItems,
} from "@/utils/discoveryFilters";

const DISMISS_TOAST_DURATION_MS = 5000;

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
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [unfilteredCount, setUnfilteredCount] = useState(0);
  // Bumped to reload the list after filters are cleared from this page.
  const [filterVersion, setFilterVersion] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  // A notification links here as ?from=<profile id>. The first load opens on
  // that person's card, so the interest they sent can be answered straight away.
  const linkedProfileId = useRef<string | null | undefined>(undefined);
  // The profile whose action is still saving. Requests take seconds, and a
  // second click in that time would send the same request again.
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  // shownAt makes each dismiss a new value, so dismissing twice in a row
  // restarts the hide timer.
  const [dismissToast, setDismissToast] = useState<{ name: string; shownAt: number } | null>(null);

  useEffect(() => {
    if (!dismissToast) {
      return;
    }
    const timer = setTimeout(() => setDismissToast(null), DISMISS_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [dismissToast]);

  useEffect(() => {
    let cancelled = false;
    if (linkedProfileId.current === undefined) {
      linkedProfileId.current = new URLSearchParams(window.location.search).get("from");
    }
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
        setActiveFilterCount(countActiveFilters(filters));
        let loadedItems: DiscoveryItem[];
        if (isReviewingDismissed) {
          loadedItems = getDismissedDiscoveryItems(initialItems, dismisses, matches, blocks);
        } else if (currentUserType === "guestLecturer") {
          const baseItems = getAvailableDiscoveryItems(initialItems, interests, dismisses, matches, blocks);
          const guestLecturerFilters = filters as GuestLecturerDiscoveryFilters;
          setUnfilteredCount(baseItems.length);
          loadedItems = applyGuestLecturerFilters(baseItems, guestLecturerFilters);
        } else {
          const baseItems = getAvailableDiscoveryItems(initialItems, interests, dismisses, matches, blocks);
          const unitCoordinatorFilters = filters as UnitCoordinatorDiscoveryFilters;
          setUnfilteredCount(baseItems.length);
          loadedItems = applyUnitCoordinatorFilters(baseItems, unitCoordinatorFilters);
        }
        setItems(loadedItems);
        setActionHistory([]);
        setMatchModalData(null);
        setDismissToast(null);
        // Falls back to the first card when the linked profile is not in the
        // list, for example because the user's filters leave it out.
        setCurrentIndex(Math.max(0, loadedItems.findIndex((item) => item.profile.id === linkedProfileId.current)));
        linkedProfileId.current = null;
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
  }, [initialItems, currentUserType, isReviewingDismissed, filterVersion]);
  // Wrapping the index keeps it valid after a card is removed: the next card
  // slides into the same slot, and removing the last card loops back to the first.
  const safeIndex = items.length > 0 ? currentIndex % items.length : 0;
  const currentItem = items[safeIndex];
  const canBrowse = items.length > 1;
  // Only when filters removed every profile on load. Once the user has worked
  // through the matching cards, "No more profiles" is the accurate message.
  const filtersHideAllProfiles = activeFilterCount > 0 && unfilteredCount > 0 && actionHistory.length === 0;
  function removeCurrentItem(profileId: string, action: DiscoveryAction) {
    const selectedItem = items.find((item) => item.profile.id === profileId);
    if (!selectedItem) {
      return;
    }
    setActionHistory((currentHistory) => [...currentHistory, { action, item: selectedItem }]);
    setItems((currentItems) => currentItems.filter((item) => item.profile.id !== profileId));
  }

  async function handleDismiss(profileId: string) {
    if (busyProfileId) {
      return;
    }
    setActionError(null);
    setBusyProfileId(profileId);
    try {
      await dismissProfile(profileId);
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
      return;
    } finally {
      setBusyProfileId(null);
    }
    const dismissedItem = items.find((item) => item.profile.id === profileId);
    removeCurrentItem(profileId, "dismiss");
    setDismissedProfilesExist(true);
    if (dismissedItem) {
      setDismissToast({ name: dismissedItem.profile.basicInformation.fullName, shownAt: Date.now() });
    }
  }

  // The toast's Undo always reverses the dismiss it announced, because any
  // other action clears the toast first.
  function handleToastUndo() {
    setDismissToast(null);
    void handleUndo();
  }

  async function handleRestore(profileId: string) {
    if (busyProfileId) {
      return;
    }
    setActionError(null);
    setBusyProfileId(profileId);
    try {
      await removeDismiss(profileId);
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
      return;
    } finally {
      setBusyProfileId(null);
    }
    setItems((currentItems) => currentItems.filter((item) => item.profile.id !== profileId));
  }
  async function handleExpressInterest(profileId: string) {
    const selectedItem = items.find((item) => item.profile.id === profileId);
    if (!selectedItem || busyProfileId) {
      return;
    }
    setActionError(null);
    setDismissToast(null);
    setBusyProfileId(profileId);
    try {
      if (isReviewingDismissed) {
        await removeDismiss(profileId);
      }
      const result = await expressInterest(profileId);
      removeCurrentItem(profileId, "interest");
      // The backend notifies both people when the request becomes a match.
      if (result.matched && result.match) {
        setMatchModalData({ match: result.match, matchedItem: selectedItem });
      }
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
    } finally {
      setBusyProfileId(null);
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
    // The restored card goes back to the front, so show it.
    setCurrentIndex(0);
  }
  function handleShowPrevious() {
    setCurrentIndex((safeIndex - 1 + items.length) % items.length);
  }
  function handleShowNext() {
    setCurrentIndex((safeIndex + 1) % items.length);
  }
  function handleReviewDismissed() {
    setIsReviewingDismissed(true);
  }
  function handleBackToDiscovery() {
    setIsReviewingDismissed(false);
  }
  async function handleClearFilters() {
    if (currentUserType === "guestLecturer") {
      await saveGuestLecturerDiscoveryFilters({ ...emptyGuestLecturerFilters });
    } else {
      await saveUnitCoordinatorDiscoveryFilters({ ...emptyUnitCoordinatorFilters });
    }
    setFilterVersion((version) => version + 1);
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
                {activeFilterCount > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#2d2d2d] px-2 text-xs font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}

            {/* A dismiss is undone from its toast, so this spot opens the dismissed profiles instead. */}
            {!isReviewingDismissed && (
              <button
                type="button"
                onClick={handleReviewDismissed}
                className="flex min-w-36 items-center justify-center rounded-xl bg-gray-200 px-6 py-3 font-semibold text-gray-800 transition hover:bg-gray-300"
              >
                Dismissed profiles
              </button>
            )}
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
          <>
            {/* Sits above the card rather than beside it, so the buttons stay put however tall the card is. */}
            {/* The count stays visible with a single card; the buttons are just disabled. */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <CarouselButton direction="previous" onClick={handleShowPrevious} disabled={!canBrowse} />
              <p className="text-sm font-semibold text-gray-500">
                {safeIndex + 1} of {items.length}
              </p>
              <CarouselButton direction="next" onClick={handleShowNext} disabled={!canBrowse} />
            </div>
            <DiscoveryCard
              item={currentItem}
              onExpressInterest={handleExpressInterest}
              onDismiss={handleDismiss}
              isReviewingDismissed={isReviewingDismissed}
              onRestore={handleRestore}
              isBusy={busyProfileId !== null}
            />
          </>
        ) : (
          <EmptyDiscoveryState
            isReviewingDismissed={isReviewingDismissed}
            hasDismissedProfiles={dismissedProfilesExist}
            hasActionHistory={actionHistory.length > 0}
            onUndo={handleUndo}
            onReviewDismissed={handleReviewDismissed}
            onBackToDiscovery={handleBackToDiscovery}
            filtersHideAllProfiles={filtersHideAllProfiles}
            onClearFilters={handleClearFilters}
            onEditFilters={() => router.push(filterHref)}
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

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4" role="status" aria-live="polite">
        {dismissToast && (
          <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-4 rounded-2xl bg-[#2d2d2d] px-5 py-4 text-white shadow-lg">
            <p className="min-w-0 text-sm">
              Dismissed <span className="font-semibold">{dismissToast.name}</span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={handleToastUndo} className="rounded-lg bg-white px-4 py-1.5 text-sm font-bold text-[#2d2d2d] transition hover:bg-gray-200">
                Undo
              </button>
              <button
                type="button"
                onClick={() => setDismissToast(null)}
                aria-label="Close"
                className="rounded-lg px-2 py-1.5 text-lg leading-none text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CarouselButton({ direction, onClick, disabled }: { direction: "previous" | "next"; onClick: () => void; disabled: boolean }) {
  const isPrevious = direction === "previous";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 font-semibold text-gray-800 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white sm:px-5"
    >
      {isPrevious && <Image src={arrowBackIcon} alt="" width={18} height={18} aria-hidden="true" />}
      {isPrevious ? "Previous" : "Next"}
      {!isPrevious && <Image src={arrowIcon} alt="" width={18} height={18} aria-hidden="true" />}
    </button>
  );
}

function EmptyDiscoveryState({
  isReviewingDismissed,
  hasDismissedProfiles,
  hasActionHistory,
  onUndo,
  onReviewDismissed,
  onBackToDiscovery,
  filtersHideAllProfiles,
  onClearFilters,
  onEditFilters,
}: {
  isReviewingDismissed: boolean;
  hasDismissedProfiles: boolean;
  hasActionHistory: boolean;
  onUndo: () => void;
  onReviewDismissed: () => void;
  onBackToDiscovery: () => void;
  filtersHideAllProfiles: boolean;
  onClearFilters: () => void;
  onEditFilters: () => void;
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

  if (filtersHideAllProfiles) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white px-6 py-20 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
          <Image src={filterIcon} alt="" width={28} height={28} aria-hidden="true" />
        </div>
        <h2 className="mt-6 text-2xl font-bold text-gray-900">No profiles match your filters</h2>
        <p className="mx-auto mt-3 max-w-lg leading-7 text-gray-500">Try removing some filters to see more profiles.</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={onClearFilters} className="rounded-xl bg-[#2d2d2d] px-6 py-3 font-semibold text-white transition hover:bg-black">
            Clear filters
          </button>
          <button
            type="button"
            onClick={onEditFilters}
            className="rounded-xl border border-[#2d2d2d] px-6 py-3 font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
          >
            Edit filters
          </button>
        </div>
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
