import { notIntegrated } from "@/lib/serviceErrors";
import type { AppNotification, CreateNotificationData } from "@/types/notifications/notificationTypes";

export async function getNotifications(): Promise<AppNotification[]> {
  return [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  return 0;
}

export async function createNotification(_data: CreateNotificationData): Promise<AppNotification> {
  return notIntegrated();
}

export async function markNotificationAsRead(_notificationId: string): Promise<void> {
  return notIntegrated();
}

export async function markAllNotificationsAsRead(): Promise<void> {
  return notIntegrated();
}
