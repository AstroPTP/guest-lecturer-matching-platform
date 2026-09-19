"use client";

import Image from "next/image";
import Link from "next/link";
import logoutIcon from "@/assets/log_out.png";
import schoolIcon from "@/assets/school.png";
import collapsedIcon from "@/assets/collapsed.png";
import expandedIcon from "@/assets/expanded.png";
import SidebarItem from "./SidebarItem";
import { DashboardMenuItem } from "./dashboardTypes";

interface DashboardSidebarProps {
  items: DashboardMenuItem[];
  theme: "guest" | "coordinator";
  collapsed: boolean;
  onToggleCollapsed: () => void;
}
export default function DashboardSidebar({ items, theme, collapsed, onToggleCollapsed }: DashboardSidebarProps) {
  return (
    <aside
      className={
        "fixed left-0 top-0 z-30 flex h-screen flex-col px-3 py-6 " +
        (collapsed ? "w-20" : "w-56") +
        " " +
        (theme === "coordinator" ? "border-blue-100 bg-blue-50/95" : "border-teal-100 bg-teal-50/95") +
        " border-r"
      }
    >
      <Link href="/" className={"flex min-w-0 items-center gap-2 px-2 text-xl font-bold leading-tight text-[#242424] " + (collapsed ? "justify-center px-0" : "")}>
        <Image src={schoolIcon} alt="" width={28} height={28} />
        {!collapsed && <span className="truncate">Curtin University</span>}
      </Link>

      <nav className="mt-3 space-y-1">
        {items.map((item) => (
          <SidebarItem key={item.href} label={item.label} href={item.href} icon={item.icon} theme={theme} collapsed={collapsed} />
        ))}
      </nav>

      <div className="mt-auto space-y-1">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={"flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-gray-600 hover:text-black " + (collapsed ? "justify-center px-0" : "")}
        >
          <Image src={collapsed ? collapsedIcon : expandedIcon} alt="" width={20} height={20} />
          {!collapsed && "Collapse"}
        </button>

        <a
          href="/auth/logout"
          title="Logout"
          className={"flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-gray-600 hover:text-black " + (collapsed ? "justify-center px-0" : "")}
        >
          <Image src={logoutIcon} alt="" width={20} height={20} />
          {!collapsed && "Logout"}
        </a>
      </div>
    </aside>
  );
}
