"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SettingsPageContent from "@/components/settings/SettingsPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { DEMO_UNIT_COORDINATOR_ID, DEMO_USER_EMAILS } from "@/config/demoUsers";

export default function UnitCoordinatorSettingsPage() {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      <SettingsPageContent userType="unitCoordinator" currentUserId={DEMO_UNIT_COORDINATOR_ID} seedEmail={DEMO_USER_EMAILS.unitCoordinator} />
    </DashboardShell>
  );
}
