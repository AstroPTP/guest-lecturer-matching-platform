"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import infoIcon from "@/assets/info.png";
import CreateEventModal from "./CreateEventModal";
import PastEventItem from "./PastEventItem";
import UpcomingEventCard from "./UpcomingEventCard";
import type { AcademicEvent, CreateAcademicEventData } from "@/types/events/eventTypes";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import type { UserRole } from "@/types/shared/userRole";
import { BackendError } from "@/lib/api/backendClient";

import { acceptEvent, cancelEvent,completeEvent, createEvent, declineEvent, getEventsForCoordinator, getEventsForGuestLecturer} from "@/services/events/eventService";

interface EventPageContentProps {
  currentUserType: UserRole;
  currentUserName: string;
  currentUserRole: string;
  currentUserOrganisation: string;
  matchedGuestLecturers?: MatchedProfile[];
}

export default function EventPageContent({
  currentUserType,
  currentUserName,
  currentUserRole,
  currentUserOrganisation,
  matchedGuestLecturers = [],
}: EventPageContentProps) {
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The event whose accept, decline, cancel or complete is still saving.
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const loadEvents = useCallback(async () => {
    setErrorMessage(null);
    try {
      const nextEvents = currentUserType === "unitCoordinator" ? await getEventsForCoordinator() : await getEventsForGuestLecturer();

      setEvents(nextEvents);
    } catch (error) {
      console.error("Unable to load events:", error);
      setErrorMessage("Unable to load data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [currentUserType]);

  useEffect(() => {
    async function run() {
      await loadEvents();
    }

    void run();
  }, [loadEvents]);
  const upcomingEvents = events.filter((event) => event.status !== "completed" && event.status !== "declined" && event.status !== "cancelled");
  const pastEvents = events.filter((event) => event.status === "completed" || event.status === "declined" || event.status === "cancelled");

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Loading events...</p>
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

  function showMessage(value: string) {
    setMessage(value);
    setTimeout(() => {
      setMessage("");
    }, 2500);
  }

  function showActionError(value: string) {
    setActionError(value);
    setTimeout(() => {
      setActionError("");
    }, 4000);
  }
  const NOT_INTEGRATED_MESSAGE = "This isn't connected to a backend yet, so that action couldn't be saved.";
  /** The reason the API gave, when it gave one, since it says what to change. */
  function failureText(error: unknown): string {
    return error instanceof BackendError && error.message ? error.message : NOT_INTEGRATED_MESSAGE;
  }

  async function handleCreateEvent(data: CreateAcademicEventData): Promise<string | null> {
    try {
      await createEvent(data);
    } catch (error) {
      return failureText(error);
    }

    setShowCreateModal(false);
    await loadEvents();
    showMessage("Event invitation sent successfully.");
    return null;
  }

  /**
   * Runs one action on an event. Each takes several seconds, so the event's
   * buttons stay disabled until it finishes and a second click is ignored.
   */
  async function runEventAction(eventId: string, action: (id: string) => Promise<unknown>, successMessage: string) {
    if (busyEventId) {
      return;
    }
    setBusyEventId(eventId);
    try {
      await action(eventId);
    } catch (error) {
      showActionError(failureText(error));
      // The other person may have changed the event since this page loaded.
      await loadEvents();
      return;
    } finally {
      setBusyEventId(null);
    }
    await loadEvents();
    showMessage(successMessage);
  }

  const handleAccept = (eventId: string) => runEventAction(eventId, acceptEvent, "Event accepted successfully.");
  const handleDecline = (eventId: string) => runEventAction(eventId, declineEvent, "Event invitation declined.");
  const handleCancel = (eventId: string) => runEventAction(eventId, cancelEvent, "Event cancelled.");
  const handleComplete = (eventId: string) => runEventAction(eventId, completeEvent, "Event marked as completed.");
  return (
    <>
      <div className="mx-auto w-full max-w-6xl">
        <section className="mb-10 rounded-2xl bg-white px-8 py-7 shadow-sm md:px-12 md:py-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-[#2d2d2d]">{currentUserName}</h1>

              <p className="mt-2 text-lg text-gray-600">
                {currentUserRole}

                {currentUserOrganisation ? ", " + currentUserOrganisation : ""}
              </p>
            </div>

            {currentUserType === "unitCoordinator" && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="rounded-xl bg-[#2d2d2d] px-7 py-4 font-semibold text-white shadow-md transition hover:bg-black"
              >
                + Create Event
              </button>
            )}
          </div>
        </section>

        {message && <div className="mb-7 rounded-xl border border-green-200 bg-green-50 px-5 py-4 font-medium text-green-700">{message}</div>}

        {actionError && <div className="mb-7 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 font-medium text-amber-700">{actionError}</div>}

        <section>
          <div className="mb-7 flex items-end justify-between gap-5">
            <div>
              <h2 className="text-2xl font-bold text-[#2d2d2d]">{currentUserType === "guestLecturer" ? "Upcoming Events & Invitations" : "Upcoming Events"}</h2>

              <p className="mt-2 text-gray-600">
                {currentUserType === "guestLecturer"
                  ? "Review pending invitations and your accepted events."
                  : "Review invitations sent to matched Guest Lecturers."}
              </p>
            </div>

            <span className="shrink-0 text-sm font-semibold text-gray-500">
              {upcomingEvents.length} event
              {upcomingEvents.length === 1 ? "" : "s"}
            </span>
          </div>

          {upcomingEvents.length === 0 ? (
            <EmptyEventState currentUserType={currentUserType} onCreate={() => setShowCreateModal(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {upcomingEvents.map((event) => (
                <UpcomingEventCard
                  key={event.id}
                  event={event}
                  currentUserType={currentUserType}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  onCancel={handleCancel}
                  onComplete={handleComplete}
                  isBusy={busyEventId === event.id}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold text-[#2d2d2d]">Past Events &amp; Outcomes</h2>

          <p className="mt-2 text-gray-600">Completed, declined and cancelled events appear here.</p>

          {pastEvents.length === 0 ? (
            <div className="mt-7 rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="text-gray-500">No past event records yet.</p>
            </div>
          ) : (
            <div className="mt-7 space-y-5">
              {pastEvents.map((event) => (
                <PastEventItem key={event.id} event={event} currentUserType={currentUserType} />
              ))}
            </div>
          )}
        </section>
      </div>

      {showCreateModal && currentUserType === "unitCoordinator" && (
        <CreateEventModal
          coordinatorName={currentUserName}
          matchedGuestLecturers={matchedGuestLecturers}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateEvent}
        />
      )}
    </>
  );
}

function EmptyEventState({ currentUserType,onCreate,}: {
  currentUserType: UserRole;

  onCreate: () => void;
}) {
  return (
    <div className="rounded-[2rem] bg-white px-8 py-14 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Image src={infoIcon} alt="" width={28} height={28} />
      </div>

      <h3 className="mt-6 text-xl font-bold text-[#2d2d2d]">{currentUserType === "unitCoordinator" ? "No events created yet" : "No invitations yet"}</h3>

      <p className="mx-auto mt-2 max-w-xl leading-7 text-gray-600">
        {currentUserType === "unitCoordinator"
          ? "Create an event and invite one of your matched Guest Lecturers."
          : "When a Unit Coordinator sends you an invitation, it will appear here."}
      </p>

      {currentUserType === "unitCoordinator" && (
        <button type="button" onClick={onCreate} className="mt-7 rounded-xl bg-[#2d2d2d] px-7 py-3 font-semibold text-white hover:bg-black">
          Create Event
        </button>
      )}
    </div>
  );
}
