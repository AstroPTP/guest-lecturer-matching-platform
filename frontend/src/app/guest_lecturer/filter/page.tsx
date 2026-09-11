"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FilterPageContent from "@/components/filter/FilterPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export default function GuestLecturerFilterPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
    >
      <FilterPageContent role="guestLecturer" discoveryHref="/guest_lecturer/discovery" />
    </DashboardShell>
  );
}
