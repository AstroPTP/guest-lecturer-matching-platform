import DashboardShell from "@/components/dashboard/DashboardShell";
import NotificationsPageContent from "@/components/notifications/NotificationsPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";


export default function UnitCoordinatorNotificationsPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      <NotificationsPageContent />
    </DashboardShell>
  );
}
