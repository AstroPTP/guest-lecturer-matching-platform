import type { AppNotification, CreateNotificationData } from "@/types/notifications/notificationTypes";

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getNotifications(): Promise<AppNotification[]> {
  return [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  return 0;
}

export async function createNotification(_data: CreateNotificationData): Promise<AppNotification> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function markNotificationAsRead(_notificationId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
