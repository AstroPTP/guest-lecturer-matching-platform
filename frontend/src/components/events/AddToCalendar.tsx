"use client";

import { useId, useState } from "react";
import type { AcademicEvent } from "@/types/events/eventTypes";
import { CALENDAR_DOWNLOAD_MESSAGES, downloadCalendarFile } from "@/utils/calendarDownload";
import { googleCalendarUrl } from "@/utils/calendarLinks";

const optionClass =
  "rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-[#2d2d2d] transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#156874] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Puts a confirmed session in the person's own calendar. "Download (.ics)"
 * is the file the API builds, which Outlook, Apple Calendar and Google
 * Calendar all open; "Google Calendar" is a link that opens a new event
 * already filled in. The options open in line rather than as a floating menu,
 * so a card that clips its contents cannot hide them.
 */
export default function AddToCalendar({ event }: { event: AcademicEvent }) {
  const [open, setOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const panelId = useId();
  const googleHref = googleCalendarUrl(event);

  async function handleDownload() {
    if (isDownloading) {
      return;
    }
    setDownloadError(null);
    setIsDownloading(true);
    const result = await downloadCalendarFile(event.id);
    setIsDownloading(false);
    if (result !== "saved") {
      setDownloadError(CALENDAR_DOWNLOAD_MESSAGES[result]);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="rounded-xl border border-[#2d2d2d] px-4 py-2 text-sm font-semibold text-[#2d2d2d] transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#156874]"
      >
        Add to calendar
      </button>

      {open && (
        <div id={panelId} role="group" aria-label={"Add " + event.title + " to your calendar"} className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleDownload()} disabled={isDownloading} className={optionClass}>
            {isDownloading ? "Downloading..." : "Download (.ics)"}
          </button>
          {googleHref && (
            <a href={googleHref} target="_blank" rel="noopener noreferrer" className={optionClass}>
              Google Calendar
            </a>
          )}
        </div>
      )}

      {open && downloadError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {downloadError}
        </p>
      )}
    </div>
  );
}
