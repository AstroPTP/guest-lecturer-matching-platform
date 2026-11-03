/**
 * Which theme a page gets.
 *
 * Pure and free of imports so that the inline script, the client code and the
 * tests all work from the same rules.
 *
 * Only the signed-in dashboards honour a stored choice. Every public page
 * (landing, sign in, sign up, and the rest) is always light, whatever is
 * stored and whatever the device prefers.
 */
export const THEME_STORAGE_KEY = "glmp.theme";

export type Theme = "light" | "system" | "dark";

/** What everyone sees until a signed-in user picks something else. */
export const DEFAULT_THEME: Theme = "light";

/**
 * The route trees that need a session. The proxy refuses these to anybody who
 * is not signed in, so a path under one of them is a signed-in page. Every
 * other path is public.
 */
export const SIGNED_IN_PATH_ROOTS = ["/guest_lecturer", "/unit_coordinator"] as const;

export function isSignedInPath(pathname: string): boolean {
  return SIGNED_IN_PATH_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(root + "/"),
  );
}

/** Reads a stored value, treating anything unrecognised as the default. */
export function parseTheme(stored: string | null | undefined): Theme {
  return stored === "light" || stored === "system" || stored === "dark"
    ? stored
    : DEFAULT_THEME;
}

/** The theme to apply on a page: the chosen one if signed in, otherwise light. */
export function themeForPath(pathname: string, chosen: Theme): Theme {
  return isSignedInPath(pathname) ? chosen : "light";
}
