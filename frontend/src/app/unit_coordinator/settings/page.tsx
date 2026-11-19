"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SettingsPageContent from "@/components/settings/SettingsPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

export default function UnitCoordinatorSettingsPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      <SettingsPageContent  seedEmail="" />
    </DashboardShell>
  );
}
