import { THEME_STORAGE_KEY, parseTheme, themeForPath, type Theme } from "./themePolicy";

/** Browser only: reads and writes the stored choice and the page attribute. */

export function readStoredTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Private browsing refuses storage. The default is the right answer then.
    return parseTheme(null);
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage refused. applyTheme still themes this page; the choice is just
    // not remembered for the next visit.
  }
}

/**
 * Sets the theme attribute for a page.
 *
 * A public page is set to light whatever is stored, so this is also what puts
 * the page back to light when somebody leaves the dashboard without a full
 * page load, which the inline script in the document head cannot do.
 */
export function applyTheme(pathname: string, chosen: Theme = readStoredTheme()): void {
  document.documentElement.setAttribute("data-theme", themeForPath(pathname, chosen));
}
