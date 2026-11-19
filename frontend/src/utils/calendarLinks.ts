import type { AcademicEvent } from "@/types/events/eventTypes";

// Sessions are held at Curtin Perth, so the times people enter are Perth times.
// Perth is UTC+8 all year, with no daylight saving.
const PERTH_OFFSET_MINUTES = 8 * 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)/;

/** Where the API serves the calendar file for a confirmed session, through the same-origin proxy. */
export function calendarFileHref(eventId: string): string {
  return `/api/backend/events/${encodeURIComponent(eventId)}/calendar.ics`;
}

/**
 * A Perth date and time as the UTC stamp Google Calendar expects, such as
 * 20261030T013000Z for 09:30 on 30 October. Null when either is not valid.
 */
export function perthToUtcStamp(date: string, time: string): string | null {
  const day = DATE_PATTERN.exec(date);
  const clock = TIME_PATTERN.exec(time);
  if (!day || !clock) {
    return null;
  }
  const moment = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), Number(clock[1]), Number(clock[2]) - PERTH_OFFSET_MINUTES));
  if (Number.isNaN(moment.getTime())) {
    return null;
  }
  return moment.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A link that opens Google Calendar with the session filled in, built here in
 * the browser from what the page already shows. Null when the date or times
 * cannot be read.
 */
export function googleCalendarUrl(event: AcademicEvent): string | null {
  const start = perthToUtcStamp(event.date, event.startTime);
  const end = perthToUtcStamp(event.date, event.endTime);
  if (!start || !end) {
    return null;
  }
  const details = `${event.description.trim()}\n\nCoordinator: ${event.coordinatorName}\nGuest lecturer: ${event.guestLecturerName}`;
  // The slash between the two times stays as it is; the text fields are encoded.
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(event.title)}` +
    `&dates=${start}/${end}` +
    `&details=${encodeURIComponent(details)}` +
    `&location=${encodeURIComponent(event.location.trim() || "Online")}`
  );
}

/**
 * A time of day a number of minutes after another, both as HH:MM. Null when
 * the start is not a time or the result would pass midnight.
 */
export function addMinutesToTime(time: string, minutes: number): string | null {
  const clock = TIME_PATTERN.exec(time);
  if (!clock || !Number.isFinite(minutes)) {
    return null;
  }
  const total = Number(clock[1]) * 60 + Number(clock[2]) + minutes;
  if (total < 0 || total >= 24 * 60) {
    return null;
  }
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
