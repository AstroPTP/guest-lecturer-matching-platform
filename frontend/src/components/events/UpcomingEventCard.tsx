"use client";

import type { AcademicEvent } from "@/types/events/eventTypes";
import type { UserRole } from "@/types/shared/userRole";
import { formatStoredValue } from "@/utils/displayFormatters";

interface UpcomingEventCardProps {
  event: AcademicEvent;

  currentUserType: UserRole;

  onAccept?: (eventId: string) => void;

  onDecline?: (eventId: string) => void;

  onCancel?: (eventId: string) => void;

  onComplete?: (eventId: string) => void;
}

export default function UpcomingEventCard({ event, currentUserType, onAccept, onDecline, onCancel, onComplete }: UpcomingEventCardProps) {
  const canGuestRespond = currentUserType === "guestLecturer" && event.status === "invitation-sent";

  const canCoordinatorCancel = currentUserType === "unitCoordinator" && (event.status === "invitation-sent" || event.status === "accepted");

  const canCoordinatorComplete = currentUserType === "unitCoordinator" && event.status === "accepted" && isEventInPast(event);

  return (
    <article className="group relative min-h-[350px] overflow-hidden rounded-[2rem] bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-bl-[4rem] bg-gray-200 transition-transform duration-500 group-hover:scale-110" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-6 flex items-start justify-end gap-4">
          <div className="text-right">
            <p className="text-xl font-bold text-[#2d2d2d]">{formatShortDate(event.date)}</p>

            <p className="mt-1 text-sm text-gray-600">
              {formatTime(event.startTime)} – {formatTime(event.endTime)}
            </p>
          </div>
        </div>

        <h3 className="text-xl font-bold leading-snug text-[#2d2d2d]">{event.title}</h3>

        <p className="mt-3 line-clamp-3 leading-7 text-gray-600">{event.description}</p>

        <div className="mt-5 space-y-2 text-sm text-gray-600">
          <p>
            <span className="font-semibold text-[#2d2d2d]">{currentUserType === "guestLecturer" ? "Coordinator:" : "Guest Lecturer:"}</span>{" "}
            {currentUserType === "guestLecturer" ? event.coordinatorName : event.guestLecturerName}
          </p>

          <p>
            <span className="font-semibold text-[#2d2d2d]">Location:</span> {event.location}
          </p>

          <p>
            <span className="font-semibold text-[#2d2d2d]">Format:</span> {formatStoredValue(event.format)}
          </p>
        </div>

        <div className="mt-auto pt-7">
          {canGuestRespond ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onAccept?.(event.id)}
                className="flex-1 rounded-xl bg-[#2d2d2d] px-5 py-3 font-semibold text-white shadow-md transition hover:bg-black"
              >
                Accept
              </button>

              <button
                type="button"
                onClick={() => onDecline?.(event.id)}
                className="flex-1 rounded-xl bg-gray-200 px-5 py-3 font-semibold text-[#2d2d2d] transition hover:bg-gray-300"
              >
                Decline
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <EventStatusBadge status={event.status} />

              {canCoordinatorCancel && (
                <button
                  type="button"
                  onClick={() => onCancel?.(event.id)}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Cancel Event
                </button>
              )}

              {canCoordinatorComplete && (
                <button
                  type="button"
                  onClick={() => onComplete?.(event.id)}
                  className="rounded-xl bg-[#2d2d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  Mark Completed
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function EventStatusBadge({ status }: { status: AcademicEvent["status"] }) {
  const styles: Record<AcademicEvent["status"], string> = {
    "invitation-sent": "bg-amber-100 text-amber-700",

    accepted: "bg-green-100 text-green-700",

    declined: "bg-red-100 text-red-700",

    completed: "bg-gray-200 text-gray-700",

    cancelled: "bg-red-100 text-red-700",
  };

  return <span className={"rounded-full px-4 py-2 text-sm font-bold " + styles[status]}>{formatStoredValue(status)}</span>;
}

function formatShortDate(value: string): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
  }).format(new Date(value + "T00:00:00"));
}

function formatTime(value: string): string {
  if (!value) {
    return "";
  }

  const [hours, minutes] = value.split(":");

  const date = new Date();

  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isEventInPast(event: AcademicEvent): boolean {
  const eventDate = new Date(event.date + "T" + event.endTime);

  return eventDate.getTime() < Date.now();
}
