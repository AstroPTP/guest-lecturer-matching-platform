import { backendFetch } from "@/lib/api/backendClient";
import type { AppNotification } from "@/types/notifications/notificationTypes";

export async function getNotifications(): Promise<AppNotification[]> {
  return backendFetch("/notifications");
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count } = await backendFetch<{ count: number }>("/notifications/unread-count");
  return count;
}

export async function markNotificationAsRead(id: string): Promise<AppNotification> {
  return backendFetch(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsAsRead(): Promise<{ success: boolean }> {
  return backendFetch("/notifications/read-all", { method: "PATCH" });
}