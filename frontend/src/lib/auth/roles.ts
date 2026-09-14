import type { UserRole } from "@/types/shared/userRole";

/**
 * Where the project's role vocabularies meet.
 *
 * The names differ across the codebase, so they are reconciled here, in one
 * file, and a component never has to know more than one of them:
 *
 *   token claim (authority)   AccountRole    UserRole
 *   guest_speaker          →  guest       →  guestLecturer
 *   unit_coordinator       →  coordinator →  unitCoordinator
 *   ccae_admin             →  admin       →  ccaeAdmin
 *
 * The claim values are the authority. They are what the backend guard checks
 * and what the identity provider stores. Everything else is presentation.
 */

/** A role as the identity provider issues it. */
export type AppRole = "guest_speaker" | "unit_coordinator" | "ccae_admin";

/** A role as this application groups it, for choosing a dashboard. */
export type AccountRole = "guest" | "coordinator" | "admin";

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
 * Picks the role driving the UI for someone who may hold several.
 *
 * Most-permissive-wins, matching the backend's role guard. An academic can be
 * both a guest speaker and a unit coordinator.
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
