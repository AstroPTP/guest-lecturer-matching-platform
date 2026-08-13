import DashboardShell from "@/components/dashboard/DashboardShell";
import NotificationsPageContent from "@/components/notifications/NotificationsPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { DEMO_UNIT_COORDINATOR_ID } from "@/config/demoUsers";

export default function UnitCoordinatorNotificationsPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      currentUserId={DEMO_UNIT_COORDINATOR_ID}
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      <NotificationsPageContent currentUserId={DEMO_UNIT_COORDINATOR_ID} />
    </DashboardShell>
  );
}
