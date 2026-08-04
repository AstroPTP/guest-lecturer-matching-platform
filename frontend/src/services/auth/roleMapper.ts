import type { AccountRole } from "@/types/auth/authTypes";
import type { UserRole } from "@/types/shared/userRole";

export function toUserRole(accountRole: AccountRole): UserRole {
  return accountRole === "coordinator" ? "unitCoordinator" : "guestLecturer";
}

