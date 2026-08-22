import type { AccountRole, AppRole } from "@/types/auth/authTypes";
import type { UserRole } from "@/types/shared/userRole";

/**
 * Where the project's role vocabularies meet.
 *
 * KAN-223 asked us to settle on one set of names. Rather than renaming across
 * four codebases mid-sprint, they are reconciled here, in one file, so a
 * component never has to know more than one of them:
 *
 *   token claim (authority)   AccountRole    UserRole          admin app label
 *   guest_speaker          →  guest       →  guestLecturer  →  "Guest Lecturer"
 *   unit_coordinator       →  coordinator →  unitCoordinator → "Unit Coordinator"
 *   ccae_admin             →  admin       →  ccaeAdmin      →  "CCAE Administrator"
 *
 * The claim values are the authority: they are what the backend guard checks
 * and what lives in Auth0. Everything else is presentation.
 */

const APP_ROLES: readonly AppRole[] = [
  "guest_speaker",
  "unit_coordinator",
  "ccae_admin",
];

/** Narrows an untrusted claim value. Unknown strings are discarded. */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function toUserRole(accountRole: AccountRole): UserRole {
  switch (accountRole) {
    case "admin":
      return "ccaeAdmin";
    case "coordinator":
      return "unitCoordinator";
    default:
      return "guestLecturer";
  }
}

/**
 * Picks the AccountRole driving the UI for someone who may hold several.
 *
 * Most-permissive-wins, matching RolesGuard on the backend — an academic can
 * be both a guest speaker and a unit coordinator.
 *
 * This decides which dashboard someone sees. It is not an authorisation
 * decision: the backend re-derives roles from the signed token on every
 * request and does not care what the browser concluded here.
 */
export function toAccountRole(roles: readonly AppRole[]): AccountRole | null {
  if (roles.includes("ccae_admin")) {
    return "admin";
  }
  if (roles.includes("unit_coordinator")) {
    return "coordinator";
  }
  if (roles.includes("guest_speaker")) {
    return "guest";
  }
  return null;
}

/** Human-readable label, matching the admin app's display strings. */
export function roleLabel(role: AppRole): string {
  switch (role) {
    case "ccae_admin":
      return "CCAE Administrator";
    case "unit_coordinator":
      return "Unit Coordinator";
    default:
      return "Guest Lecturer";
  }
}
