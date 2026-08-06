"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import logoutIcon from "@/assets/log_out.png";
import schoolIcon from "@/assets/school.png";
import { logoutCurrentAccount } from "@/services/auth/authService";

import SidebarItem from "./SidebarItem";
import { DashboardMenuItem } from "./dashboardTypes";

interface DashboardSidebarProps {
  items: DashboardMenuItem[];
  theme: "guest" | "coordinator";
}

export default function DashboardSidebar({ items, theme }: DashboardSidebarProps) {
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    setLogoutError("");

    try {
      // TODO(AUTH): Replace with POST /api/auth/logout, then clear client UI
      // state; the backend owns ending the session.
      await logoutCurrentAccount();
      router.replace("/");
    } catch {
      setLogoutError("Logout isn't connected to a backend yet.");
    }
  };

  return (
    <aside
      className={
        "fixed left-0 top-0 z-30 flex h-screen w-56 flex-col border-r px-3 py-6 " +
        (theme === "coordinator" ? "border-blue-100 bg-blue-50/95" : "border-teal-100 bg-teal-50/95")
      }
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 px-2 text-xl font-bold leading-tight text-[#242424]">
        <Image src={schoolIcon} alt="" width={28} height={28} />
        <span>Curtin University</span>
      </Link>

      {/* Main menu */}
      <nav className="mt-7 space-y-1">
        {items.map((item) => (
          <SidebarItem key={item.href} label={item.label} href={item.href} icon={item.icon} theme={theme} />
        ))}
      </nav>

      {/* Bottom menu */}
      <div className="mt-auto space-y-1">
        <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-gray-600 hover:text-black">
          <Image src={logoutIcon} alt="" width={20} height={20} />
          Logout
        </button>

        {logoutError && <p className="px-3 text-xs text-red-600">{logoutError}</p>}
      </div>
    </aside>
  );
}
