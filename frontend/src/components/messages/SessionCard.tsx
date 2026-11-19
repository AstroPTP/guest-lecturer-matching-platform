"use client";

import AddToCalendar from "@/components/events/AddToCalendar";
import type { AcademicEvent, EventStatus } from "@/types/events/eventTypes";
import type { UserRole } from "@/types/shared/userRole";
import { formatOptions } from "@/constants/profileOptions/shared";
import { formatOptionLabel } from "@/utils/displayFormatters";

/** What each status is called to the people in the chat. */
const STATUS_STYLES: Record<EventStatus, { label: string; className: string }> = {
  "invitation-sent": { label: "Invitation sent", className: "bg-amber-100 text-amber-700" },
  accepted: { label: "Confirmed", className: "bg-green-100 text-green-700" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  completed: { label: "Completed", className: "bg-gray-200 text-gray-700" },
};

interface SessionCardProps {
  event: AcademicEvent;
  viewer: UserRole;
  /** True while an answer on this card is saving, so it can't be sent twice. */
  isBusy: boolean;
  onAccept: (eventId: string) => void;
  onDecline: (eventId: string) => void;
}

/**
 * One session between the two people in a chat, shown in the thread where it
 * was sent. The guest lecturer answers an invitation here; once it is
 * confirmed, either person can add it to their calendar.
 */
export default function SessionCard({ event, viewer, isBusy, onAccept, onDecline }: SessionCardProps) {
  const status = STATUS_STYLES[event.status];
  const canRespond = viewer === "guestLecturer" && event.status === "invitation-sent";
  const otherPerson = viewer === "guestLecturer" ? event.coordinatorName : event.guestLecturerName;

  return (
    <article aria-label={"Session: " + event.title} className="mx-auto w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-600">Guest lecture session</p>
        <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-bold " + status.className}>{status.label}</span>
      </div>

      <h3 className="mt-3 text-lg font-bold leading-snug text-[#2d2d2d]">{event.title}</h3>

      <dl className="mt-3 space-y-1 text-sm text-gray-600">
        <div className="flex gap-2">
          <dt className="font-semibold text-[#2d2d2d]">When:</dt>
          <dd>
            {formatDate(event.date)}, {event.startTime} to {event.endTime} (Perth time)
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-[#2d2d2d]">Where:</dt>
          <dd>
            {event.location} ({formatOptionLabel(event.format, formatOptions)})
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-[#2d2d2d]">With:</dt>
          <dd>{otherPerson}</dd>
        </div>
      </dl>

      {canRespond && (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => onAccept(event.id)}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-[#2d2d2d] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => onDecline(event.id)}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-gray-200 px-5 py-2.5 text-sm font-semibold text-[#2d2d2d] transition hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}

      {event.status === "accepted" && (
        <div className="mt-4">
          <AddToCalendar event={event} />
        </div>
      )}
    </article>
  );
}

function formatDate(value: string): string {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(value + "T00:00:00"));
}
