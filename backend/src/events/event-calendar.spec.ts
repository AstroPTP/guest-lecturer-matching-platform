import { UnprocessableEntityException } from '@nestjs/common';
import {
  buildEventIcs,
  escapeText,
  foldLine,
  isCalendarDate,
  minutesOfDay,
  type CalendarEvent,
} from './event-calendar';

describe('event calendar file', () => {
  const event: CalendarEvent = {
    id: '42',
    title: 'Consumer Behaviour Symposium',
    description: 'An evening on how people decide.',
    date: '2026-10-30',
    startTime: '09:30',
    endTime: '10:45',
    location: 'Building 402, Room 201',
    coordinatorName: 'Cara Coord',
    guestLecturerName: 'Greta Gray',
    stampedAt: new Date('2026-10-22T03:04:05.678Z'),
  };

  /** The unfolded content lines of a file. */
  function linesOf(ics: string): string[] {
    return ics
      .replace(/\r\n[ \t]/g, '')
      .split('\r\n')
      .filter((line) => line !== '');
  }

  describe('structure', () => {
    const ics = buildEventIcs(event);
    const lines = linesOf(ics);

    it('is one calendar holding one event, with CRLF line ends', () => {
      expect(lines[0]).toBe('BEGIN:VCALENDAR');
      expect(lines[1]).toBe('VERSION:2.0');
      expect(lines.at(-1)).toBe('END:VCALENDAR');
      expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
      expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(1);
      expect(ics.endsWith('\r\n')).toBe(true);
      expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });

    it('identifies the event by its id', () => {
      expect(lines).toContain('UID:event-42@glmp');
    });

    it('stamps the file with the event, not with the moment of the download', () => {
      expect(lines).toContain('DTSTAMP:20261022T030405Z');
      expect(buildEventIcs(event)).toBe(ics);
    });

    it('names the title, the location and both people', () => {
      expect(lines).toContain('SUMMARY:Consumer Behaviour Symposium');
      expect(lines).toContain('LOCATION:Building 402\\, Room 201');
      const description = lines.find((line) => line.startsWith('DESCRIPTION:'));
      expect(description).toContain('An evening on how people decide.');
      expect(description).toContain('Coordinator: Cara Coord');
      expect(description).toContain('Guest lecturer: Greta Gray');
    });

    it('says Online when there is no location', () => {
      expect(linesOf(buildEventIcs({ ...event, location: '  ' }))).toContain(
        'LOCATION:Online',
      );
    });
  });

  describe('time zone', () => {
    const lines = linesOf(buildEventIcs(event));

    it('writes the start and end as Perth local times', () => {
      expect(lines).toContain('DTSTART;TZID=Australia/Perth:20261030T093000');
      expect(lines).toContain('DTEND;TZID=Australia/Perth:20261030T104500');
    });

    it('defines Perth as UTC+8 with no daylight saving', () => {
      const from = lines.indexOf('BEGIN:VTIMEZONE');
      const to = lines.indexOf('END:VTIMEZONE');
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      const block = lines.slice(from, to + 1);
      expect(block).toContain('TZID:Australia/Perth');
      expect(block).toContain('BEGIN:STANDARD');
      expect(block).toContain('TZOFFSETFROM:+0800');
      expect(block).toContain('TZOFFSETTO:+0800');
      expect(block).toContain('TZNAME:AWST');
      expect(block).not.toContain('BEGIN:DAYLIGHT');
      // The zone is declared before the event that uses it.
      expect(to).toBeLessThan(lines.indexOf('BEGIN:VEVENT'));
    });

    it('takes the date from a full ISO date and a time with seconds', () => {
      const other = linesOf(
        buildEventIcs({
          ...event,
          date: '2026-12-01T00:00:00.000Z',
          startTime: '8:05:00',
          endTime: '23:59',
        }),
      );
      expect(other).toContain('DTSTART;TZID=Australia/Perth:20261201T080500');
      expect(other).toContain('DTEND;TZID=Australia/Perth:20261201T235900');
    });
  });

  describe('escaping', () => {
    it('escapes backslashes, semicolons, commas and line breaks', () => {
      expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
      expect(escapeText('one\r\ntwo\rthree')).toBe('one\\ntwo\\nthree');
    });

    it('escapes the backslash first, so the escapes it adds are not doubled', () => {
      expect(escapeText('\\,')).toBe('\\\\\\,');
    });

    it('drops control characters but keeps tabs', () => {
      expect(escapeText('a\u0000b\u0007c\td\u007f')).toBe('abc\td');
    });

    it('cannot be used to add a property or end the event', () => {
      const ics = buildEventIcs({
        ...event,
        title: 'Talk\r\nATTENDEE:mailto:x@example.com\r\nEND:VEVENT',
        location: 'Room 1\nORGANIZER:mailto:y@example.com',
      });
      const lines = linesOf(ics);
      expect(lines.filter((line) => line.startsWith('ATTENDEE'))).toHaveLength(
        0,
      );
      expect(lines.filter((line) => line.startsWith('ORGANIZER'))).toHaveLength(
        0,
      );
      expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(1);
      expect(lines).toContain(
        'SUMMARY:Talk\\nATTENDEE:mailto:x@example.com\\nEND:VEVENT',
      );
    });

    it('escapes in the summary, location and description of the file', () => {
      const lines = linesOf(
        buildEventIcs({
          ...event,
          title: 'Law; ethics, and more\\',
          description: 'Line one\nLine two',
        }),
      );
      expect(lines).toContain('SUMMARY:Law\\; ethics\\, and more\\\\');
      const description = lines.find((line) => line.startsWith('DESCRIPTION:'));
      expect(
        description?.startsWith('DESCRIPTION:Line one\\nLine two\\n\\n'),
      ).toBe(true);
    });
  });

  describe('folding', () => {
    const octets = (line: string) => Buffer.byteLength(line, 'utf8');

    it('leaves a short line alone', () => {
      expect(foldLine('SUMMARY:Short')).toBe('SUMMARY:Short');
      const exactly75 = 'X'.repeat(75);
      expect(foldLine(exactly75)).toBe(exactly75);
    });

    it('folds a long line at 75 octets, continuing with a single space', () => {
      const long = 'DESCRIPTION:' + 'word '.repeat(60).trim();
      const folded = foldLine(long);
      const parts = folded.split('\r\n');
      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) {
        expect(octets(part)).toBeLessThanOrEqual(75);
      }
      expect(octets(parts[0])).toBe(75);
      for (const part of parts.slice(1)) {
        expect(part.startsWith(' ')).toBe(true);
      }
      // Unfolding gives the original back.
      expect(folded.replace(/\r\n /g, '')).toBe(long);
    });

    it('counts octets rather than characters, and never splits a character', () => {
      const long =
        'SUMMARY:' + 'é'.repeat(80) + '😀'.repeat(20) + '漢'.repeat(30);
      const folded = foldLine(long);
      const parts = folded.split('\r\n');
      for (const part of parts) {
        expect(octets(part)).toBeLessThanOrEqual(75);
        // A split character would leave a replacement character behind.
        expect(part).not.toContain('�');
      }
      expect(folded.replace(/\r\n /g, '')).toBe(long);
    });

    it('folds every long line of a real file, and the file reads back whole', () => {
      const ics = buildEventIcs({
        ...event,
        title: 'A very long title '.repeat(10).trim(),
        description: 'Details, '.repeat(40),
      });
      for (const physical of ics.split('\r\n')) {
        expect(octets(physical)).toBeLessThanOrEqual(75);
      }
      const summary = linesOf(ics).find((line) => line.startsWith('SUMMARY:'));
      expect(summary).toBe(
        'SUMMARY:' + escapeText('A very long title '.repeat(10).trim()),
      );
    });
  });

  describe('a session that cannot be put in a calendar', () => {
    it.each([
      ['a date that does not exist', { date: '2026-02-30' }],
      ['no date', { date: '' }],
      ['a start that is not a time', { startTime: '9am' }],
      ['an end that is not a time', { endTime: '25:00' }],
      ['an end before the start', { startTime: '11:00', endTime: '10:00' }],
      ['an end equal to the start', { startTime: '10:00', endTime: '10:00' }],
    ])('is refused for %s', (_name, change) => {
      expect(() => buildEventIcs({ ...event, ...change })).toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('helpers', () => {
    it('recognises real calendar days only', () => {
      expect(isCalendarDate('2026-10-30')).toBe(true);
      expect(isCalendarDate('2028-02-29')).toBe(true);
      expect(isCalendarDate('2026-02-29')).toBe(false);
      expect(isCalendarDate('2026-13-01')).toBe(false);
      expect(isCalendarDate('30/10/2026')).toBe(false);
    });

    it('reads a time as minutes after midnight', () => {
      expect(minutesOfDay('00:00')).toBe(0);
      expect(minutesOfDay('09:30')).toBe(570);
      expect(minutesOfDay('23:59')).toBe(1439);
      expect(minutesOfDay('24:00')).toBeNull();
      expect(minutesOfDay('9.30')).toBeNull();
    });
  });
});
