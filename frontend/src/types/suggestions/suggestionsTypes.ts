/** Where the coordinator already stands with a suggested lecturer. */
export type SuggestionMatchStatus = "none" | "interest-sent" | "interest-received" | "matched";

/** How long ago a lecturer last matched with anyone. The exact date is never sent. */
export type LastSessionBand = "never" | "within 30 days" | "1 to 3 months" | "over 3 months";

/** How many sessions a lecturer has had with anyone. The exact count is never sent. */
export type SessionsBand = "none" | "1 to 2" | "3 to 5" | "6 or more";

/**
 * The only part of the score the API sends: fit, 0 to 1, to 2 decimals. It comes
 * from topics both sides have published. How recently and how often a lecturer
 * has been matched stays on the server, so the order of the list is the ranking.
 */
export interface SuggestionScore {
  fit: number;
}

/** One suggested guest lecturer, as GET /suggestions returns it. */
export interface Suggestion {
  /** The same id Discovery and Matches use for this lecturer. */
  guestId: string;
  name: string;
  field: string;
  role: string;
  photoUrl: string;
  /** The topics in play that this lecturer covers. */
  sharedTopics: string[];
  matchStatus: SuggestionMatchStatus;
  score: SuggestionScore;
  lastSessionBand: LastSessionBand;
  sessionsBand: SessionsBand;
}

/** How many lecturers are left after each rule. Each count includes only those who passed every rule before it. */
export interface SuggestionStages {
  considered: number;
  eligible: number;
  available: number;
  sharesTopic: number;
  reliable: number;
}

/** Where the topics used for the search came from. */
export type TopicsFrom = "request" | "profile" | "none";

export interface SuggestionsResult {
  /** What the search used. A null was not asked for. */
  session: {
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    topics: string[];
    topicsFrom: TopicsFrom;
  };
  stages: SuggestionStages;
  suggestions: Suggestion[];
}

/** The session a coordinator describes. Every part is optional. */
export interface SuggestionsQuery {
  /** YYYY-MM-DD. Left out means any day. */
  date?: string;
  /** 24-hour HH:MM. Give it with endTime, or leave both out for any time. */
  startTime?: string;
  /** 24-hour HH:MM. */
  endTime?: string;
  /** Left out or empty means the coordinator's own expertise. */
  topics?: string[];
}
