"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FilterPageContent from "@/components/filter/FilterPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard"

export default function UnitCoordinatorFilterPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      <FilterPageContent role="unitCoordinator" discoveryHref="/unit_coordinator/discovery" />
    </DashboardShell>
  );
}
