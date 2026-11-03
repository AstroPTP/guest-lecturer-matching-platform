"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import analyticsIcon from "@/assets/analytics.png";
import checkIcon from "@/assets/check.png";
import dashboardIcon from "@/assets/dashboard.png";
import descriptionIcon from "@/assets/description.png";
import eventIcon from "@/assets/event.png";
import groupIcon from "@/assets/group.png";
import historyIcon from "@/assets/history.png";
import howToRegIcon from "@/assets/how_to_reg.png";
import logoutIcon from "@/assets/log_out.png";
import infoIcon from "@/assets/info.png";
import notificationIcon from "@/assets/notification.png";
import schoolIcon from "@/assets/school.png";
import settingsIcon from "@/assets/settings.png";
import verifiedUserIcon from "@/assets/verified_user.png";
import visibilityIcon from "@/assets/visibility.png";
import ThemeToggle from "@/components/theme/ThemeToggle";

interface NavigationItem {
  href: string;
  label: string;
  icon: StaticImageData;
}

/**
 * Every page in the portal.
 *
 * Six of these existed and were reachable only by typing the address, which
 * is the same as not existing.
 */
const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: dashboardIcon },
  { href: "/dashboard/users", label: "Users", icon: groupIcon },
  { href: "/dashboard/reviews", label: "Verification Queue", icon: howToRegIcon },
  { href: "/dashboard/lecturers", label: "Guest Lecturers", icon: verifiedUserIcon },
  { href: "/dashboard/coordinators", label: "Coordinators", icon: checkIcon },
  { href: "/dashboard/events", label: "Events", icon: eventIcon },
  { href: "/dashboard/analytics", label: "Analytics", icon: analyticsIcon },
  { href: "/dashboard/system", label: "System", icon: visibilityIcon },
  { href: "/dashboard/reports", label: "Reports", icon: descriptionIcon },
  { href: "/dashboard/requests", label: "Requests", icon: notificationIcon },
  { href: "/dashboard/audit_log", label: "Audit Log", icon: historyIcon },
  { href: "/dashboard/settings", label: "Settings", icon: settingsIcon },
  { href: "/dashboard/help", label: "Help", icon: infoIcon },
];

interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

/**
 * Whether a navigation entry covers the current page.
 *
 * A prefix rather than an exact match, so that a profile at
 * /dashboard/users/#GL-4 still highlights Users. Exact equality left the
 * sidebar with nothing selected on every detail page.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin" });
        const body = (await response.json()) as { user: SessionUser | null };
        if (active) setUser(body.user);
      } catch {
        // Signed-out is a normal state, not an error to surface in the header.
      }
    })();

    return () => {
      active = false;
    };
  }, [pathname]);

  // The greeting named "Admin" as a literal, so every administrator was
  // greeted as somebody else.
  const displayName = user?.name || user?.email?.split("@")[0] || "Administrator";

  return (
    <div className="control-layout">
      <aside className="control-sidebar">
        <Link className="control-brand" href="/dashboard">
          <Image alt="" aria-hidden="true" src={schoolIcon} />
          <span>
            Curtin University<small>Institutional Control</small>
          </span>
        </Link>

        <nav className="control-nav" aria-label="Admin navigation">
          {navigation.map((item) => (
            <Link
              className={isActive(pathname, item.href) ? "active" : ""}
              href={item.href}
              key={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              <Image alt="" aria-hidden="true" src={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="control-sidebar-footer">
          {/*
            Signing out has to end the session, not just navigate away from it.
            This linked to the home page, which left the session intact and the
            proxy put the visitor straight back into the dashboard.
          */}
          <a href="/auth/logout">
            <Image alt="" aria-hidden="true" src={logoutIcon} />
            <span>Logout</span>
          </a>
        </div>
      </aside>

      <div className="control-workspace">
        <header className="control-topbar">
          <p className="control-greeting" suppressHydrationWarning>
            {greeting}, <strong>{displayName}!</strong>
          </p>
          <ThemeToggle />
        </header>
        <main className="control-main">{children}</main>
      </div>
    </div>
  );
}
