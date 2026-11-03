import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NotificationsPageContent from "@/components/notifications/NotificationsPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

export const metadata: Metadata = { title: "Notifications" };

export default function UnitCoordinatorNotificationsPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      <NotificationsPageContent />
    </DashboardShell>
  );
}
