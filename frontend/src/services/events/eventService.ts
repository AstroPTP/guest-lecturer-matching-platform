import { notIntegrated } from "@/lib/serviceErrors";
import type { AcademicEvent, CreateAcademicEventData } from "@/types/events/eventTypes";


export async function getEventsForCoordinator(): Promise<AcademicEvent[]> {
  return [];
}

export async function getEventsForGuestLecturer(): Promise<AcademicEvent[]> {
  return [];
}

export async function createEvent(_data: CreateAcademicEventData): Promise<AcademicEvent> {
  return notIntegrated();
}

export async function acceptEvent(_eventId: string): Promise<AcademicEvent | null> {
  return notIntegrated();
}

export async function declineEvent(_eventId: string): Promise<AcademicEvent | null> {
  return notIntegrated();
}

export async function cancelEvent(_eventId: string): Promise<AcademicEvent | null> {
  return notIntegrated();
}

export async function completeEvent(_eventId: string): Promise<AcademicEvent | null> {
  return notIntegrated();
}
