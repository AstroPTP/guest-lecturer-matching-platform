import DashboardShell from "@/components/dashboard/DashboardShell";
import MatchesPageContent from "@/components/matches/MatchesPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";


export default function UnitCoordinatorMatchesPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
<<<<<<< HEAD
=======
    
>>>>>>> 48dc92e78865366a1f9471ff8364cd565766ec5e
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
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
