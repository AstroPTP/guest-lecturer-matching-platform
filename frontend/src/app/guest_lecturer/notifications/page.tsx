import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NotificationsPageContent from "@/components/notifications/NotificationsPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export const metadata: Metadata = { title: "Notifications" };

export default function GuestLecturerNotificationsPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
    >
      <NotificationsPageContent />
    </DashboardShell>
  );
}
