import { backendFetch } from "@/lib/api/backendClient";
import type { AcademicEvent, CreateAcademicEventData } from "@/types/events/eventTypes";

export async function createEvent(data: CreateAcademicEventData): Promise<AcademicEvent> {
  return backendFetch("/events", { method: "POST", body: JSON.stringify(data) });
}

export async function getEventsForCoordinator(): Promise<AcademicEvent[]> {
  return backendFetch("/events/coordinator");
}

export async function getEventsForGuestLecturer(): Promise<AcademicEvent[]> {
  return backendFetch("/events/guest-lecturer");
}

export async function acceptEvent(eventId: string): Promise<AcademicEvent> {
  return backendFetch(`/events/${eventId}/accept`, { method: "PATCH" });
}

export async function declineEvent(eventId: string): Promise<AcademicEvent> {
  return backendFetch(`/events/${eventId}/decline`, { method: "PATCH" });
}

export async function cancelEvent(eventId: string): Promise<AcademicEvent> {
  return backendFetch(`/events/${eventId}/cancel`, { method: "PATCH" });
}

export async function completeEvent(eventId: string): Promise<AcademicEvent> {
  return backendFetch(`/events/${eventId}/complete`, { method: "PATCH" });
}