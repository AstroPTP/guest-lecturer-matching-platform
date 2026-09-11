/**
 * Which dashboard a signed-in person sees.
 *
 * ccaeAdmin exists because the application has always had three roles while
 * this type carried two, so the administrator dashboard had no role to belong
 * to. The value matches the role name the identity provider puts in the token.
 */
export type UserRole = "guestLecturer" | "unitCoordinator" | "ccaeAdmin";
