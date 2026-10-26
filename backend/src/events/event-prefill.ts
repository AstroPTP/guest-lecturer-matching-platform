import type { CreateEventDto } from './dto/create-event.dto';

export type EventFormat = CreateEventDto['format'];

/**
 * Formats in the order the event form lists them. When more than one suits
 * both people, the earlier one is suggested.
 */
const FORMAT_ORDER: EventFormat[] = ['face-to-face', 'online', 'pre-recorded'];

const MAX_TITLE_LENGTH = 100;

/** The delivery columns both profile tables share. */
export interface DeliveryFlags {
  format_online: boolean | null;
  format_inperson: boolean | null;
  format_prerecorded: boolean | null;
}

/** What the coordinator's profile contributes to the suggestion. */
export interface CoordinatorSide extends DeliveryFlags {
  first_name: string | null;
  last_name: string | null;
  learning_objective: string | null;
  discipline: string | null;
  /** Stored as the profile form's value, such as "60-minutes" or "2-hours". */
  duration: string | null;
  location: string | null;
}

/** What the guest lecturer's profile contributes to the suggestion. */
export interface GuestSide extends DeliveryFlags {
  first_name: string | null;
  last_name: string | null;
}

/** The starting values for a session, all of which the coordinator can change. */
export interface EventPrefill {
  matchId: string;
  guestLecturerId: string;
  guestLecturerName: string;
  coordinatorName: string;
  title: string;
  description: string;
  format: EventFormat;
  location: string;
  /** How long the coordinator's sessions run, or null when they left it flexible. */
  durationMinutes: number | null;
  sharedTopics: string[];
}

/** A person's name from their profile columns, or `fallback` when they have none. */
export function displayName(
  row: { first_name: string | null; last_name: string | null },
  fallback: string,
) {
  const name = [row.first_name, row.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name || fallback;
}

/** The formats a profile allows, in the form's order. */
export function formatsAllowedBy(flags: DeliveryFlags): EventFormat[] {
  const allowed = new Set<EventFormat>();
  if (flags.format_inperson) allowed.add('face-to-face');
  if (flags.format_online) allowed.add('online');
  if (flags.format_prerecorded) allowed.add('pre-recorded');
  return FORMAT_ORDER.filter((format) => allowed.has(format));
}

/**
 * The format both people allow. When they share none, the coordinator's own
 * first choice, and when the coordinator has not set one, face-to-face.
 */
export function chooseFormat(
  coordinator: DeliveryFlags,
  guest: DeliveryFlags,
): EventFormat {
  const coordinatorFormats = formatsAllowedBy(coordinator);
  const guestFormats = formatsAllowedBy(guest);
  const shared = coordinatorFormats.find((format) =>
    guestFormats.includes(format),
  );
  return shared ?? coordinatorFormats[0] ?? 'face-to-face';
}

/**
 * Minutes for a stored session length such as "90-minutes" or "2-hours", or
 * null for "flexible" and anything else that is not a length.
 */
export function parseDurationMinutes(
  value: string | null | undefined,
): number | null {
  const parts = /^(\d+(?:\.\d+)?)[- ]?(minutes?|mins?|hours?|hrs?)$/i.exec(
    (value ?? '').trim(),
  );
  if (!parts) return null;
  const amount = Number(parts[1]);
  const minutes = /^h/i.test(parts[2]) ? Math.round(amount * 60) : amount;
  return minutes > 0 ? minutes : null;
}

/** Topics both people chose, spelled and ordered as the coordinator has them. */
export function sharedTopicsOf(
  coordinatorTopics: string[],
  guestTopics: string[],
): string[] {
  const guestSet = new Set(
    guestTopics.map((topic) => topic.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  return coordinatorTopics
    .map((topic) => topic.trim())
    .filter((topic) => {
      const key = topic.toLowerCase();
      if (!key || !guestSet.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Collapses runs of space and trims the ends. */
function tidy(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * `text` without any full stops or whitespace at the end, found by walking
 * back from the end. A pattern such as /[.\s]+$/ does the same but, when the
 * text holds a long run of dots and spaces followed by something else, takes
 * time that grows with the square of the length; this takes time that grows
 * with the length, however the text is made up.
 */
export function trimTrailingStops(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === '.' || /\s/.test(text[end - 1]))) {
    end -= 1;
  }
  return text.slice(0, end);
}

/** `text` cut at a word, with an ellipsis, so that it is no longer than `max`. */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const atWord = cut.lastIndexOf(' ');
  return (atWord > 0 ? cut.slice(0, atWord) : cut).trimEnd() + '...';
}

/** The least room worth giving the unit or discipline before the whole title is cut instead. */
const MIN_FIELD_LENGTH = 12;

/**
 * A short title: "Guest lecture: <unit or discipline> with <guest name>". The
 * learning objective is long, so it goes in the description and not here.
 *
 * Never longer than 100 characters. When the discipline is long it is cut at a
 * word so the guest's name stays whole. With no discipline it is "Guest
 * lecture with <guest name>".
 */
export function suggestTitle(
  discipline: string | null,
  guestLecturerName: string,
): string {
  const field = tidy(discipline);
  const guest = tidy(guestLecturerName);
  const withGuest = guest ? ` with ${guest}` : '';
  if (!field) return cutAtWord(`Guest lecture${withGuest}`, MAX_TITLE_LENGTH);

  const prefix = 'Guest lecture: ';
  const room = MAX_TITLE_LENGTH - prefix.length - withGuest.length;
  if (room < MIN_FIELD_LENGTH) {
    return cutAtWord(`${prefix}${field}${withGuest}`, MAX_TITLE_LENGTH);
  }
  return `${prefix}${cutAtWord(field, room)}${withGuest}`;
}

/** Puts the stored details of a matched pair into the event form's fields. */
export function buildPrefill(input: {
  matchId: bigint;
  guestProfileId: bigint;
  coordinator: CoordinatorSide;
  guest: GuestSide;
  coordinatorTopics: string[];
  guestTopics: string[];
}): EventPrefill {
  const coordinatorName = displayName(input.coordinator, 'the coordinator');
  const guestLecturerName = displayName(input.guest, 'the guest lecturer');
  const format = chooseFormat(input.coordinator, input.guest);
  const sharedTopics = sharedTopicsOf(
    input.coordinatorTopics,
    input.guestTopics,
  );

  // The objective is the unit's own words and can be long, so it is kept whole
  // here rather than in the title.
  const objective = trimTrailingStops(
    tidy(input.coordinator.learning_objective),
  );
  const objectiveSentence = objective
    ? ` Learning objective: ${objective}.`
    : '';
  const topicSentence = sharedTopics.length
    ? ` Shared topics: ${sharedTopics.join(', ')}.`
    : '';
  const location =
    input.coordinator.location?.trim() ||
    (format === 'face-to-face' ? '' : 'Online');

  return {
    matchId: String(input.matchId),
    guestLecturerId: String(input.guestProfileId),
    guestLecturerName,
    coordinatorName,
    title: suggestTitle(input.coordinator.discipline, guestLecturerName),
    description: `Guest lecture by ${guestLecturerName}, invited by ${coordinatorName}.${objectiveSentence}${topicSentence}`,
    format,
    location,
    durationMinutes: parseDurationMinutes(input.coordinator.duration),
    sharedTopics,
  };
}
