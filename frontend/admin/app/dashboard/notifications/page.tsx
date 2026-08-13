"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useState } from "react";
import arrowIcon from "@/assets/arrow.png";
import eventIcon from "@/assets/event.png";
import groupIcon from "@/assets/group.png";
import ruleIcon from "@/assets/rule.png";
import verifiedUserIcon from "@/assets/verified_user.png";
import { initialNotifications, notificationGroups } from "@/data/notifications";
import type { NotificationType } from "@/types/admin";

const notificationIcons: Record<NotificationType, StaticImageData> = {
  Matching: verifiedUserIcon,
  User: groupIcon,
  Security: ruleIcon,
  Event: eventIcon,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications);

  function markAsRead(id: number) {
    setNotifications((current) => current.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)));
  }

  return (
    <div className="admin-activity-centre">
      <header className="activity-centre-heading">
        <h1>Notifications</h1>
        {notifications.some((notification) => !notification.read) && (
          <button onClick={() => setNotifications((current) => current.map((item) => ({ ...item, read: true })))} type="button">
            Mark all read
          </button>
        )}
      </header>

      <div className="activity-groups">
        {notificationGroups.map((group) => {
          const items = notifications.filter((notification) => notification.group === group);
          if (items.length === 0) return null;

          return (
            <section className="activity-group" key={group}>
              <h2>{group}</h2>
              <div>
                {items.map((item) => (
                  <article className={item.read ? "read" : "unread"} key={item.id}>
                    <span className="activity-unread-dot" />
                    <span className="activity-icon">
                      <Image alt="" aria-hidden="true" src={notificationIcons[item.type]} />
                    </span>
                    <div className="activity-copy">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <time>{item.time}</time>
                    </div>
                    <Link href={item.href} onClick={() => markAsRead(item.id)}>
                      {item.actionLabel}
                      <Image alt="" aria-hidden="true" height={12} src={arrowIcon} width={12} />
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
