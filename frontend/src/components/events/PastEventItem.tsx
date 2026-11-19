import Image from "next/image";
import checkIcon from "@/assets/check.png";
import closeIcon from "@/assets/close.png";
import type { AcademicEvent } from "@/types/events/eventTypes";
import type { UserRole } from "@/types/shared/userRole";

interface PastEventItemProps {
  event: AcademicEvent;
  currentUserType: UserRole;
}

export default function PastEventItem({ event, currentUserType }: PastEventItemProps) {
  return (
    <article className="flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm transition hover:bg-gray-50 md:flex-row md:items-center">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-200">
        <Image src={event.status === "completed" ? checkIcon : closeIcon} alt="" width={24} height={24} aria-hidden="true" className="h-6 w-6 object-contain" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>{formatFullDate(event.date)}</span>
        </div>
        <h3 className="mt-2 text-lg font-bold text-[#2d2d2d]">{event.title}</h3>
        <p className="mt-2 line-clamp-1 text-sm leading-6 text-gray-600">{event.description}</p>
        <p className="mt-2 text-sm text-gray-500">
          {currentUserType === "guestLecturer" ? "Created by " + event.coordinatorName : "Guest Lecturer: " + event.guestLecturerName}
        </p>
      </div>

      <span className={"rounded-full px-5 py-2 text-sm font-bold " + (event.status === "completed" ? "bg-gray-200 text-gray-700" : "bg-red-100 text-red-700")}>
        {event.status === "completed" ? "Completed" : event.status === "cancelled" ? "Cancelled" : "Declined"}
      </span>
    </article>
  );
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value + "T00:00:00"));
}
