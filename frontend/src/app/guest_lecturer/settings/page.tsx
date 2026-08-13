"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SettingsPageContent from "@/components/settings/SettingsPageContent";

import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import { DEMO_GUEST_LECTURER_ID, DEMO_USER_EMAILS } from "@/config/demoUsers";

export default function GuestLecturerSettingsPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      currentUserId={DEMO_GUEST_LECTURER_ID}
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      <SettingsPageContent userType="guestLecturer" currentUserId={DEMO_GUEST_LECTURER_ID} seedEmail={DEMO_USER_EMAILS.guestLecturer} />
    </DashboardShell>
  );
}
