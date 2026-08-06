"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import analyticsIcon from "@/assets/analytics.png";
import dashboardIcon from "@/assets/dashboard.png";
import groupIcon from "@/assets/group.png";
import historyIcon from "@/assets/history.png";
import logoutIcon from "@/assets/log_out.png";
import notificationIcon from "@/assets/notification.png";
import schoolIcon from "@/assets/school.png";
import settingsIcon from "@/assets/settings.png";

interface NavigationItem {
  href: string;
  label: string;
  icon: StaticImageData;
}

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: dashboardIcon },
  { href: "/dashboard/users", label: "Users", icon: groupIcon },
  { href: "/dashboard/audit_log", label: "Audit Log", icon: historyIcon },
  { href: "/dashboard/analytics", label: "Analytics", icon: analyticsIcon },
  { href: "/dashboard/settings", label: "Configuration", icon: settingsIcon },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
            <Link className={pathname === item.href ? "active" : ""} href={item.href} key={item.href}>
              <Image alt="" aria-hidden="true" src={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="control-sidebar-footer">
          <Link href="/">
            <Image alt="" aria-hidden="true" src={logoutIcon} />
            <span>Logout</span>
          </Link>
        </div>
      </aside>

      <div className="control-workspace">
        <header className="control-topbar">
          <p className="control-greeting" suppressHydrationWarning>
            {greeting}, <strong>Admin!</strong>
          </p>
          <Link className="notification-button" aria-label="Notifications" href="/dashboard/notifications">
            <Image alt="" aria-hidden="true" src={notificationIcon} />
            <span aria-label="3 unread notifications">3</span>
          </Link>
        </header>
        <main className="control-main">{children}</main>
      </div>
    </div>
  );
}
