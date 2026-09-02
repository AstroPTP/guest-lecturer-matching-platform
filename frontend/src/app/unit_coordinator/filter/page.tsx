"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FilterPageContent from "@/components/filter/FilterPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

export default function UnitCoordinatorFilterPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      <FilterPageContent role="unitCoordinator" discoveryHref="/unit_coordinator/discovery" />
    </DashboardShell>
  );
}
