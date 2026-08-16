import DashboardShell from "@/components/dashboard/DashboardShell";
import MatchesPageContent from "@/components/matches/MatchesPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";

export default function GuestLecturerMatchesPage() {
  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
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
