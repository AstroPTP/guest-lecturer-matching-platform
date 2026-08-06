import type { AppNotification, CreateNotificationData } from "@/types/notifications/notificationTypes";

// TODO(API): This module simulated notifications in browser storage. Replace
// with GET /api/notifications (cursor, limit, unread), PATCH
// /api/notifications/:id/read and POST /api/notifications/read-all.
// TODO(BACKEND): Decide real-time delivery (WebSocket/SSE/polling) to
// replace the same-tab/cross-tab browser events used by the previous
// prototype. No notification data may be persisted in the browser.

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getNotifications(_recipientId: string): Promise<AppNotification[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getUnreadNotificationCount(_recipientId: string): Promise<number> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function createNotification(_data: CreateNotificationData): Promise<AppNotification> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function markNotificationAsRead(_notificationId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function markAllNotificationsAsRead(_recipientId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
