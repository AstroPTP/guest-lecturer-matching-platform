export type NotificationType = "match" | "event" | "message" | "profile";

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  createdAt: string;
  read: boolean;
}

/** How many notifications are unread, and when the newest one arrived. */
export interface UnreadNotificationSummary {
  count: number;
  /** Null when the person has no notifications at all. */
  latestAt: string | null;
}
