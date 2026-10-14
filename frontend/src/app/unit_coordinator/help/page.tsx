"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import HelpPageContent from "@/components/help/HelpPageContent";
import heroImage from "@/assets/help/help-unit-coordinator.svg";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

export default function UnitCoordinatorHelpPage() {
  return (
    <DashboardShell role="unitCoordinator" menuItems={unitCoordinatorMenu} notificationHref="/unit_coordinator/notifications">
      <HelpPageContent heroImage={heroImage} role="unitCoordinator" />
    </DashboardShell>
  );
}
