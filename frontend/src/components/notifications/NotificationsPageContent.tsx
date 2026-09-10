"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import arrowIcon from "@/assets/arrow.png";
import emailIcon from "@/assets/email.png";
import infoIcon from "@/assets/info.png";
import matchIcon from "@/assets/match.png";
import messageIcon from "@/assets/message.png";
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "@/services/notifications/notificationService";
import type { AppNotification, NotificationType } from "@/types/notifications/notificationTypes";

const NOTIFICATION_ICONS = {
  match: matchIcon,
  event: emailIcon,
  message: messageIcon,
  profile: infoIcon,
} satisfies Record<NotificationType, typeof matchIcon>;

export default function NotificationsPageContent() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      setErrorMessage(null);

      try {
        const data = await getNotifications();

        if (!cancelled) {
          setNotifications(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to load notifications:", error);
          setErrorMessage("Unable to load data. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleMarkAllAsRead() {
    setActionError(null);

    try {
      await markAllNotificationsAsRead();

      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch {
      setActionError("This isn't connected to a backend yet, so notifications couldn't be marked as read.");
    }
  }

  async function handleMarkAsRead(notificationId: string) {
    try {
      await markNotificationAsRead(notificationId);

      setNotifications((current) => current.map((notification) => (notification.id === notificationId ? { ...notification, read: true } : notification)));
    } catch {
      setActionError("This isn't connected to a backend yet, so notifications couldn't be marked as read.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Loading notifications...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-center text-red-700">{errorMessage}</p>
      </div>
    );
  }

  const groups = groupNotifications(notifications);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-12">
      <div className="mb-12 flex items-center justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Activity centre</p>
          <h2 className="text-4xl font-bold tracking-tight text-[#242424]">Notifications</h2>
        </div>

        {notifications.length > 0 && (
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            className="text-sm font-semibold text-[#242424] underline-offset-4 hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>
      {actionError && <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700">{actionError}</div>}
      {notifications.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-20 text-center shadow-sm">
          <Image src={infoIcon} alt="" width={40} height={40} className="mx-auto opacity-60" />
          <h3 className="mt-5 text-xl font-semibold text-[#242424]">No notifications yet</h3>
          <p className="mt-2 text-sm text-gray-500">New matches and activity will appear here.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.label}>
              <h3 className="mb-6 text-2xl font-semibold text-[#2d2d2d]">{group.label}</h3>

              <div className="space-y-4">
                {group.items.map((item) => (
                  <article
                    key={item.id}
                    className={
                      "grid grid-cols-[12px_48px_minmax(0,1fr)_auto] items-center gap-5 rounded-2xl border px-5 py-6 transition-colors " +
                      (item.read ? "border-transparent bg-white/70" : "border-gray-200 bg-white shadow-sm")
                    }
                  >
                    <span className={"h-2 w-2 rounded-full " + (item.read ? "bg-transparent" : "bg-[#242424]")} />

                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f1f1f1]">
                      <Image src={NOTIFICATION_ICONS[item.type]} alt="" width={22} height={22} />
                    </span>

                    <div className="min-w-0">
                      <h4 className="font-semibold text-[#303030]">{item.title}</h4>
                      <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                      <p className="mt-2 text-xs text-gray-400">{formatNotificationTime(item.createdAt)}</p>
                    </div>

                    <Link
                      href={item.href}
                      onClick={() => void handleMarkAsRead(item.id)}
                      className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-[#303030] hover:underline"
                    >
                      {item.actionLabel}
                      <Image src={arrowIcon} alt="" width={16} height={16} aria-hidden="true" className="h-4 w-4 object-contain" />
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupNotifications(notifications: AppNotification[]): {
  label: string;
  items: AppNotification[];
}[] {
  const today: AppNotification[] = [];
  const yesterday: AppNotification[] = [];
  const earlier: AppNotification[] = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  for (const notification of notifications) {
    const createdAt = new Date(notification.createdAt).getTime();
    if (createdAt >= startOfToday) {
      today.push(notification);
    } else if (createdAt >= startOfYesterday) {
      yesterday.push(notification);
    } else {
      earlier.push(notification);
    }
  }
  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}

function formatNotificationTime(createdAt: string): string {
  const date = new Date(createdAt);
  const elapsedMilliseconds = Date.now() - date.getTime();
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMilliseconds / (60 * 1000)));
  if (elapsedMinutes < 60) {
    return elapsedMinutes + " min ago";
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return elapsedHours + " " + (elapsedHours === 1 ? "hour" : "hours") + " ago";
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
