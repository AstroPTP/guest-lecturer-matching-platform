import Image from "next/image";

import discoveryIcon from "@/assets/discovery.png";
import eventIcon from "@/assets/event.png";
import matchIcon from "@/assets/match.png";
import messageIcon from "@/assets/message.png";
import personIcon from "@/assets/person.png";
import settingsIcon from "@/assets/settings.png";
import type { DashboardMenuItem } from "@/components/dashboard/dashboardTypes";
import type { UserRole } from "@/types/shared/userRole";
import { getDashboardRoutes } from "@/config/routes";

export function buildDashboardMenu(role: UserRole): DashboardMenuItem[] {
  const routes = getDashboardRoutes(role);
  return [
    {
      label: "My Profile",
      href: routes.profile,
      icon: <Image src={personIcon} alt="" width={20} height={20} />,
    },
    {
      label: "Discovery",
      href: routes.discovery,
      icon: <Image src={discoveryIcon} alt="" width={20} height={20} />,
    },
    {
      label: "Match",
      href: routes.matches,
      icon: <Image src={matchIcon} alt="" width={20} height={20} />,
    },
    {
      label: "Event",
      href: routes.events,
      icon: <Image src={eventIcon} alt="" width={20} height={20} />,
    },
    {
      label: "Message",
      href: routes.messages,
      icon: <Image src={messageIcon} alt="" width={20} height={20} />,
    },
    {
      label: "Settings",
      href: routes.settings,
      icon: <Image src={settingsIcon} alt="" width={20} height={20} />,
    },
    {
      label: "Help",
      href: routes.help,
      icon: <HelpIcon />,
    },
  ];
}

/** A question mark in a circle, drawn inline because the icon set has none. */
function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={20} height={20}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.8" r="1.1" fill="currentColor" />
    </svg>
  );
}
