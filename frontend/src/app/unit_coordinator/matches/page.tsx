import DashboardShell from "@/components/dashboard/DashboardShell";
import MatchesPageContent from "@/components/matches/MatchesPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { DEMO_UNIT_COORDINATOR_ID } from "@/config/demoUsers";

export default function UnitCoordinatorMatchesPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      currentUserId={DEMO_UNIT_COORDINATOR_ID}
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      <MatchesPageContent
        currentUserId={DEMO_UNIT_COORDINATOR_ID}
        currentUserType="unitCoordinator"
        title="Active Matches"
        description="Review Guest Lecturers who have mutually expressed interest in connecting with you."
        messagesHref="/unit_coordinator/messages"
      />
    </DashboardShell>
  );
}
