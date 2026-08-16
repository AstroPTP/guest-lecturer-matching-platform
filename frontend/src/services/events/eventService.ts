import type { AcademicEvent, CreateAcademicEventData } from "@/types/events/eventTypes";

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getAllEvents(): Promise<AcademicEvent[]> {
  return [];
}

export async function getEventsForCoordinator(): Promise<AcademicEvent[]> {
  return [];
}

export async function getEventsForGuestLecturer(): Promise<AcademicEvent[]> {
  return [];
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
