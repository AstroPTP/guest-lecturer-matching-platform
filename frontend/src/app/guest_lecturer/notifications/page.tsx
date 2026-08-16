import DashboardShell from "@/components/dashboard/DashboardShell";
import NotificationsPageContent from "@/components/notifications/NotificationsPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export default function GuestLecturerNotificationsPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      <NotificationsPageContent />
    </DashboardShell>
  );
}
