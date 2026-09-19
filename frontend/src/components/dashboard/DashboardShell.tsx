"use client";

import { ReactNode, useSyncExternalStore } from "react";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import { DashboardMenuItem } from "./dashboardTypes";
import type { UserRole } from "@/types/shared/userRole";

interface DashboardShellProps {
  children: ReactNode;
  menuItems: DashboardMenuItem[];
  role: UserRole;
  notificationHref: string;
}

const collapsedListeners = new Set<() => void>();
let sidebarCollapsed = false;

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  return () => {
    collapsedListeners.delete(listener);
  };
}

function getCollapsedSnapshot(): boolean {
  return sidebarCollapsed;
}

function getCollapsedServerSnapshot(): boolean {
  return false;
}

function setSidebarCollapsed(next: boolean) {
  sidebarCollapsed = next;
  collapsedListeners.forEach((listener) => listener());
}

export default function DashboardShell({ children, menuItems, role, notificationHref }: DashboardShellProps) {
  const theme = role === "unitCoordinator" ? "coordinator" : "guest";
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, getCollapsedServerSnapshot);

  function toggleCollapsed() {
    setSidebarCollapsed(!collapsed);
  }

  return (
    <div
      className={ "min-h-screen " + (theme === "coordinator" ? "bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50" : "bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50")}
    >
      <DashboardSidebar items={menuItems} theme={theme} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className={"min-h-screen " + (collapsed ? "pl-20" : "pl-56")}>
        <DashboardHeader
          role={role}
          notificationHref={notificationHref}
          theme={theme}
        />
        <main className="min-h-[calc(100vh-5rem)] px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
