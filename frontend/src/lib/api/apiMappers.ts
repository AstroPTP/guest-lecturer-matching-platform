import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";
import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

/**
 * Turns an API row into the shape the pages expect.
 *
 * The database stores snake_case columns and splits a name into two, while the
 * pages were written against camelCase and a single fullName. Reconciling that
 * in one place keeps the difference out of every component, and means a schema
 * change lands here rather than in a dozen files.
 *
 * Everything is defensive because this is data off the wire: a column the
 * schema allows to be null must not render as "undefined" in the UI.
 */

/** A guest speaker row as the API returns it. */
export interface GuestSpeakerRow {
  guest_id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  field?: string | null;
  role?: string | null;
  bio?: string | null;
  location?: string | null;
  duration?: string | null;
  audience?: string | null;
  linkedIn_profile?: string | null;
  prior_details?: string | null;
  international_details?: string | null;
  format_online?: boolean | null;
  format_inperson?: boolean | null;
  format_prerecorded?: boolean | null;
}

/** A unit coordinator row as the API returns it. */
export interface CoordinatorRow {
  coordinator_id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  faculty?: string | null;
  role?: string | null;
  bio?: string | null;
  discipline?: string | null;
  learning_objective?: string | null;
  location?: string | null;
  duration?: string | null;
  audience?: string | null;
  format_online?: boolean | null;
  format_inperson?: boolean | null;
  format_prerecorded?: boolean | null;
  focus_lecture?: boolean | null;
  focus_casestudy?: boolean | null;
  focus_workshop?: boolean | null;
  focus_discussion?: boolean | null;
  focus_ama?: boolean | null;
}

function joinName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function formats(row: GuestSpeakerRow): string[] {
  const chosen: string[] = [];
  if (row.format_online) chosen.push("Online");
  if (row.format_inperson) chosen.push("In person");
  if (row.format_prerecorded) chosen.push("Pre-recorded");
  return chosen;
}

function coordinatorFormats(row: CoordinatorRow): string[] {
  const chosen: string[] = [];
  if (row.format_online) chosen.push("online");
  if (row.format_inperson) chosen.push("face-to-face");
  if (row.format_prerecorded) chosen.push("pre-recorded");
  return chosen;
}

function coordinatorDeliveryFocus(row: CoordinatorRow): string[] {
  const chosen: string[] = [];
  if (row.focus_lecture) chosen.push("Seminar/Lecture");
  if (row.focus_casestudy) chosen.push("Case Study");
  if (row.focus_workshop) chosen.push("Interactive Workshop");
  if (row.focus_discussion) chosen.push("Discussion Lead");
  if (row.focus_ama) chosen.push("AMA Session");
  return chosen;
}

export function toPublicGuestLecturerProfile(
  row: GuestSpeakerRow,
): PublicGuestLecturerProfile {
  return {
    id: String(row.guest_id),
    basicInformation: {
      fullName: joinName(row.first_name, row.last_name),
      bio: row.bio ?? "",
      photoPreview: "",
      professionalField: row.field ?? "",
      professionalRole: row.role ?? "",
    },
    expertise: {
      selectedTopics: [],
      experienceLevel: "",
      hasSpeakingExperience: Boolean(row.prior_details),
      speakingDetails: row.prior_details ?? "",
      hasInternationalExperience: Boolean(row.international_details),
      internationalDetails: row.international_details ?? "",
      linkedin: row.linkedIn_profile ?? "",
    },
    engagementProfile: {
    primaryLocation: row.location ?? "",
    sessionDuration: row.duration ?? "",
    audienceSize: row.audience ?? "",
    format: formats(row).join(", "),
    formats: formats(row),
    deliveryFocus: [],
    schedule: {
      availableDays: [],
      availableFrom: "",
      availableTo: "",
      availabilityFrequency: "",
      availabilityNotes: "",
    },
    } as PublicGuestLecturerProfile["engagementProfile"],
  };
}

export function toPublicUnitCoordinatorProfile(
  row: CoordinatorRow,
): PublicUnitCoordinatorProfile {
  return {
    id: String(row.coordinator_id),
    basicInformation: {
      fullName: joinName(row.first_name, row.last_name),
      bio: row.bio ?? "",
      photoPreview: "",
      schoolDepartment: row.faculty ?? "",
      academicRole: row.role ?? "",
    },
    expertise: {
      selectedTopics: [],
      experienceLevelsRequired: [],
      industryRelevance: row.discipline ?? "",
      learningObjective: row.learning_objective ?? "",
    },
    engagementProfile: {
      primaryLocation: row.location ?? "",
      sessionDuration: row.duration ?? "",
      audienceSize: row.audience ?? "",
      formats: coordinatorFormats(row),
      deliveryFocus: coordinatorDeliveryFocus(row),
      schedule: {
        preferredDays: [],
        preferredFrom: "",
        preferredTo: "",
        engagementFrequency: "",
        scheduleNotes: "",
      },
    },
  };
}