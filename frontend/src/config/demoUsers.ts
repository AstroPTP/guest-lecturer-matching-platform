import type { UserRole } from "@/types/shared/userRole";

// TODO(AUTH): This file is the single seam for the prototype's current-user
// identity. Replace every value below with the authenticated user's id/role/
// email from GET /api/users/me (see CurrentUserResponse in BACKEND_HANDOFF.md).
// Do not hard-code a user id anywhere else in the client.
export const DEMO_GUEST_LECTURER_ID = "guest-lecturer-demo-1";
export const DEMO_UNIT_COORDINATOR_ID = "unit-coordinator-demo-1";

export const DEMO_USER_IDS: Record<UserRole, string> = {
  guestLecturer: DEMO_GUEST_LECTURER_ID,
  unitCoordinator: DEMO_UNIT_COORDINATOR_ID,
};

export const DEMO_USER_EMAILS: Record<UserRole, string> = {
  guestLecturer: "guest.lecturer@example.com",
  unitCoordinator: "unit.coordinator@example.com",
};
