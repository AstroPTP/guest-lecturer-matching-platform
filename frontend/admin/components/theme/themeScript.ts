/**
 * Applies the stored theme before the browser paints.
 *
 * Injected as a blocking inline script in the document head, which is
 * deliberate and is the one place it is the right call. React has not run at
 * this point, so anything that waits for hydration paints the default theme
 * first and then corrects itself: a white flash on every navigation for
 * somebody using dark mode, which is worse than the cost of a few lines
 * running before paint.
 *
 * Written as a string because it has to be inlined verbatim rather than
 * bundled. Kept to what it must do: read one value, set one attribute.
 *
 * The key matches the one the student application uses, so a person who sets
 * dark there and opens the portal finds it already dark. The two run on
 * different ports in development and different subdomains in production, so
 * this only carries across where the origin is shared; it costs nothing where
 * it is not.
 *
 * "system" writes no attribute at all, leaving the media query in the
 * stylesheet to decide. That means a person who has chosen system and later
 * changes their operating system setting is followed without visiting again.
 */
export const THEME_STORAGE_KEY = "glmp.theme";

export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (error) {
    // Private browsing refuses storage. The media query still applies, so the
    // page is themed correctly for the system; only the stored override is
    // lost, and that is not worth failing a page render over.
  }
})();
`;
