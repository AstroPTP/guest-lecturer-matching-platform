import type { UserRole } from "@/types/shared/userRole";



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
