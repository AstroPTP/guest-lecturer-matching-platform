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

export interface CreateNotificationData {
  id?: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
}
