"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FilterPageContent from "@/components/filter/FilterPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { DEMO_UNIT_COORDINATOR_ID } from "@/config/demoUsers";

export default function UnitCoordinatorFilterPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      currentUserId={DEMO_UNIT_COORDINATOR_ID}
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      <FilterPageContent role="unitCoordinator" discoveryHref="/unit_coordinator/discovery" />
    </DashboardShell>
  );
}
