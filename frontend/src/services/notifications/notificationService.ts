import { backendFetch } from "@/lib/api/backendClient";
import type { AppNotification, CreateNotificationData } from "@/types/notifications/notificationTypes";

export async function getNotifications(): Promise<AppNotification[]> {
  return backendFetch("/notifications");
}

export async function getUnreadNotificationCount(): Promise<number> {
  const notifications = await getNotifications();
  return notifications.filter((n) => !n.read).length;
}

export async function createNotification(data: CreateNotificationData): Promise<AppNotification> {
  return backendFetch("/notifications", { method: "POST", body: JSON.stringify(data) });
}

export async function markNotificationAsRead(id: string): Promise<AppNotification> {
  return backendFetch(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsAsRead(): Promise<{ success: boolean }> {
  return backendFetch("/notifications/read-all", { method: "PATCH" });
}