import { UnprocessableEntityException } from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';

/** The parts of an event the calendar file is built from. */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:MM. */
  startTime: string;
  /** Local time, HH:MM. */
  endTime: string;
  location: string;
  coordinatorName: string;
  guestLecturerName: string;
  /** Stamp for the file; the same event always yields the same file. */
  stampedAt: Date;
}

/**
 * Sessions are held at Curtin Perth, so the times people enter are Perth
 * times. Perth is UTC+8 all year with no daylight saving.
 */
export const CALENDAR_TIME_ZONE = 'Australia/Perth';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** Longest line, in octets and without the line break, that RFC 5545 allows. */
const MAX_LINE_OCTETS = 75;

/** True when the date is a real calendar day, written YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  const parts = DATE_PATTERN.exec(value);
  if (!parts) return false;
  const [year, month, day] = [
    Number(parts[1]),
    Number(parts[2]),
    Number(parts[3]),
  ];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Minutes after midnight for an HH:MM time, or null when it is not one. */
export function minutesOfDay(value: string): number | null {
  const parts = TIME_PATTERN.exec(value);
  return parts ? Number(parts[1]) * 60 + Number(parts[2]) : null;
}

/** Escapes a TEXT value: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return (
    value
      .replace(/\r\n|\r/g, '\n')
      // Other control characters have no place in a TEXT value, and a stray
      // one could confuse a reader of the file.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  );
}

/**
 * Folds one content line so that none is over 75 octets, by ending the line
 * and starting the next with a single space. The count is in UTF-8 octets, and
 * a character is never split across two lines.
 */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_LINE_OCTETS) {
    return line;
  }

  const lines: string[] = [];
  let current = '';
  let currentOctets = 0;
  for (const character of line) {
    const octets = Buffer.byteLength(character, 'utf8');
    // Every line after the first starts with the space that marks it as a
    // continuation, and that space counts towards the limit.
    const limit = lines.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (currentOctets + octets > limit) {
      lines.push(current);
      current = '';
      currentOctets = 0;
    }
    current += character;
    currentOctets += octets;
  }
  lines.push(current);

  return lines
    .map((part, index) => (index === 0 ? part : ' ' + part))
    .join('\r\n');
}

/** A local date and time as the calendar writes it: 20261030T093000. */
function localStamp(date: string, time: string): string {
  const minutes = minutesOfDay(time);
  if (!isCalendarDate(date) || minutes === null) {
    throw new UnprocessableEntityException({
      code: ErrorCode.ValidationFailed,
      message:
        'This session has no valid date or time, so it cannot be added to a calendar.',
    });
  }
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return date.slice(0, 10).replace(/-/g, '') + 'T' + hours + mins + '00';
}

/** A moment in UTC as the calendar writes it: 20261030T013000Z. */
function utcStamp(moment: Date): string {
  return moment
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * An iCalendar file (RFC 5545) holding one confirmed session. Lines end in
 * CRLF as the format requires.
 */
export function buildEventIcs(event: CalendarEvent): string {
  const start = localStamp(event.date, event.startTime);
  const end = localStamp(event.date, event.endTime);
  if (end <= start) {
    throw new UnprocessableEntityException({
      code: ErrorCode.ValidationFailed,
      message:
        'This session ends before it starts, so it cannot be added to a calendar.',
    });
  }

  const description =
    event.description.trim() +
    '\n\nCoordinator: ' +
    event.coordinatorName +
    '\nGuest lecturer: ' +
    event.guestLecturerName;
  const location = event.location.trim() || 'Online';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Curtin GLMP//Guest lecture//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${CALENDAR_TIME_ZONE}`,
    `X-LIC-LOCATION:${CALENDAR_TIME_ZONE}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:AWST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@glmp`,
    `DTSTAMP:${utcStamp(event.stampedAt)}`,
    `DTSTART;TZID=${CALENDAR_TIME_ZONE}:${start}`,
    `DTEND;TZID=${CALENDAR_TIME_ZONE}:${end}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
