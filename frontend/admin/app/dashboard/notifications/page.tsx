import { redirect } from "next/navigation";

/** Notifications are shown with the events they are about. */
export default function NotificationsPage() {
  redirect("/dashboard/events");
}
