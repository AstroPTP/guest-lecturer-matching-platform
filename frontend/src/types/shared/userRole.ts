/**
 * Which dashboard a signed-in person sees.
 *
 * ccaeAdmin was added for KAN-223: the RBAC matrix and SAS §2.5 have always
 * had three roles, but this type only carried two, so the admin dashboard had
 * no role to belong to.
 */
export type UserRole = "guestLecturer" | "unitCoordinator" | "ccaeAdmin";
