"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SidebarItemProps {
  label: string;
  href: string;
  icon: ReactNode;
  theme: "guest" | "coordinator";
}

export default function SidebarItem({ label, href, icon, theme }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");
  const activeClass =  theme === "coordinator" ? "border-blue-600 bg-white font-semibold text-blue-700 shadow-sm" : "border-teal-600 bg-white font-semibold text-teal-700 shadow-sm";
  const hoverClass = theme === "coordinator" ? "hover:bg-blue-100 hover:text-blue-700" : "hover:bg-teal-100 hover:text-teal-700";

  return (
    <Link
      href={href}
      className={
        "-mr-3 flex items-center gap-3 rounded-l-lg border-r-2 px-3 py-3 text-sm transition-colors " +
        (isActive ? activeClass : "border-transparent text-gray-600 " + hoverClass)
      }
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
