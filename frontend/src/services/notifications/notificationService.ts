import { backendFetch } from "@/lib/api/backendClient";
import type { AppNotification, UnreadNotificationSummary } from "@/types/notifications/notificationTypes";

export async function getNotifications(): Promise<AppNotification[]> {
  return backendFetch("/notifications");
}

/**
 * The unread count and the time of the newest notification. The time is what
 * shows that more messages arrived in a conversation that already had an unread
 * notice, which leaves the count the same.
 */
export async function getUnreadNotificationSummary(): Promise<UnreadNotificationSummary> {
  const { count, latestAt } = await backendFetch<{ count: number; latestAt?: string | null }>("/notifications/unread-count");
  return { count, latestAt: latestAt ?? null };
}

export async function getUnreadNotificationCount(): Promise<number> {
  return (await getUnreadNotificationSummary()).count;
}

export async function markNotificationAsRead(id: string): Promise<AppNotification> {
  return backendFetch(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsAsRead(): Promise<{ success: boolean }> {
  return backendFetch("/notifications/read-all", { method: "PATCH" });
}