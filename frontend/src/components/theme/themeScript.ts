import { DEFAULT_THEME, SIGNED_IN_PATH_ROOTS, THEME_STORAGE_KEY } from "./themePolicy";

/**
 * Applies the theme for this page before the browser paints.
 *
 * Injected as a blocking inline script in the document head, which is
 * deliberate and is the one place it is the right call. React has not run at
 * this point, so anything that waits for hydration paints the default theme
 * first and then corrects itself: a white flash on every navigation for
 * somebody using dark mode, which is worse than the cost of a few lines
 * running before paint.
 *
 * Written as a string because it has to be inlined verbatim rather than
 * bundled. It follows the rules in themePolicy: a stored choice is read only
 * on a signed-in path, and every other page is set to light, so a public page
 * never paints dark.
 *
 * The attribute is always written. "system" is an explicit value, which the
 * stylesheet turns into dark only while the device prefers dark, so a person
 * who has chosen system and later changes their operating system setting is
 * followed without visiting again. With no attribute at all the page is light.
 */
export const themeScript = `
(function () {
  var theme = ${JSON.stringify(DEFAULT_THEME)};
  try {
    var path = location.pathname;
    var roots = ${JSON.stringify(SIGNED_IN_PATH_ROOTS)};
    for (var i = 0; i < roots.length; i++) {
      if (path === roots[i] || path.indexOf(roots[i] + "/") === 0) {
        var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
        if (stored === "dark" || stored === "system") {
          theme = stored;
        }
      }
    }
  } catch (error) {
    // Private browsing refuses storage. The page stays light, which is the
    // default; only the stored choice is lost, and that is not worth failing
    // a page render over.
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
`;
