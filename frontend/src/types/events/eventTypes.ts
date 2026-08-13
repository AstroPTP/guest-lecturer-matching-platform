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
}
