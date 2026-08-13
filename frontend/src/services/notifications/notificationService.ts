import type { AppNotification, CreateNotificationData } from "@/types/notifications/notificationTypes";

//need to connect

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
