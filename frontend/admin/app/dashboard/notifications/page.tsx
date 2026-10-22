"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import eventIcon from "@/assets/event.png";
import notificationIcon from "@/assets/notification.png";
import { NOTIFICATIONS_MARKED_READ_EVENT, UNREAD_COUNT_CHANGED_EVENT } from "@/lib/unreadCountPoller";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/adminApi";
import type { AdminNotification } from "@/types/admin";

/** Only a path inside the portal is followed; anything else is shown without a link. */
function isPortalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * The administrator's inbox: what has happened that they should know about,
 * newest first. Unread notices carry a dot. Following a notice's link marks it
 * read, and Mark all read clears the lot; the bell in the top bar follows
 * either one straight away.
 */
export default function NotificationsPage() {
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getNotifications()
        .then((next) => {
          if (active) {
            setItems(next);
            setErrorMessage(null);
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setErrorMessage(error instanceof Error ? error.message : "Notifications could not be loaded.");
          }
        });
    };
    refresh();
    // The bell found something new while this page was open.
    window.addEventListener(UNREAD_COUNT_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(UNREAD_COUNT_CHANGED_EVENT, refresh);
    };
  }, []);

  const newestFirst = useMemo(() => [...(items ?? [])].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()), [items]);
  const unreadCount = newestFirst.filter((item) => !item.read).length;

  async function markRead(id: string) {
    setItems((current) => current?.map((item) => (item.id === id ? { ...item, read: true } : item)) ?? null);
    try {
      await markNotificationRead(id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That notification could not be marked as read.");
      // Show the list as the server has it, if it can be read.
      try {
        setItems(await getNotifications());
      } catch {
        // The error above is what the administrator needs to see.
      }
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_MARKED_READ_EVENT));
  }

  async function markAllRead() {
    if (isMarkingAll) {
      return;
    }
    setActionError(null);
    setIsMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((current) => current?.map((item) => ({ ...item, read: true })) ?? null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The notifications could not be marked as read.");
    } finally {
      setIsMarkingAll(false);
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_MARKED_READ_EVENT));
  }

  if (errorMessage && !items) {
    return <p className="control-empty">{errorMessage}</p>;
  }
  if (!items) {
    return <p className="control-empty">Loading notifications…</p>;
  }

  return (
    <div className="notifications-page">
      <header className="notifications-heading">
        <div>
          <h1>Notifications</h1>
          <p>Guest lectures confirmed or cancelled, newest first. {unreadCount === 0 ? "You are up to date." : unreadCount + " unread."}</p>
        </div>
        <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0 || isMarkingAll}>
          Mark all read
        </button>
      </header>

      {actionError && (
        <p className="control-empty" role="alert">
          {actionError}
        </p>
      )}

      <section className="notification-list" aria-label="Notifications">
        {newestFirst.length === 0 ? (
          <p className="notifications-empty">Nothing yet. You will be told here when a guest lecture is confirmed or cancelled.</p>
        ) : (
          newestFirst.map((item) => (
            <article key={item.id} className={item.read ? "" : "unread"}>
              <span className="notification-type-icon">
                <Image alt="" aria-hidden="true" src={item.type === "event" ? eventIcon : notificationIcon} />
              </span>
              <div>
                <header>
                  <strong>
                    {!item.read && <span className="visually-hidden">Unread: </span>}
                    {item.title}
                  </strong>
                  <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
                </header>
                <p>{item.description}</p>
              </div>
              {isPortalPath(item.href) && (
                <Link href={item.href} onClick={() => void markRead(item.id)}>
                  {item.actionLabel}
                </Link>
              )}
              {!item.read && (
                <button type="button" onClick={() => void markRead(item.id)} aria-label={"Mark as read: " + item.title}>
                  Mark read
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
