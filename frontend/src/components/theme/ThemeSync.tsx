"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme } from "./themeStorage";

/**
 * Re-applies the theme whenever the route changes.
 *
 * The root layout stays mounted across client-side navigation, so the inline
 * script in the document head runs once per full page load. Without this, a
 * signed-in user in dark mode who followed a link to a public page would keep
 * the dark theme there. A layout effect runs before the browser paints the new
 * route, so the switch back to light is not seen.
 */
export default function ThemeSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    applyTheme(pathname);
  }, [pathname]);

  return null;
}
