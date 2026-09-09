"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import FilterPageContent from "@/components/filter/FilterPageContent";

<<<<<<< HEAD
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard"
=======
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
>>>>>>> 48dc92e78865366a1f9471ff8364cd565766ec5e

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
