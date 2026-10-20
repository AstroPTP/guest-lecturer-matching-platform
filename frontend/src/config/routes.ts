import type { UserRole } from "@/types/shared/userRole";

const ROLE_ROOTS: Record<UserRole, string> = {
  guestLecturer: "/guest_lecturer",
  unitCoordinator: "/unit_coordinator",
  // The CCAE administrator dashboard is the separate Next.js app in
  // frontend/admin, not a route tree in this one. Added for KAN-223, which
  // needed ccae_admin to exist as a role; the path is where an administrator
  // is sent, and getDashboardRoutes() is not meaningful for it.
  ccaeAdmin: "/admin",
};

export function getDashboardRoutes(role: UserRole) {
  const root = ROLE_ROOTS[role];

  return {
    root,
    profile: root + "/my_profile",
    discovery: root + "/discovery",
    filter: root + "/filter",
    matches: root + "/matches",
    messages: root + "/messages",
    events: root + "/events",
    notifications: root + "/notifications",
    settings: root + "/settings",
    help: root + "/help",
  } as const;
}

