import { apiFetch } from "@/lib/apiClient";
import type { AcademicEvent, CreateAcademicEventData } from "@/types/events/eventTypes";

export async function createEvent(data: CreateAcademicEventData): Promise<AcademicEvent> {
  return apiFetch("/events", { method: "POST", body: JSON.stringify(data) });
}

export async function getEventsForCoordinator(): Promise<AcademicEvent[]> {
  return apiFetch("/events/coordinator");
}

export async function getEventsForGuestLecturer(): Promise<AcademicEvent[]> {
  return apiFetch("/events/guest-lecturer");
}

export async function acceptEvent(eventId: string): Promise<AcademicEvent> {
  return apiFetch(`/events/${eventId}/accept`, { method: "PATCH" });
}

export async function declineEvent(eventId: string): Promise<AcademicEvent> {
  return apiFetch(`/events/${eventId}/decline`, { method: "PATCH" });
}

export async function cancelEvent(eventId: string): Promise<AcademicEvent> {
  return apiFetch(`/events/${eventId}/cancel`, { method: "PATCH" });
}

export async function completeEvent(eventId: string): Promise<AcademicEvent> {
  return apiFetch(`/events/${eventId}/complete`, { method: "PATCH" });
}