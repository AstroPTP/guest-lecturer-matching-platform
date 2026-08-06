import type { UserRole } from "@/types/shared/userRole";

const ROLE_ROOTS: Record<UserRole, string> = {
  guestLecturer: "/guest_lecturer",
  unitCoordinator: "/unit_coordinator",
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
  } as const;
}

export const GUEST_LECTURER_ROUTES = getDashboardRoutes("guestLecturer");
export const UNIT_COORDINATOR_ROUTES = getDashboardRoutes("unitCoordinator");

