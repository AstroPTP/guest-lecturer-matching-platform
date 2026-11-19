export type EventStatus = "invitation-sent" | "accepted" | "declined" | "completed" | "cancelled";
export type EventFormat = "face-to-face" | "online" | "pre-recorded";

export interface AcademicEvent {
  id: string;
  matchId: string;
  coordinatorId: string;
  coordinatorName: string;
  guestLecturerId: string;
  guestLecturerName: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  format: EventFormat;
  status: EventStatus;
  createdAt: string;
  respondedAt?: string;
  completedAt?: string;
}

export interface CreateAcademicEventData {
  matchId: string;
  coordinatorName: string;
  guestLecturerId: string;
  guestLecturerName: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  format: EventFormat;
}

/**
 * Starting values for a session with one matched guest lecturer, worked out by
 * the API from the stored profiles. Every field can be changed before sending.
 */
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
