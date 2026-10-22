import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Notifications" };

/** Notifications are shown with the events they are about. */
export default function NotificationsPage() {
  redirect("/dashboard/events");
}
