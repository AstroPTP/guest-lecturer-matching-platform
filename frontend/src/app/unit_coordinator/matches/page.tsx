import DashboardShell from "@/components/dashboard/DashboardShell";
import MatchesPageContent from "@/components/matches/MatchesPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";


export default function UnitCoordinatorMatchesPage() {
  return (
    <DashboardShell
      role="unitCoordinator"    
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      <MatchesPageContent
        currentUserType="unitCoordinator"
        title="Active Matches"
        description="Review Guest Lecturers who have mutually expressed interest in connecting with you."
        messagesHref="/unit_coordinator/messages"
      />
    </DashboardShell>
  );
}
