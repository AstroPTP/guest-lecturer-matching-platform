"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FilterPageContent from "@/components/filter/FilterPageContent";

import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import { DEMO_GUEST_LECTURER_ID } from "@/config/demoUsers";

export default function GuestLecturerFilterPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      currentUserId={DEMO_GUEST_LECTURER_ID}
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      <FilterPageContent role="guestLecturer" discoveryHref="/guest_lecturer/discovery" />
    </DashboardShell>
  );
}
