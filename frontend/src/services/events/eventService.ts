import type { AcademicEvent, CreateAcademicEventData } from "@/types/events/eventTypes";

// TODO(API): This module simulated event invitations in browser storage.
// Replace with the endpoints in BACKEND_HANDOFF.md:
//   getAllEvents / getEventsForCoordinator / getEventsForGuestLecturer
//     -> GET /api/events (cursor, limit, status, date range)
//   createEvent    -> POST /api/events
//   acceptEvent/declineEvent -> PATCH /api/events/:id/response
//   cancelEvent/completeEvent -> PATCH /api/events/:id/status
// TODO(BACKEND): Define event timezone handling and who may create/edit/
// cancel/complete an event; the client must not enforce these permissions.
// No event data may be persisted in the browser.

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getAllEvents(): Promise<AcademicEvent[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getEventsForCoordinator(_coordinatorId: string): Promise<AcademicEvent[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getEventsForGuestLecturer(_guestLecturerId: string): Promise<AcademicEvent[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function createEvent(_data: CreateAcademicEventData): Promise<AcademicEvent> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function acceptEvent(_eventId: string): Promise<AcademicEvent | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function declineEvent(_eventId: string): Promise<AcademicEvent | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function cancelEvent(_eventId: string): Promise<AcademicEvent | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function completeEvent(_eventId: string): Promise<AcademicEvent | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
