"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SuggestionsPageContent from "@/components/suggestions/SuggestionsPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

export default function UnitCoordinatorSuggestionsPage() {
  return (
    <DashboardShell role="unitCoordinator" menuItems={unitCoordinatorMenu} notificationHref="/unit_coordinator/notifications">
      <SuggestionsPageContent />
    </DashboardShell>
  );
}
