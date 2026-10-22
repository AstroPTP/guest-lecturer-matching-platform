"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import notificationIcon from "@/assets/notification.png";
import { getUnreadNotificationCount } from "@/services/notifications/notificationService";
import { startUnreadCountPolling, UNREAD_COUNT_CHANGED_EVENT } from "@/utils/unreadCountPoller";
import { getGuestLecturerBasicInformation } from "@/services/profile/guestLecturerProfileService";
import { getUnitCoordinatorBasicInformation } from "@/services/profile/unitCoordinatorProfileService";
import type { UserRole } from "@/types/shared/userRole";
import ThemeToggle from "@/components/theme/ThemeToggle";

interface DashboardHeaderProps {
  role: UserRole;
  notificationHref: string;
  theme: "guest" | "coordinator";
}

export default function DashboardHeader({ role, notificationHref, theme }: DashboardHeaderProps) {
  const router = useRouter();
  const roleLabel = role === "unitCoordinator" ? "Unit Coordinator" : "Guest Lecturer";
  const greeting = useSyncExternalStore(subscribeToBrowserChanges, getGreeting, getServerGreeting);
  const [fullName, setFullName] = useState(roleLabel);
  useEffect(() => {
    let cancelled = false;
    async function loadFullName() {
      try {
        const name = await getProfileFullName(role, roleLabel);
        if (!cancelled) {
          setFullName(name);
        }
      } catch {
      }
    }
    void loadFullName();
    return () => {
      cancelled = true;
    };
  }, [role, roleLabel]);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    return startUnreadCountPolling({
      fetchCount: getUnreadNotificationCount,
      onCount: setUnreadCount,
      onChange: () => window.dispatchEvent(new Event(UNREAD_COUNT_CHANGED_EVENT)),
    });
  }, []);
  return (
    <header
      className={ "sticky top-0 z-20 flex h-[72px] items-center justify-between border-b bg-white/90 px-8 backdrop-blur " +  (theme === "coordinator" ? "border-blue-100" : "border-teal-100")  }
    >
      <div>
        <p className="text-2xl font-semibold text-[#1f1f1f]">
          {greeting}, {fullName}!
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle className="hidden sm:inline-flex" />
        <div className="relative">
          <button
            type="button"
            aria-label={"Notifications" + (unreadCount > 0 ? ", " + unreadCount + " unread" : "")}
            title="Notifications"
            onClick={() => router.push(notificationHref)}
            className={"rounded-xl p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " + (theme === "coordinator" ? "hover:bg-blue-100 focus-visible:outline-blue-600" : "hover:bg-teal-100 focus-visible:outline-teal-600")}
          >
            <Image src={notificationIcon} alt="" width={24} height={24} />
          </button>

          {unreadCount > 0 && (
            <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </div>
      </div>
    </header>
  );
}

function subscribeToBrowserChanges(): () => void {
  return () => undefined;
}

function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function getServerGreeting(): string {
  return "Hello";
}
async function getProfileFullName(role: UserRole, fallbackName: string): Promise<string> {
  const profile = role === "unitCoordinator" ? await getUnitCoordinatorBasicInformation() : await getGuestLecturerBasicInformation();
  return profile?.fullName.trim() || fallbackName;
}
