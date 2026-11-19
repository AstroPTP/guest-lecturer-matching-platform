import { calendarFileHref } from "./calendarLinks";

/** How a download of a session's calendar file ended. */
export type CalendarDownloadResult = "saved" | "signed-out" | "no-longer-confirmed" | "failed";

/** What to tell the person for each way a download can end without a file. */
export const CALENDAR_DOWNLOAD_MESSAGES: Record<Exclude<CalendarDownloadResult, "saved">, string> = {
  "signed-out": "Please sign in again.",
  "no-longer-confirmed": "This session is no longer confirmed.",
  failed: "The calendar file could not be downloaded. Please try again.",
};

/**
 * Fetches the calendar file for a confirmed session and saves it as
 * guest-lecture-<id>.ics. The file is read first, rather than followed as a
 * link, so a refusal is reported here instead of arriving as a failed download
 * or an error page saved under the file's name.
 */
export async function downloadCalendarFile(eventId: string): Promise<CalendarDownloadResult> {
  let response: Response;
  try {
    response = await fetch(calendarFileHref(eventId), { credentials: "same-origin", cache: "no-store" });
  } catch {
    return "failed";
  }

  if (response.status === 401) {
    return "signed-out";
  }
  if (response.status === 404) {
    return "no-longer-confirmed";
  }
  if (!response.ok) {
    return "failed";
  }

  try {
    saveAsFile(await response.blob(), `guest-lecture-${eventId}.ics`);
  } catch {
    return "failed";
  }
  return "saved";
}

function saveAsFile(content: Blob, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The browser has taken what it needs by then; this only frees the memory.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
