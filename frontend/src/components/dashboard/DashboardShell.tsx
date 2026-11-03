"use client";

import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { releaseDeviceBeforeSignOut } from "@/lib/push/signOutCleanup";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import { DashboardMenuItem } from "./dashboardTypes";
import { useSuggestionsOn } from "@/lib/hooks/useSuggestionsOn";
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

/**
 * Sends the user to login when the browser shows this page from its
 * back/forward cache after they logged out. That restore never reaches the
 * server, so the proxy's sign-in check does not run; ask for the session here.
 */
function useLeaveWhenSignedOut() {
  useEffect(() => {
    async function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) {
        return;
      }
      // Hide the restored page until the session is confirmed, so a signed-out
      // user never sees the old dashboard while the check runs.
      const page = document.documentElement;
      page.style.visibility = "hidden";
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
        const body = (await response.json()) as { user: unknown };
        if (!body.user) {
          await releaseDeviceBeforeSignOut();
          window.location.replace("/login");
          return;
        }
      } catch {
        // Offline or the check failed: show the page; its API calls still
        // send a signed-out user to login.
      }
      page.style.visibility = "";
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
}

export default function DashboardShell({ children, menuItems, role, notificationHref }: DashboardShellProps) {
  const theme = role === "unitCoordinator" ? "coordinator" : "guest";
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, getCollapsedServerSnapshot);
  useLeaveWhenSignedOut();
  // Ranked matching is off until an administrator switches it on, so the items
  // that belong to it stay out of the menu until the API says it is on. A menu
  // with no such item has nothing to wait for, so it does not ask.
  const hasSuggestionsItem = menuItems.some((item) => item.feature === "suggestions");
  const suggestionsOn = useSuggestionsOn(hasSuggestionsItem) === true;
  const visibleItems = menuItems.filter((item) => item.feature !== "suggestions" || suggestionsOn);

  function toggleCollapsed() {
    setSidebarCollapsed(!collapsed);
  }

  return (
    <div
      className={ "min-h-screen " + (theme === "coordinator" ? "bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50" : "bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50")}
    >
      <DashboardSidebar items={visibleItems} theme={theme} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
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
