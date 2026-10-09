"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import HelpPageContent from "@/components/help/HelpPageContent";
import heroImage from "@/assets/help/help-guest-lecturer.svg";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export default function GuestLecturerHelpPage() {
  return (
    <DashboardShell role="guestLecturer" menuItems={guestLecturerMenu} notificationHref="/guest_lecturer/notifications">
      <HelpPageContent heroImage={heroImage} role="guestLecturer" />
    </DashboardShell>
  );
}
