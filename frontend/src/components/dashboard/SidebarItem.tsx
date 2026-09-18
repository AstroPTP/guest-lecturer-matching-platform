"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SidebarItemProps {
  label: string;
  href: string;
  icon: ReactNode;
  theme: "guest" | "coordinator";
  collapsed?: boolean;
}

export default function SidebarItem({ label, href, icon, theme, collapsed = false }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");
  const activeClass =  theme === "coordinator" ? "border-blue-600 bg-white font-semibold text-blue-700 shadow-sm" : "border-teal-600 bg-white font-semibold text-teal-700 shadow-sm";
  const hoverClass = theme === "coordinator" ? "hover:bg-blue-100 hover:text-blue-700" : "hover:bg-teal-100 hover:text-teal-700";

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={
        "flex items-center gap-3 rounded-l-lg border-r-2 py-3 text-sm transition-colors " +
        (collapsed ? "justify-center px-0 mr-0" : "-mr-3 px-3") +
        " " +
        (isActive ? activeClass : "border-transparent text-gray-600 " + hoverClass)
      }
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
