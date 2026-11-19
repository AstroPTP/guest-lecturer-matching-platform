import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import MatchesPageContent from "@/components/matches/MatchesPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export const metadata: Metadata = { title: "Matches" };

export default function GuestLecturerMatchesPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
    >
      <MatchesPageContent
        currentUserType="guestLecturer"
        title="Active Matches"
        description="Review Unit Coordinators who have mutually expressed interest in connecting with you."
        messagesHref="/guest_lecturer/messages"
      />
    </DashboardShell>
  );
}
