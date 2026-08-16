"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SettingsPageContent from "@/components/settings/SettingsPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export default function GuestLecturerSettingsPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      <SettingsPageContent userType="guestLecturer" seedEmail="" />
    </DashboardShell>
  );
}
