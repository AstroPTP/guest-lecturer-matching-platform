/** Where the coordinator already stands with a suggested lecturer. */
export type SuggestionMatchStatus = "none" | "interest-sent" | "interest-received" | "matched";

/** One suggested guest lecturer, as GET /suggestions returns it. */
export interface Suggestion {
  /** The same id Discovery and Matches use for this lecturer. */
  guestId: string;
  name: string;
  field: string;
  role: string;
  photoUrl: string;
  /** The requested topics this lecturer covers. */
  sharedTopics: string[];
  matchStatus: SuggestionMatchStatus;
  /** The ordering score, 0 to 100. */
  score: number;
  /** The three parts of the score, each 0 to 100. */
  fit: number;
  rotation: number;
  exposure: number;
  /** 0 to 100. A pass or fail gate, not part of the score. */
  reliability: number;
  sessionsSoFar: number;
  /** When the lecturer last matched with anyone, or null if never. */
  lastSessionAt: string | null;
}

/** How many lecturers are left after each rule. Each count includes only those who passed every rule before it. */
export interface SuggestionStages {
  considered: number;
  eligible: number;
  available: number;
  sharesTopic: number;
  reliable: number;
}

export interface SuggestionsResult {
  session: { date: string; startTime: string; endTime: string; topics: string[] };
  stages: SuggestionStages;
  suggestions: Suggestion[];
}

/** The session a coordinator describes. */
export interface SuggestionsQuery {
  /** YYYY-MM-DD */
  date: string;
  /** 24-hour HH:MM */
  startTime: string;
  /** 24-hour HH:MM */
  endTime: string;
  topics: string[];
}
