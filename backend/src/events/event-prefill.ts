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

/**
 * The learning objective, cut short at a word if it is long, or the
 * discipline when there is no objective. Empty when the coordinator has given
 * neither.
 */
export function suggestTitle(
  learningObjective: string | null,
  discipline: string | null,
): string {
  const objective = (learningObjective ?? '').replace(/\s+/g, ' ').trim();
  if (objective) {
    if (objective.length <= MAX_TITLE_LENGTH) return objective;
    const cut = objective.slice(0, MAX_TITLE_LENGTH - 3);
    const atWord = cut.lastIndexOf(' ');
    return (atWord > 0 ? cut.slice(0, atWord) : cut).trimEnd() + '...';
  }
  const field = (discipline ?? '').replace(/\s+/g, ' ').trim();
  return field ? `Guest lecture: ${field}` : '';
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
    title: suggestTitle(
      input.coordinator.learning_objective,
      input.coordinator.discipline,
    ),
    description: `Guest lecture by ${guestLecturerName}, invited by ${coordinatorName}.${topicSentence}`,
    format,
    location,
    durationMinutes: parseDurationMinutes(input.coordinator.duration),
    sharedTopics,
  };
}
