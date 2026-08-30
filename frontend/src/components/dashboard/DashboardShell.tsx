import { ReactNode } from "react";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import { DashboardMenuItem } from "./dashboardTypes";
import type { UserRole } from "@/types/shared/userRole";

interface DashboardShellProps {
  children: ReactNode;
  menuItems: DashboardMenuItem[];
  role: UserRole;
  notificationHref: string;
  messagesHref: string;
  profileHref: string;
}

export default function DashboardShell({ children, menuItems, role, notificationHref, messagesHref, profileHref }: DashboardShellProps) {
  const theme = role === "unitCoordinator" ? "coordinator" : "guest";
  return (
    <div
      className={ "min-h-screen " + (theme === "coordinator" ? "bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50" : "bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50")}
    >
      <DashboardSidebar items={menuItems} theme={theme} />
      <div className="min-h-screen pl-56">
        <DashboardHeader
          role={role}
          notificationHref={notificationHref}
          messagesHref={messagesHref}
          profileHref={profileHref}
          theme={theme}
        />
        <main className="min-h-[calc(100vh-5rem)] px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
